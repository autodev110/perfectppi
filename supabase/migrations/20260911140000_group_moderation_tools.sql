-- Group tools for Phase 1B (plan 13.4, 13.5, 13.7): pinned posts, search
-- within a group, member list, owner/moderator actions (remove a post from
-- the group, remove/ban members, assign moderators, transfer ownership,
-- archive), every action audited, and a "groups" notification category.
--
-- Destination moderation stays separate from platform moderation (13.7):
-- `group_removed` hides a post from the group and derived feeds without
-- touching its platform status, evidence, or the author's appeal rights.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'group_post_removed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'group_role_changed';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_posts
  ADD COLUMN group_pinned_at timestamptz,
  ADD COLUMN group_pinned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT community_posts_pin_requires_group CHECK (group_pinned_at IS NULL OR group_id IS NOT NULL);

CREATE INDEX community_posts_group_pinned_idx
  ON public.community_posts(group_id, group_pinned_at DESC)
  WHERE group_pinned_at IS NOT NULL;

CREATE TABLE public.community_group_moderation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  post_id uuid,
  action text NOT NULL CHECK (action IN (
    'post_pinned', 'post_unpinned', 'post_group_removed', 'post_group_restored',
    'member_removed', 'member_banned', 'member_unbanned', 'role_changed',
    'ownership_transferred', 'group_archived'
  )),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_group_moderation_events_group_idx
  ON public.community_group_moderation_events(group_id, created_at DESC);
ALTER TABLE public.community_group_moderation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_group_moderation_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.community_group_moderation_events TO service_role;

-- Notification category "groups" joins the optional set.
ALTER TABLE public.notification_preferences DROP CONSTRAINT notification_preferences_category_check;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_category_check
  CHECK (category IN ('social', 'groups', 'messages', 'marketplace', 'inspections', 'safety', 'account'));

CREATE OR REPLACE FUNCTION public.notification_category(p_type public.notification_type)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_type::text
    WHEN 'friend_request' THEN 'social'
    WHEN 'friend_request_accepted' THEN 'social'
    WHEN 'post_comment' THEN 'social'
    WHEN 'post_likes' THEN 'social'
    WHEN 'answer_accepted' THEN 'social'
    WHEN 'accepted_answer_unavailable' THEN 'social'
    WHEN 'group_post_removed' THEN 'groups'
    WHEN 'group_role_changed' THEN 'groups'
    WHEN 'message_received' THEN 'messages'
    WHEN 'listing_inspection_requested' THEN 'marketplace'
    WHEN 'tech_request_new' THEN 'inspections'
    WHEN 'tech_request_accepted' THEN 'inspections'
    WHEN 'inspection_submitted' THEN 'inspections'
    WHEN 'inspection_updated' THEN 'inspections'
    WHEN 'warranty_available' THEN 'inspections'
    WHEN 'payment_completed' THEN 'account'
    WHEN 'moderation_decision' THEN 'safety'
    WHEN 'moderation_case' THEN 'safety'
    WHEN 'report_received' THEN 'safety'
    ELSE 'account'
  END;
$$;

CREATE OR REPLACE FUNCTION public.notification_category_optional(p_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_category IN ('social', 'groups', 'messages', 'marketplace', 'inspections');
$$;

CREATE OR REPLACE FUNCTION public.list_notification_preferences(p_actor_profile_id uuid)
RETURNS TABLE(category text, in_app boolean, push boolean, locked boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT cat.category,
         COALESCE(pref.in_app, true),
         COALESCE(pref.push, true),
         NOT public.notification_category_optional(cat.category)
  FROM unnest(ARRAY['social', 'groups', 'messages', 'marketplace', 'inspections', 'safety', 'account']) AS cat(category)
  LEFT JOIN public.notification_preferences pref
    ON pref.profile_id = p_actor_profile_id AND pref.category = cat.category
  ORDER BY array_position(ARRAY['social', 'groups', 'messages', 'marketplace', 'inspections', 'safety', 'account'], cat.category);
$$;

-- ---------------------------------------------------------------------------
-- 2. Destination-state changes no longer require the author to still be a
--    member: a moderator must be able to remove a post from a group the
--    author already left. Membership is still required when a post enters a
--    group (INSERT, or group_id/author change).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_community_group_post()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
    -- Only the destination state changed (group moderation); the group
    -- itself must still exist.
    IF NOT EXISTS (SELECT 1 FROM public.community_groups community_group WHERE community_group.id = NEW.group_id) THEN
      RAISE EXCEPTION 'group unavailable';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_groups community_group
    WHERE community_group.id = NEW.group_id
      AND community_group.status = 'active'
      AND community_group.visibility = 'public'
      AND community_group.join_policy = 'open'
      AND community_group.is_staff_curated
  ) THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_group_memberships membership
    WHERE membership.group_id = NEW.group_id
      AND membership.profile_id = NEW.author_id
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active group membership required';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.community_group_role_of(p_profile_id uuid, p_group_id uuid)
RETURNS public.community_group_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.role
  FROM public.community_group_memberships membership
  WHERE membership.group_id = p_group_id
    AND membership.profile_id = p_profile_id
    AND membership.status = 'active';
$$;

CREATE FUNCTION public.community_group_require_moderator(p_actor_profile_id uuid, p_group_id uuid)
RETURNS public.community_group_role
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_role public.community_group_role;
BEGIN
  IF p_actor_profile_id IS NULL OR NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_groups community_group
    WHERE community_group.id = p_group_id AND community_group.status = 'active'
  ) THEN
    RAISE EXCEPTION 'group unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  v_role := public.community_group_role_of(p_actor_profile_id, p_group_id);
  IF v_role IS NULL OR v_role = 'member' THEN
    RAISE EXCEPTION 'group moderator access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_role;
END;
$$;

CREATE FUNCTION public.community_group_log(
  p_group_id uuid,
  p_actor_id uuid,
  p_action text,
  p_target_profile_id uuid DEFAULT NULL,
  p_post_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.community_group_moderation_events (
    group_id, actor_id, action, target_profile_id, post_id, reason, metadata
  ) VALUES (p_group_id, p_actor_id, p_action, p_target_profile_id, p_post_id, NULLIF(btrim(p_reason), ''), COALESCE(p_metadata, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- 4. Post tools: pin (max 3 per group) and destination removal (13.7)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_group_post_pinned(
  p_actor_profile_id uuid,
  p_post_id uuid,
  p_pinned boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.community_posts%ROWTYPE;
  v_pinned integer;
BEGIN
  SELECT * INTO v_post FROM public.community_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND OR v_post.group_id IS NULL THEN
    RAISE EXCEPTION 'post unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public.community_group_require_moderator(p_actor_profile_id, v_post.group_id);

  IF p_pinned THEN
    IF v_post.status <> 'active' OR v_post.moderation_status <> 'active' OR v_post.group_status <> 'active' THEN
      RAISE EXCEPTION 'only visible group posts can be pinned' USING ERRCODE = 'check_violation';
    END IF;
    IF v_post.group_pinned_at IS NOT NULL THEN
      RETURN jsonb_build_object('postId', p_post_id, 'pinned', true, 'changed', false);
    END IF;
    SELECT count(*) INTO v_pinned FROM public.community_posts
    WHERE group_id = v_post.group_id AND group_pinned_at IS NOT NULL;
    IF v_pinned >= 3 THEN
      RAISE EXCEPTION 'a group can pin at most three posts' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.community_posts
    SET group_pinned_at = now(), group_pinned_by = p_actor_profile_id
    WHERE id = p_post_id;
    PERFORM public.community_group_log(v_post.group_id, p_actor_profile_id, 'post_pinned', v_post.author_id, p_post_id);
  ELSE
    IF v_post.group_pinned_at IS NULL THEN
      RETURN jsonb_build_object('postId', p_post_id, 'pinned', false, 'changed', false);
    END IF;
    UPDATE public.community_posts
    SET group_pinned_at = NULL, group_pinned_by = NULL
    WHERE id = p_post_id;
    PERFORM public.community_group_log(v_post.group_id, p_actor_profile_id, 'post_unpinned', v_post.author_id, p_post_id);
  END IF;
  RETURN jsonb_build_object('postId', p_post_id, 'pinned', p_pinned, 'changed', true);
END;
$$;

CREATE FUNCTION public.set_group_post_destination(
  p_actor_profile_id uuid,
  p_post_id uuid,
  p_state public.community_group_post_status,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.community_posts%ROWTYPE;
  v_group public.community_groups%ROWTYPE;
BEGIN
  SELECT * INTO v_post FROM public.community_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND OR v_post.group_id IS NULL THEN
    RAISE EXCEPTION 'post unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public.community_group_require_moderator(p_actor_profile_id, v_post.group_id);
  SELECT * INTO v_group FROM public.community_groups WHERE id = v_post.group_id;

  IF v_post.group_status = p_state THEN
    RETURN jsonb_build_object('postId', p_post_id, 'groupStatus', p_state, 'changed', false);
  END IF;

  -- Platform state is untouched (13.7); only the destination changes, and a
  -- removed post loses its pin.
  UPDATE public.community_posts
  SET group_status = p_state,
      group_pinned_at = CASE WHEN p_state = 'active' THEN group_pinned_at ELSE NULL END,
      group_pinned_by = CASE WHEN p_state = 'active' THEN group_pinned_by ELSE NULL END
  WHERE id = p_post_id;

  PERFORM public.community_group_log(
    v_post.group_id, p_actor_profile_id,
    CASE WHEN p_state = 'active' THEN 'post_group_restored' ELSE 'post_group_removed' END,
    v_post.author_id, p_post_id, p_reason
  );

  IF p_state <> 'active' AND v_post.author_id <> p_actor_profile_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_post.author_id,
      'group_post_removed',
      'Post removed from ' || v_group.name,
      'A group moderator removed your post from ' || v_group.name || '. It is not a PerfectPPI policy decision and the post itself is unchanged.'
        || CASE WHEN NULLIF(btrim(p_reason), '') IS NOT NULL THEN ' Reason: ' || btrim(p_reason) ELSE '' END,
      jsonb_build_object('post_id', p_post_id, 'group_id', v_post.group_id, 'group_slug', v_group.slug)
    );
  END IF;

  RETURN jsonb_build_object('postId', p_post_id, 'groupStatus', p_state, 'changed', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Member tools (13.4): moderators remove members; owners ban/unban,
--    assign moderators, transfer ownership, and archive. Nobody acts on the
--    owner, nobody acts on themselves.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.set_group_member_status(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_target_profile_id uuid,
  p_status public.community_group_membership_status,
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
BEGIN
  v_actor_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF p_target_profile_id IS NULL OR p_target_profile_id = p_actor_profile_id THEN
    RAISE EXCEPTION 'invalid member' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status NOT IN ('active', 'removed', 'banned') THEN
    RAISE EXCEPTION 'invalid membership status' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status = 'banned' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'only the owner can ban' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_target FROM public.community_group_memberships
  WHERE group_id = p_group_id AND profile_id = p_target_profile_id FOR UPDATE;

  IF FOUND AND v_target.role = 'owner' THEN
    RAISE EXCEPTION 'the owner cannot be removed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF FOUND AND v_target.role = 'moderator' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'only the owner can act on moderators' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF FOUND AND v_target.status = p_status THEN
    RETURN jsonb_build_object('profileId', p_target_profile_id, 'status', p_status, 'changed', false);
  END IF;

  IF p_status = 'active' THEN
    -- Unban: the member may join again on their own; do not re-add them.
    IF NOT FOUND OR v_target.status <> 'banned' THEN
      RAISE EXCEPTION 'nothing to lift' USING ERRCODE = 'no_data_found';
    END IF;
    UPDATE public.community_group_memberships
    SET status = 'removed', updated_at = now()
    WHERE group_id = p_group_id AND profile_id = p_target_profile_id;
    PERFORM public.community_group_log(p_group_id, p_actor_profile_id, 'member_unbanned', p_target_profile_id, NULL, p_reason);
    RETURN jsonb_build_object('profileId', p_target_profile_id, 'status', 'removed', 'changed', true);
  END IF;

  IF NOT FOUND THEN
    IF p_status <> 'banned' THEN
      RAISE EXCEPTION 'not a member' USING ERRCODE = 'no_data_found';
    END IF;
    INSERT INTO public.community_group_memberships (group_id, profile_id, role, status)
    VALUES (p_group_id, p_target_profile_id, 'member', 'banned');
  ELSE
    UPDATE public.community_group_memberships
    SET status = p_status, role = 'member', updated_at = now()
    WHERE group_id = p_group_id AND profile_id = p_target_profile_id;
  END IF;

  -- Their pinned posts come down; their posts otherwise stay (13.6).
  UPDATE public.community_posts
  SET group_pinned_at = NULL, group_pinned_by = NULL
  WHERE group_id = p_group_id AND author_id = p_target_profile_id AND group_pinned_at IS NOT NULL;

  PERFORM public.community_group_log(
    p_group_id, p_actor_profile_id,
    CASE WHEN p_status = 'banned' THEN 'member_banned' ELSE 'member_removed' END,
    p_target_profile_id, NULL, p_reason
  );
  RETURN jsonb_build_object('profileId', p_target_profile_id, 'status', p_status, 'changed', true);
END;
$$;

CREATE FUNCTION public.set_group_member_role(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_target_profile_id uuid,
  p_role public.community_group_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role public.community_group_role;
  v_target public.community_group_memberships%ROWTYPE;
  v_group public.community_groups%ROWTYPE;
BEGIN
  v_actor_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'only the owner can assign roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_role NOT IN ('moderator', 'member') THEN
    RAISE EXCEPTION 'use transfer_group_ownership to change the owner' USING ERRCODE = 'check_violation';
  END IF;
  IF p_target_profile_id = p_actor_profile_id THEN
    RAISE EXCEPTION 'the owner cannot change their own role' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_target FROM public.community_group_memberships
  WHERE group_id = p_group_id AND profile_id = p_target_profile_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not an active member' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_target.role = p_role THEN
    RETURN jsonb_build_object('profileId', p_target_profile_id, 'role', p_role, 'changed', false);
  END IF;

  UPDATE public.community_group_memberships SET role = p_role, updated_at = now()
  WHERE group_id = p_group_id AND profile_id = p_target_profile_id;
  PERFORM public.community_group_log(p_group_id, p_actor_profile_id, 'role_changed', p_target_profile_id, NULL, NULL,
    jsonb_build_object('from', v_target.role, 'to', p_role));

  SELECT * INTO v_group FROM public.community_groups WHERE id = p_group_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_target_profile_id, 'group_role_changed',
    CASE WHEN p_role = 'moderator' THEN 'You are now a moderator of ' || v_group.name ELSE 'Your role in ' || v_group.name || ' changed' END,
    CASE WHEN p_role = 'moderator'
      THEN 'The group owner made you a moderator. You can pin posts, remove posts from the group, and remove members.'
      ELSE 'The group owner changed your role to member.' END,
    jsonb_build_object('group_id', p_group_id, 'group_slug', v_group.slug, 'role', p_role)
  );
  RETURN jsonb_build_object('profileId', p_target_profile_id, 'role', p_role, 'changed', true);
END;
$$;

CREATE FUNCTION public.transfer_group_ownership(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_new_owner_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role public.community_group_role;
  v_group public.community_groups%ROWTYPE;
BEGIN
  v_actor_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'only the owner can transfer ownership' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_new_owner_profile_id IS NULL OR p_new_owner_profile_id = p_actor_profile_id THEN
    RAISE EXCEPTION 'choose another member' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.social_profile_is_available(p_new_owner_profile_id) OR NOT EXISTS (
    SELECT 1 FROM public.community_group_memberships
    WHERE group_id = p_group_id AND profile_id = p_new_owner_profile_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'the new owner must be an active member' USING ERRCODE = 'no_data_found';
  END IF;

  -- The one-active-owner index is enforced per statement: step down first.
  UPDATE public.community_group_memberships SET role = 'moderator', updated_at = now()
  WHERE group_id = p_group_id AND profile_id = p_actor_profile_id;
  UPDATE public.community_group_memberships SET role = 'owner', updated_at = now()
  WHERE group_id = p_group_id AND profile_id = p_new_owner_profile_id;

  PERFORM public.community_group_log(p_group_id, p_actor_profile_id, 'ownership_transferred', p_new_owner_profile_id);
  SELECT * INTO v_group FROM public.community_groups WHERE id = p_group_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_new_owner_profile_id, 'group_role_changed',
    'You now own ' || v_group.name,
    'Ownership of the group was transferred to you. You manage roles, members, pins, and archiving.',
    jsonb_build_object('group_id', p_group_id, 'group_slug', v_group.slug, 'role', 'owner')
  );
  RETURN jsonb_build_object('groupId', p_group_id, 'ownerProfileId', p_new_owner_profile_id, 'changed', true);
END;
$$;

CREATE FUNCTION public.archive_group(p_actor_profile_id uuid, p_group_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role public.community_group_role;
BEGIN
  v_actor_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'only the owner can archive' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Posts and evidence are preserved; the group leaves normal use (13.4/13.6).
  UPDATE public.community_groups SET status = 'archived' WHERE id = p_group_id;
  PERFORM public.community_group_log(p_group_id, p_actor_profile_id, 'group_archived', NULL, NULL, p_reason);
  RETURN jsonb_build_object('groupId', p_group_id, 'status', 'archived', 'changed', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Reads: members, pinned posts, search
-- ---------------------------------------------------------------------------
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
  joined_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.id, profile.username, profile.display_name, profile.avatar_url, membership.role, membership.joined_at
  FROM public.community_group_memberships membership
  JOIN public.community_groups community_group ON community_group.id = membership.group_id
  JOIN public.profiles profile ON profile.id = membership.profile_id
  WHERE membership.group_id = p_group_id
    AND membership.status = 'active'
    AND p_viewer_id IS NOT NULL
    AND community_group.status = 'active'
    AND (community_group.visibility = 'public' OR public.community_group_role_of(p_viewer_id, p_group_id) IS NOT NULL)
    AND (profile.id = p_viewer_id OR public.social_can_view_profile(p_viewer_id, profile.id))
  ORDER BY CASE membership.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,
           membership.joined_at, profile.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE FUNCTION public.social_visible_community_group_pinned_post_ids(p_viewer_id uuid, p_group_id uuid)
RETURNS TABLE(post_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT post.id
  FROM public.community_posts post
  WHERE post.group_id = p_group_id
    AND post.group_pinned_at IS NOT NULL
    AND public.social_can_view_community_post(p_viewer_id, post.id, false)
  ORDER BY post.group_pinned_at DESC, post.id DESC
  LIMIT 3;
$$;

-- Chronological group posts now skip pinned ones (they render separately).
DROP FUNCTION public.social_visible_community_group_post_ids(uuid, uuid, integer, integer);
CREATE FUNCTION public.social_visible_community_group_post_ids(
  p_viewer_id uuid,
  p_group_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_exclude_pinned boolean DEFAULT true
)
RETURNS TABLE(post_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT post.id
  FROM public.community_posts post
  WHERE post.group_id = p_group_id
    AND (NOT p_exclude_pinned OR post.group_pinned_at IS NULL)
    AND public.social_can_view_community_post(p_viewer_id, post.id, false)
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

-- Search within a group (13.5). Case-insensitive substring over content;
-- visibility is applied to every hit, and LIKE metacharacters are literal.
CREATE FUNCTION public.search_group_posts(
  p_viewer_id uuid,
  p_group_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(post_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_q text := btrim(COALESCE(p_query, ''));
BEGIN
  IF p_viewer_id IS NULL OR length(v_q) < 2 OR length(v_q) > 100 THEN RETURN; END IF;
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  RETURN QUERY
  SELECT post.id
  FROM public.community_posts post
  WHERE post.group_id = p_group_id
    AND post.content ILIKE '%' || v_q || '%'
    AND public.social_can_view_community_post(p_viewer_id, post.id, false)
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants: everything is server-mediated.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.community_group_role_of(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_group_require_moderator(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_group_log(uuid, uuid, text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_group_post_pinned(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_group_post_destination(uuid, uuid, public.community_group_post_status, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_group_member_status(uuid, uuid, uuid, public.community_group_membership_status, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_group_member_role(uuid, uuid, uuid, public.community_group_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_group_ownership(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_group(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_group_members(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_visible_community_group_pinned_post_ids(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_visible_community_group_post_ids(uuid, uuid, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_group_posts(uuid, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_group_role_of(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_group_post_pinned(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_group_post_destination(uuid, uuid, public.community_group_post_status, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_group_member_status(uuid, uuid, uuid, public.community_group_membership_status, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_group_member_role(uuid, uuid, uuid, public.community_group_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_group_ownership(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_group(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_group_members(uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_visible_community_group_pinned_post_ids(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_visible_community_group_post_ids(uuid, uuid, integer, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_group_posts(uuid, uuid, text, integer, integer) TO service_role;

COMMIT;
