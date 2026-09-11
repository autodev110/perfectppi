-- Plan 13.4: the group Admin role and owner-safety rules.
--
-- Admin: membership and content management plus ordinary settings. Cannot
-- transfer ownership, archive the group, open the group up (visibility or
-- join policy less restrictive), assign or demote admins, or act on the
-- owner. Moderators keep post/comment tools and member removal.
--
-- Owner safety: there is always exactly one owner (existing unique index).
-- If the owner becomes unavailable (suspended, banned, deleted), new posts
-- and role changes freeze and the group waits for platform review, where a
-- moderator with the content_decide capability assigns a willing member as
-- owner or archives the group — both audited. Nobody is promoted
-- automatically. Account deletion is refused while the member still owns an
-- active group (API) and paused by the fulfillment worker as a backstop.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.community_group_visibility_rank(p_visibility public.community_group_visibility)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_visibility WHEN 'public' THEN 1 WHEN 'private' THEN 2 ELSE 3 END;
$$;

CREATE FUNCTION public.community_group_join_policy_rank(p_join_policy public.community_group_join_policy)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_join_policy WHEN 'open' THEN 1 WHEN 'request_approval' THEN 2 ELSE 3 END;
$$;

-- The active owner exists and is not suspended, banned, or deleted.
CREATE FUNCTION public.community_group_owner_available(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_group_memberships membership
    WHERE membership.group_id = p_group_id
      AND membership.role = 'owner'
      AND membership.status = 'active'
      AND public.social_profile_is_available(membership.profile_id)
  );
$$;

ALTER TABLE public.community_group_moderation_events
  DROP CONSTRAINT community_group_moderation_events_action_check;
ALTER TABLE public.community_group_moderation_events
  ADD CONSTRAINT community_group_moderation_events_action_check CHECK (action IN (
    'post_pinned', 'post_unpinned', 'post_group_removed', 'post_group_restored',
    'member_removed', 'member_banned', 'member_unbanned', 'role_changed',
    'ownership_transferred', 'group_archived', 'settings_changed',
    'request_approved', 'request_declined', 'member_invited',
    'platform_owner_assigned', 'platform_group_archived'
  ));

-- ---------------------------------------------------------------------------
-- 2. Member tools with the admin tier
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_group_member_status(
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
  IF p_status = 'banned' AND v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only the owner or an admin can ban' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_target FROM public.community_group_memberships
  WHERE group_id = p_group_id AND profile_id = p_target_profile_id FOR UPDATE;

  IF FOUND AND v_target.role = 'owner' THEN
    RAISE EXCEPTION 'the owner cannot be removed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF FOUND AND v_target.role = 'admin' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'only the owner can act on admins' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF FOUND AND v_target.role = 'moderator' AND v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only the owner or an admin can act on moderators' USING ERRCODE = 'insufficient_privilege';
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

-- Owner: admin / moderator / member. Admin: moderator / member, never touching
-- another admin. Frozen while the owner is unavailable.
CREATE OR REPLACE FUNCTION public.set_group_member_role(
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
  IF v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only the owner or an admin can assign roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_role NOT IN ('admin', 'moderator', 'member') THEN
    RAISE EXCEPTION 'use transfer_group_ownership to change the owner' USING ERRCODE = 'check_violation';
  END IF;
  IF p_role = 'admin' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'only the owner can assign admins' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_target_profile_id = p_actor_profile_id THEN
    RAISE EXCEPTION 'you cannot change your own role' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.community_group_owner_available(p_group_id) THEN
    RAISE EXCEPTION 'group under review' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_target FROM public.community_group_memberships
  WHERE group_id = p_group_id AND profile_id = p_target_profile_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not an active member' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_target.role = 'owner' THEN
    RAISE EXCEPTION 'use transfer_group_ownership to change the owner' USING ERRCODE = 'check_violation';
  END IF;
  IF v_target.role = 'admin' AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'only the owner can act on admins' USING ERRCODE = 'insufficient_privilege';
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
    CASE p_role
      WHEN 'admin' THEN 'You are now an admin of ' || v_group.name
      WHEN 'moderator' THEN 'You are now a moderator of ' || v_group.name
      ELSE 'Your role in ' || v_group.name || ' changed'
    END,
    CASE p_role
      WHEN 'admin' THEN 'You can manage members, moderators, posts, and ordinary settings.'
      WHEN 'moderator' THEN 'You can pin posts, remove posts from the group, and remove members.'
      ELSE 'Your role was changed to member.'
    END,
    jsonb_build_object('group_id', p_group_id, 'group_slug', v_group.slug, 'role', p_role)
  );
  RETURN jsonb_build_object('profileId', p_target_profile_id, 'role', p_role, 'changed', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Re-emitted readers/notifiers that enumerate moderator roles, the post
--    freeze, and admin-aware settings.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_group_membership(p_actor_profile_id uuid, p_group_id uuid, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  v_group public.community_groups%ROWTYPE;
  v_existing public.community_group_memberships;
  v_moderator uuid;
  v_pending integer;
  v_existing_notice uuid;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_group FROM public.community_groups WHERE id = p_group_id;
  IF NOT FOUND OR v_group.status <> 'active' OR NOT public.community_group_shell_visible(p_actor_profile_id, p_group_id) THEN
    RAISE EXCEPTION 'group unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_group.join_policy <> 'request_approval' THEN
    RAISE EXCEPTION USING
      MESSAGE = CASE WHEN v_group.join_policy = 'open' THEN 'group_is_open' ELSE 'group_invite_only' END,
      ERRCODE = 'check_violation';
  END IF;

  -- A request must have at least one moderator who is permitted to review it.
  -- This prevents blocks from being bypassed through group notifications and
  -- avoids creating requests that are invisible to every moderator.
  IF NOT EXISTS (
    SELECT 1
    FROM public.community_group_memberships membership
    WHERE membership.group_id = p_group_id
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'admin', 'moderator')
      AND public.social_can_view_profile(membership.profile_id, p_actor_profile_id)
  ) THEN
    RAISE EXCEPTION 'group unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_existing FROM public.community_group_memberships
  WHERE group_id = p_group_id AND profile_id = p_actor_profile_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status = 'banned' THEN
      RAISE EXCEPTION 'group unavailable' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_existing.status = 'active' THEN
      RETURN jsonb_build_object('status', 'active', 'changed', false);
    END IF;
    IF v_existing.status = 'requested' THEN
      RETURN jsonb_build_object('status', 'requested', 'changed', false);
    END IF;
    IF v_existing.status = 'invited' THEN
      -- Already invited: accept instead.
      PERFORM public.join_curated_community_group(p_actor_profile_id, p_group_id);
      RETURN jsonb_build_object('status', 'active', 'changed', true);
    END IF;
    -- Declined recently: quiet cooldown so a moderator is not re-asked daily.
    IF v_existing.status = 'removed' AND v_existing.decided_at IS NOT NULL
       AND v_existing.decided_at > now() - interval '7 days' THEN
      RAISE EXCEPTION 'group_request_cooldown' USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  INSERT INTO public.community_group_memberships (group_id, profile_id, role, status, requested_at, request_message)
  VALUES (p_group_id, p_actor_profile_id, 'member', 'requested', now(), NULLIF(btrim(p_message), ''))
  ON CONFLICT (group_id, profile_id) DO UPDATE
    SET status = 'requested', role = 'member', requested_at = now(),
        request_message = NULLIF(btrim(p_message), ''), decided_by = NULL, decided_at = NULL, updated_at = now();

  -- One aggregated notice per group per day for each moderator (22.2).
  -- Counts are viewer-specific so blocked profiles are not disclosed.
  FOR v_moderator IN
    SELECT membership.profile_id FROM public.community_group_memberships membership
    WHERE membership.group_id = p_group_id AND membership.status = 'active'
      AND membership.role IN ('owner', 'admin', 'moderator')
      AND public.social_can_view_profile(membership.profile_id, p_actor_profile_id)
  LOOP
    SELECT count(*) INTO v_pending
    FROM public.community_group_memberships pending
    WHERE pending.group_id = p_group_id
      AND pending.status = 'requested'
      AND public.social_can_view_profile(v_moderator, pending.profile_id);

    SELECT id INTO v_existing_notice FROM public.notifications
    WHERE user_id = v_moderator AND type = 'group_join_request' AND read_at IS NULL
      AND data->>'group_id' = p_group_id::text
      AND (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
    ORDER BY created_at DESC LIMIT 1;
    IF v_existing_notice IS NOT NULL THEN
      UPDATE public.notifications
      SET title = v_pending || ' pending request' || CASE WHEN v_pending = 1 THEN '' ELSE 's' END || ' for ' || v_group.name,
          body = 'Members are waiting to join ' || v_group.name || '. Review them in the group.',
          data = data || jsonb_build_object('pending', v_pending),
          created_at = now()
      WHERE id = v_existing_notice;
    ELSE
      PERFORM public.group_notify(
        v_moderator, 'group_join_request',
        'New request to join ' || v_group.name,
        public.notification_actor_label(p_actor_profile_id) || ' asked to join ' || v_group.name || '.',
        jsonb_build_object('group_id', p_group_id, 'group_slug', v_group.slug, 'pending', v_pending)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status', 'requested', 'changed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.member_activity_badges(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'unreadNotifications', (
      SELECT count(*) FROM public.notifications notification
      WHERE notification.user_id = p_profile_id AND notification.read_at IS NULL
    ),
    'pendingFriendRequests', (
      SELECT count(*)
      FROM public.friend_relationships rel
      WHERE rel.status = 'pending'
        AND p_profile_id IN (rel.profile_low_id, rel.profile_high_id)
        AND rel.requested_by <> p_profile_id
        AND public.social_can_view_profile(p_profile_id, rel.requested_by)
    ),
    'unreadMessages', (
      SELECT count(*)
      FROM public.messages message
      JOIN public.conversation_participants participant
        ON participant.conversation_id = message.conversation_id
       AND participant.profile_id = p_profile_id
      WHERE message.status = 'unread'
        AND message.sender_id <> p_profile_id
    ),
    'pendingGroupRequests', (
      SELECT count(*)
      FROM public.community_group_memberships pending
      JOIN public.community_group_memberships moderator
        ON moderator.group_id = pending.group_id
       AND moderator.profile_id = p_profile_id
       AND moderator.status = 'active'
       AND moderator.role IN ('owner', 'admin', 'moderator')
      JOIN public.community_groups community_group ON community_group.id = pending.group_id
      WHERE pending.status = 'requested' AND community_group.status = 'active'
        AND public.social_can_view_profile(p_profile_id, pending.profile_id)
    ),
    'groupInvitations', (
      SELECT count(*) FROM public.community_group_memberships membership
      JOIN public.community_groups community_group ON community_group.id = membership.group_id
      WHERE membership.profile_id = p_profile_id AND membership.status = 'invited'
        AND community_group.status = 'active'
        AND (
          membership.invited_by IS NULL
          OR public.social_can_view_profile(p_profile_id, membership.invited_by)
        )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.list_group_members(p_viewer_id uuid, p_group_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(profile_id uuid, username text, display_name text, avatar_url text, role community_group_role, joined_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $$
  SELECT profile.id, profile.username, profile.display_name, profile.avatar_url, membership.role, membership.joined_at
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

CREATE OR REPLACE FUNCTION public.guard_community_group_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $$
DECLARE
  v_group public.community_groups%ROWTYPE;
  v_role public.community_group_role;
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

  SELECT * INTO v_group FROM public.community_groups WHERE id = NEW.group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id
     AND NEW.author_id IS NOT DISTINCT FROM OLD.author_id THEN
    RETURN NEW;
  END IF;

  IF v_group.status <> 'active' THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;
  -- Owner suspended/banned/deleted: new posts freeze until platform review
  -- assigns an owner or archives the group (13.4).
  IF NOT public.community_group_owner_available(NEW.group_id) THEN
    RAISE EXCEPTION 'group under review';
  END IF;

  SELECT membership.role INTO v_role
  FROM public.community_group_memberships membership
  WHERE membership.group_id = NEW.group_id
    AND membership.profile_id = NEW.author_id
    AND membership.status = 'active';
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'active group membership required';
  END IF;
  IF v_group.posting_policy = 'moderators' AND v_role = 'member' THEN
    RAISE EXCEPTION 'only group moderators can post here';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_community_group_settings(p_actor_profile_id uuid, p_group_id uuid, p_name text, p_description text, p_category text, p_rules text[], p_vehicle_make text, p_vehicle_model text, p_year_start integer, p_year_end integer, p_location_region text, p_posting_policy text, p_visibility public.community_group_visibility DEFAULT NULL, p_join_policy public.community_group_join_policy DEFAULT NULL)
 RETURNS public.community_groups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  v_role public.community_group_role;
  v_group public.community_groups;
  v_before public.community_groups;
  v_visibility public.community_group_visibility;
  v_join public.community_group_join_policy;
BEGIN
  v_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only the owner or an admin can change group settings' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_posting_policy NOT IN ('members', 'moderators') THEN
    RAISE EXCEPTION 'invalid posting policy' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before FROM public.community_groups WHERE id = p_group_id FOR UPDATE;
  v_visibility := COALESCE(p_visibility, v_before.visibility);
  v_join := COALESCE(p_join_policy, v_before.join_policy);
  IF NOT public.community_group_policy_allowed(v_visibility, v_join) THEN
    RAISE EXCEPTION 'group_policy_not_allowed' USING ERRCODE = 'check_violation';
  END IF;
  -- Admins keep ordinary settings but cannot open the group up (13.4).
  IF v_role = 'admin' AND (
    public.community_group_visibility_rank(v_visibility) < public.community_group_visibility_rank(v_before.visibility)
    OR public.community_group_join_policy_rank(v_join) < public.community_group_join_policy_rank(v_before.join_policy)
  ) THEN
    RAISE EXCEPTION 'group_policy_owner_only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.community_groups
  SET name = btrim(p_name),
      description = btrim(p_description),
      category = p_category,
      rules = COALESCE(p_rules, ARRAY[]::text[]),
      vehicle_make = NULLIF(btrim(p_vehicle_make), ''),
      vehicle_model = NULLIF(btrim(p_vehicle_model), ''),
      year_start = p_year_start,
      year_end = p_year_end,
      location_region = NULLIF(btrim(p_location_region), ''),
      posting_policy = p_posting_policy,
      visibility = v_visibility,
      join_policy = v_join
  WHERE id = p_group_id
  RETURNING * INTO v_group;

  -- Pending requests are moot once the group opens; leave invitations alone.
  IF v_join = 'open' AND v_before.join_policy <> 'open' THEN
    UPDATE public.community_group_memberships
    SET status = 'active', joined_at = now(), decided_at = now(), request_message = NULL, updated_at = now()
    WHERE group_id = p_group_id AND status = 'requested';
  END IF;

  PERFORM public.community_group_log(
    p_group_id, p_actor_profile_id, 'settings_changed', NULL, NULL, NULL,
    jsonb_build_object(
      'name', jsonb_build_array(v_before.name, v_group.name),
      'category', jsonb_build_array(v_before.category, v_group.category),
      'posting_policy', jsonb_build_array(v_before.posting_policy, v_group.posting_policy),
      'visibility', jsonb_build_array(v_before.visibility, v_group.visibility),
      'join_policy', jsonb_build_array(v_before.join_policy, v_group.join_policy)
    )
  );
  RETURN v_group;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Platform review (13.4): assign an owner or archive with the
--    content_decide capability, always audited.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.list_groups_needing_platform_review()
RETURNS TABLE(group_id uuid, slug text, name text, reason text, active_member_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT community_group.id, community_group.slug, community_group.name,
         CASE WHEN owner_membership.profile_id IS NULL THEN 'missing_owner' ELSE 'owner_unavailable' END,
         (SELECT count(*) FROM public.community_group_memberships member
          WHERE member.group_id = community_group.id AND member.status = 'active')
  FROM public.community_groups community_group
  LEFT JOIN public.community_group_memberships owner_membership
    ON owner_membership.group_id = community_group.id
   AND owner_membership.role = 'owner'
   AND owner_membership.status = 'active'
  WHERE community_group.status = 'active'
    AND (owner_membership.profile_id IS NULL OR NOT public.social_profile_is_available(owner_membership.profile_id))
  ORDER BY community_group.created_at;
$$;

CREATE FUNCTION public.platform_assign_group_owner(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_new_owner_profile_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.community_groups%ROWTYPE;
  v_previous_owner uuid;
BEGIN
  IF NOT public.moderation_has_capability(p_actor_profile_id, 'content_decide') THEN
    RAISE EXCEPTION 'moderation capability required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'a reason is required' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_group FROM public.community_groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND OR v_group.status <> 'active' THEN
    RAISE EXCEPTION 'group unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  IF public.community_group_owner_available(p_group_id) THEN
    RAISE EXCEPTION 'the group already has an available owner' USING ERRCODE = 'check_violation';
  END IF;
  IF p_new_owner_profile_id IS NULL OR NOT public.social_profile_is_available(p_new_owner_profile_id) OR NOT EXISTS (
    SELECT 1 FROM public.community_group_memberships
    WHERE group_id = p_group_id AND profile_id = p_new_owner_profile_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'the new owner must be an available active member' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT profile_id INTO v_previous_owner FROM public.community_group_memberships
  WHERE group_id = p_group_id AND role = 'owner' AND status = 'active';
  -- The previous owner keeps membership history but no role; one owner only.
  UPDATE public.community_group_memberships SET role = 'member', updated_at = now()
  WHERE group_id = p_group_id AND role = 'owner';
  UPDATE public.community_group_memberships SET role = 'owner', updated_at = now()
  WHERE group_id = p_group_id AND profile_id = p_new_owner_profile_id;

  PERFORM public.community_group_log(
    p_group_id, p_actor_profile_id, 'platform_owner_assigned', p_new_owner_profile_id, NULL, p_reason,
    jsonb_build_object('previous_owner', v_previous_owner)
  );
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_new_owner_profile_id, 'group_role_changed',
    'You now own ' || v_group.name,
    'PerfectPPI assigned you as the owner because the previous owner is no longer available.',
    jsonb_build_object('group_id', p_group_id, 'group_slug', v_group.slug, 'role', 'owner')
  );
  RETURN jsonb_build_object('groupId', p_group_id, 'ownerProfileId', p_new_owner_profile_id, 'changed', true);
END;
$$;

CREATE FUNCTION public.platform_archive_group(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.moderation_has_capability(p_actor_profile_id, 'content_decide') THEN
    RAISE EXCEPTION 'moderation capability required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'a reason is required' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_groups WHERE id = p_group_id AND status = 'active') THEN
    RAISE EXCEPTION 'group unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE public.community_groups SET status = 'archived' WHERE id = p_group_id;
  PERFORM public.community_group_log(p_group_id, p_actor_profile_id, 'platform_group_archived', NULL, NULL, p_reason);
  RETURN jsonb_build_object('groupId', p_group_id, 'status', 'archived', 'changed', true);
END;
$$;

-- Groups the member still owns; account deletion waits for a transfer or
-- archive (13.4).
CREATE FUNCTION public.list_owned_active_groups(p_profile_id uuid)
RETURNS TABLE(group_id uuid, slug text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT community_group.id, community_group.slug, community_group.name
  FROM public.community_group_memberships membership
  JOIN public.community_groups community_group ON community_group.id = membership.group_id
  WHERE membership.profile_id = p_profile_id
    AND membership.role = 'owner'
    AND membership.status = 'active'
    AND community_group.status = 'active'
  ORDER BY community_group.name;
$$;

REVOKE ALL ON FUNCTION public.community_group_visibility_rank(public.community_group_visibility) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_group_join_policy_rank(public.community_group_join_policy) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_group_owner_available(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_groups_needing_platform_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_assign_group_owner(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_archive_group(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_owned_active_groups(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_group_owner_available(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_groups_needing_platform_review() TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_assign_group_owner(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_archive_group(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_owned_active_groups(uuid) TO service_role;

COMMIT;
