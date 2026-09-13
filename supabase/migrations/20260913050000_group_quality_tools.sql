BEGIN;

-- Plan 26.2: group quality controls. Existing members are grandfathered into
-- the current rules; members who join later must acknowledge non-empty rules
-- before their first post. Enforcement lives in the post trigger so text,
-- media, event, web, and iOS creation paths cannot bypass it.
ALTER TABLE public.community_groups
  ADD COLUMN slow_mode_seconds integer NOT NULL DEFAULT 0
    CHECK (slow_mode_seconds IN (0, 30, 60, 300, 900, 3600, 21600, 86400)),
  ADD COLUMN rules_version integer NOT NULL DEFAULT 1 CHECK (rules_version > 0);

ALTER TABLE public.community_group_memberships
  ADD COLUMN rules_acknowledged_version integer NOT NULL DEFAULT 0 CHECK (rules_acknowledged_version >= 0),
  ADD COLUMN rules_acknowledged_at timestamptz,
  ADD COLUMN posting_restricted_until timestamptz,
  ADD COLUMN posting_restriction_reason text
    CHECK (posting_restriction_reason IS NULL OR char_length(btrim(posting_restriction_reason)) BETWEEN 1 AND 300);

UPDATE public.community_group_memberships membership
SET rules_acknowledged_version = community_group.rules_version,
    rules_acknowledged_at = now()
FROM public.community_groups community_group
WHERE community_group.id = membership.group_id
  AND membership.status = 'active';

CREATE INDEX community_group_memberships_restriction_idx
  ON public.community_group_memberships(group_id, posting_restricted_until)
  WHERE posting_restricted_until IS NOT NULL;

CREATE FUNCTION public.bump_community_group_rules_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.rules IS DISTINCT FROM OLD.rules THEN
    NEW.rules_version := OLD.rules_version + 1;
  ELSIF NEW.rules_version IS DISTINCT FROM OLD.rules_version THEN
    RAISE EXCEPTION 'rules version is managed automatically' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_groups_rules_version
  BEFORE UPDATE OF rules, rules_version ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.bump_community_group_rules_version();

ALTER TABLE public.community_group_moderation_events
  DROP CONSTRAINT community_group_moderation_events_action_check;
ALTER TABLE public.community_group_moderation_events
  ADD CONSTRAINT community_group_moderation_events_action_check CHECK (action IN (
    'post_pinned', 'post_unpinned', 'post_group_removed', 'post_group_restored',
    'member_removed', 'member_banned', 'member_unbanned', 'role_changed',
    'ownership_transferred', 'group_archived', 'settings_changed',
    'request_approved', 'request_declined', 'member_invited',
    'platform_owner_assigned', 'platform_group_archived',
    'slow_mode_changed', 'member_posting_restricted', 'member_posting_restored',
    'faq_created', 'faq_updated', 'faq_deleted'
  ));

CREATE FUNCTION public.acknowledge_community_group_rules(
  p_actor_profile_id uuid,
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.community_groups%ROWTYPE;
  v_membership public.community_group_memberships%ROWTYPE;
BEGIN
  SELECT * INTO v_group FROM public.community_groups
  WHERE id = p_group_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'group unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_membership FROM public.community_group_memberships
  WHERE group_id = p_group_id AND profile_id = p_actor_profile_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active group membership required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_membership.rules_acknowledged_version >= v_group.rules_version THEN
    RETURN jsonb_build_object('changed', false, 'rulesVersion', v_group.rules_version);
  END IF;
  UPDATE public.community_group_memberships
  SET rules_acknowledged_version = v_group.rules_version,
      rules_acknowledged_at = now(),
      updated_at = now()
  WHERE group_id = p_group_id AND profile_id = p_actor_profile_id;
  RETURN jsonb_build_object('changed', true, 'rulesVersion', v_group.rules_version);
END;
$$;

CREATE FUNCTION public.set_community_group_slow_mode(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.community_group_role;
  v_before integer;
BEGIN
  v_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF p_seconds IS NULL OR p_seconds NOT IN (0, 30, 60, 300, 900, 3600, 21600, 86400) THEN
    RAISE EXCEPTION 'invalid slow mode' USING ERRCODE = 'check_violation';
  END IF;
  SELECT slow_mode_seconds INTO v_before FROM public.community_groups
  WHERE id = p_group_id FOR UPDATE;
  IF v_before = p_seconds THEN
    RETURN jsonb_build_object('changed', false, 'slowModeSeconds', p_seconds);
  END IF;
  UPDATE public.community_groups SET slow_mode_seconds = p_seconds WHERE id = p_group_id;
  PERFORM public.community_group_log(
    p_group_id, p_actor_profile_id, 'slow_mode_changed', NULL, NULL, NULL,
    jsonb_build_object('from', v_before, 'to', p_seconds)
  );
  RETURN jsonb_build_object('changed', true, 'slowModeSeconds', p_seconds);
END;
$$;

CREATE FUNCTION public.set_group_member_posting_restriction(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_target_profile_id uuid,
  p_restricted_until timestamptz,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role public.community_group_role;
  v_target public.community_group_memberships%ROWTYPE;
  v_until timestamptz;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  v_actor_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF p_target_profile_id IS NULL OR p_target_profile_id = p_actor_profile_id THEN
    RAISE EXCEPTION 'invalid member' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_target FROM public.community_group_memberships
  WHERE group_id = p_group_id AND profile_id = p_target_profile_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_target.role = 'owner'
     OR (v_target.role = 'admin' AND v_actor_role <> 'owner')
     OR (v_target.role = 'moderator' AND v_actor_role = 'moderator') THEN
    RAISE EXCEPTION 'you cannot restrict this member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'restriction reason is too long' USING ERRCODE = 'check_violation';
  END IF;

  v_until := CASE WHEN p_restricted_until IS NULL OR p_restricted_until <= now() THEN NULL ELSE p_restricted_until END;
  IF v_until IS NOT NULL AND v_until > now() + interval '30 days' THEN
    RAISE EXCEPTION 'posting restrictions may last up to 30 days' USING ERRCODE = 'check_violation';
  END IF;
  IF v_until IS NOT NULL AND v_reason IS NULL THEN
    RAISE EXCEPTION 'a posting restriction needs a reason' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.community_group_memberships
  SET posting_restricted_until = v_until,
      posting_restriction_reason = CASE WHEN v_until IS NULL THEN NULL ELSE v_reason END,
      updated_at = now()
  WHERE group_id = p_group_id AND profile_id = p_target_profile_id;

  PERFORM public.community_group_log(
    p_group_id, p_actor_profile_id,
    CASE WHEN v_until IS NULL THEN 'member_posting_restored' ELSE 'member_posting_restricted' END,
    p_target_profile_id, NULL, v_reason,
    jsonb_build_object('restricted_until', v_until)
  );
  RETURN jsonb_build_object(
    'changed', true,
    'profileId', p_target_profile_id,
    'postingRestrictedUntil', v_until
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_community_group_post()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group public.community_groups%ROWTYPE;
  v_membership public.community_group_memberships%ROWTYPE;
  v_last_post_at timestamptz;
  v_retry_seconds integer;
BEGIN
  IF NEW.group_id IS NULL THEN
    IF NEW.group_status <> 'active' THEN
      RAISE EXCEPTION 'non-group post cannot have a group removal state';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.audience <> 'public' THEN
    RAISE EXCEPTION 'launch group posts must use the public group audience';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id
     AND NEW.author_id IS NOT DISTINCT FROM OLD.author_id THEN
    RETURN NEW;
  END IF;

  -- Serializes all creation paths for this member/group pair. This prevents
  -- concurrent requests from both observing that slow mode has elapsed.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.group_id::text || ':' || NEW.author_id::text, 0));
  SELECT * INTO v_group FROM public.community_groups WHERE id = NEW.group_id;
  IF NOT FOUND OR v_group.status <> 'active' THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;
  IF NOT public.community_group_owner_available(NEW.group_id) THEN
    RAISE EXCEPTION 'group under review';
  END IF;
  SELECT * INTO v_membership FROM public.community_group_memberships membership
  WHERE membership.group_id = NEW.group_id
    AND membership.profile_id = NEW.author_id
    AND membership.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active group membership required';
  END IF;
  IF v_group.posting_policy = 'moderators' AND v_membership.role = 'member' THEN
    RAISE EXCEPTION 'only group moderators can post here';
  END IF;
  IF v_membership.posting_restricted_until > now() THEN
    RAISE EXCEPTION 'group posting restricted until %', v_membership.posting_restricted_until;
  END IF;
  IF cardinality(v_group.rules) > 0
     AND v_membership.rules_acknowledged_version < v_group.rules_version THEN
    RAISE EXCEPTION 'group rules acknowledgement required';
  END IF;
  IF v_group.slow_mode_seconds > 0 THEN
    SELECT max(post.created_at) INTO v_last_post_at
    FROM public.community_posts post
    WHERE post.group_id = NEW.group_id AND post.author_id = NEW.author_id;
    IF v_last_post_at IS NOT NULL
       AND v_last_post_at + make_interval(secs => v_group.slow_mode_seconds) > now() THEN
      v_retry_seconds := greatest(1, ceil(extract(epoch FROM (
        v_last_post_at + make_interval(secs => v_group.slow_mode_seconds) - now()
      )))::integer);
      RAISE EXCEPTION 'group slow mode active; retry after % seconds', v_retry_seconds;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION public.list_group_members(uuid, uuid, integer, integer);
CREATE FUNCTION public.list_group_members(
  p_viewer_id uuid,
  p_group_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  role public.community_group_role,
  joined_at timestamptz,
  posting_restricted_until timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.id, profile.username, profile.display_name, profile.avatar_url,
         membership.role, membership.joined_at,
         CASE WHEN public.community_group_role_of(p_viewer_id, p_group_id) IS NOT NULL
              AND public.community_group_role_of(p_viewer_id, p_group_id) <> 'member'
              THEN membership.posting_restricted_until ELSE NULL END
  FROM public.community_group_memberships membership
  JOIN public.profiles profile ON profile.id = membership.profile_id
  WHERE membership.group_id = p_group_id
    AND membership.status = 'active'
    AND p_viewer_id IS NOT NULL
    AND public.community_group_content_visible(p_viewer_id, p_group_id)
    AND (profile.id = p_viewer_id OR public.social_can_view_profile(p_viewer_id, profile.id))
  ORDER BY CASE membership.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,
           membership.joined_at, profile.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Searchable FAQ resources may be written manually or copied from a
-- question's accepted answer. The copied text remains a stable resource if
-- the source post later changes or is removed from the group.
CREATE TABLE public.community_group_faq_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 3 AND 200),
  answer text NOT NULL CHECK (char_length(btrim(answer)) BETWEEN 3 AND 2000),
  source_post_id uuid REFERENCES public.community_posts(id) ON DELETE SET NULL,
  source_comment_id uuid REFERENCES public.community_comments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, source_post_id)
);
CREATE INDEX community_group_faq_entries_group_updated_idx
  ON public.community_group_faq_entries(group_id, updated_at DESC, id DESC);
CREATE TRIGGER community_group_faq_entries_updated_at
  BEFORE UPDATE ON public.community_group_faq_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.community_group_faq_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_group_faq_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_group_faq_entries TO service_role;

CREATE FUNCTION public.upsert_community_group_faq(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_entry_id uuid DEFAULT NULL,
  p_question text DEFAULT NULL,
  p_answer text DEFAULT NULL,
  p_source_post_id uuid DEFAULT NULL
)
RETURNS public.community_group_faq_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.community_group_role;
  v_entry public.community_group_faq_entries;
  v_source public.community_posts%ROWTYPE;
  v_answer text;
  v_question text;
  v_action text;
BEGIN
  v_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF p_source_post_id IS NOT NULL THEN
    SELECT * INTO v_source FROM public.community_posts
    WHERE id = p_source_post_id AND group_id = p_group_id
      AND post_type = 'question' AND accepted_answer_comment_id IS NOT NULL
      AND status = 'active' AND moderation_status = 'active' AND group_status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'accepted answer unavailable' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT content INTO v_answer FROM public.community_comments
    WHERE id = v_source.accepted_answer_comment_id AND post_id = v_source.id
      AND status = 'active' AND moderation_status = 'active';
    IF v_answer IS NULL THEN
      RAISE EXCEPTION 'accepted answer unavailable' USING ERRCODE = 'no_data_found';
    END IF;
    v_question := left(btrim(v_source.content), 200);
    v_answer := left(btrim(v_answer), 2000);
  ELSE
    v_question := btrim(COALESCE(p_question, ''));
    v_answer := btrim(COALESCE(p_answer, ''));
  END IF;
  IF char_length(v_question) NOT BETWEEN 3 AND 200 OR char_length(v_answer) NOT BETWEEN 3 AND 2000 THEN
    RAISE EXCEPTION 'faq question or answer is out of range' USING ERRCODE = 'check_violation';
  END IF;

  IF p_entry_id IS NULL THEN
    INSERT INTO public.community_group_faq_entries (
      group_id, question, answer, source_post_id, source_comment_id, created_by, updated_by
    ) VALUES (
      p_group_id, v_question, v_answer, p_source_post_id,
      CASE WHEN p_source_post_id IS NULL THEN NULL ELSE v_source.accepted_answer_comment_id END,
      p_actor_profile_id, p_actor_profile_id
    ) RETURNING * INTO v_entry;
    v_action := 'faq_created';
  ELSE
    UPDATE public.community_group_faq_entries
    SET question = v_question, answer = v_answer, updated_by = p_actor_profile_id
    WHERE id = p_entry_id AND group_id = p_group_id
    RETURNING * INTO v_entry;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'faq unavailable' USING ERRCODE = 'no_data_found';
    END IF;
    v_action := 'faq_updated';
  END IF;
  PERFORM public.community_group_log(
    p_group_id, p_actor_profile_id, v_action, NULL, p_source_post_id, NULL,
    jsonb_build_object('faq_id', v_entry.id)
  );
  RETURN v_entry;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'accepted answer already in faq' USING ERRCODE = 'unique_violation';
END;
$$;

CREATE FUNCTION public.delete_community_group_faq(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_entry_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.community_group_role;
BEGIN
  v_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  DELETE FROM public.community_group_faq_entries
  WHERE id = p_entry_id AND group_id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'faq unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public.community_group_log(
    p_group_id, p_actor_profile_id, 'faq_deleted', NULL, NULL, NULL,
    jsonb_build_object('faq_id', p_entry_id)
  );
  RETURN true;
END;
$$;

CREATE FUNCTION public.list_community_group_faq(
  p_viewer_id uuid,
  p_group_id uuid,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.community_group_faq_entries
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_query text := btrim(COALESCE(p_query, ''));
BEGIN
  IF p_viewer_id IS NULL OR NOT public.community_group_content_visible(p_viewer_id, p_group_id) THEN
    RETURN;
  END IF;
  IF char_length(v_query) > 100 THEN
    RAISE EXCEPTION 'faq query is too long' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY
  SELECT faq.* FROM public.community_group_faq_entries faq
  WHERE faq.group_id = p_group_id
    AND (v_query = '' OR strpos(lower(faq.question), lower(v_query)) > 0
      OR strpos(lower(faq.answer), lower(v_query)) > 0)
  ORDER BY faq.updated_at DESC, faq.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_community_group_rules(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_community_group_slow_mode(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_group_member_posting_restriction(uuid, uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_group_members(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_community_group_faq(uuid, uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_community_group_faq(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_community_group_faq(uuid, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_community_group_rules(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_community_group_slow_mode(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_group_member_posting_restriction(uuid, uuid, uuid, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_group_members(uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_community_group_faq(uuid, uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_community_group_faq(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_community_group_faq(uuid, uuid, text, integer, integer) TO service_role;

COMMIT;
