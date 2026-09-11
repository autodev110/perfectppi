-- Phase 1C, second slice: private and unlisted groups, request-approval and
-- invite-only joining, invitations (plan 13.3, 13.6, 22.1).
--
-- Membership states: none · requested · invited · active · removed · banned
-- (13.3). Group content follows visibility: public → any signed-in member;
-- private/unlisted → active members only. Unlisted groups stay out of the
-- directory and are reached by direct link. Private group content never
-- leaks through profiles, vehicles, search, or notification previews because
-- every read still funnels through social_can_view_community_post.

ALTER TYPE public.community_group_membership_status ADD VALUE IF NOT EXISTS 'requested';
ALTER TYPE public.community_group_membership_status ADD VALUE IF NOT EXISTS 'invited';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'group_invitation';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'group_join_request';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'group_join_decision';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_group_memberships
  ADD COLUMN invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN requested_at timestamptz,
  ADD COLUMN request_message text CHECK (request_message IS NULL OR char_length(request_message) <= 300),
  ADD COLUMN decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN decided_at timestamptz;

-- Pending rows (requested/invited). Spelled as "not settled" so the predicate
-- stays immutable without naming the enum values added above.
CREATE INDEX community_group_memberships_pending_idx
  ON public.community_group_memberships(group_id, status, requested_at)
  WHERE status NOT IN ('active', 'removed', 'banned');

-- Allowed visibility / join-policy combinations (13.3 table).
ALTER TABLE public.community_groups DROP CONSTRAINT IF EXISTS community_groups_check;
DO $$
DECLARE v_name text;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.community_groups'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%join_policy%'
  LOOP
    EXECUTE format('ALTER TABLE public.community_groups DROP CONSTRAINT %I', v_name);
  END LOOP;
END
$$;
ALTER TABLE public.community_groups ADD CONSTRAINT community_groups_visibility_join_policy_check CHECK (
  (visibility = 'public')
  OR (visibility = 'private' AND join_policy IN ('request_approval', 'invite_only'))
  OR (visibility = 'unlisted' AND join_policy IN ('request_approval', 'invite_only'))
);

-- Notification categories for the new types.
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
    WHEN 'group_invitation' THEN 'groups'
    WHEN 'group_join_request' THEN 'groups'
    WHEN 'group_join_decision' THEN 'groups'
    WHEN 'message_received' THEN 'messages'
    WHEN 'listing_inspection_requested' THEN 'marketplace'
    WHEN 'saved_listing_updated' THEN 'marketplace'
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

-- ---------------------------------------------------------------------------
-- 2. Visibility helpers
-- ---------------------------------------------------------------------------
-- Whether the viewer may read the group's content (posts, members).
CREATE FUNCTION public.community_group_content_visible(p_viewer_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_groups community_group
    WHERE community_group.id = p_group_id
      AND community_group.status = 'active'
      AND (
        community_group.visibility = 'public'
        OR (
          p_viewer_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.community_group_memberships membership
            WHERE membership.group_id = community_group.id
              AND membership.profile_id = p_viewer_id
              AND membership.status = 'active'
          )
        )
      )
  );
$$;

-- Whether a signed-in viewer who knows the link may see the group shell. This
-- intentionally includes unlisted groups; directory discovery is narrower.
CREATE FUNCTION public.community_group_shell_visible(p_viewer_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_viewer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.community_groups community_group
    WHERE community_group.id = p_group_id
      AND community_group.status = 'active'
  );
$$;

-- Group posts now follow content visibility (members for private/unlisted).
CREATE OR REPLACE FUNCTION public.social_can_view_community_post(
  p_viewer_id uuid,
  p_post_id uuid,
  p_include_muted boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_posts post
    JOIN public.profiles author ON author.id = post.author_id
    WHERE post.id = p_post_id
      AND post.status = 'active'
      AND post.moderation_status = 'active'
      AND public.social_can_view_profile(p_viewer_id, author.id)
      AND (
        p_include_muted
        OR NOT EXISTS (
          SELECT 1 FROM public.profile_mutes mute
          WHERE mute.muter_id = p_viewer_id AND mute.muted_id = author.id
        )
      )
      AND (
        (
          post.group_id IS NULL
          AND (
            author.id = p_viewer_id
            OR (post.audience = 'public' AND author.is_public)
            OR (post.audience = 'friends' AND public.social_profiles_are_friends(p_viewer_id, author.id))
          )
        )
        OR (
          post.group_id IS NOT NULL
          AND post.group_status = 'active'
          AND public.community_group_content_visible(p_viewer_id, post.group_id)
        )
      )
      AND (
        post.vehicle_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.vehicles vehicle
          WHERE vehicle.id = post.vehicle_id AND vehicle.visibility = 'public'
        )
      )
  );
$$;

-- Posting/commenting require an active member of an active group; the
-- join policy no longer matters once you are in.
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

CREATE OR REPLACE FUNCTION public.guard_community_group_comment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT post.group_id INTO v_group_id FROM public.community_posts post WHERE post.id = NEW.post_id;
  IF v_group_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_groups WHERE id = v_group_id AND status = 'active')
     OR NOT EXISTS (
       SELECT 1 FROM public.community_group_memberships membership
       WHERE membership.group_id = v_group_id
         AND membership.profile_id = NEW.author_id
         AND membership.status = 'active'
     ) THEN
    RAISE EXCEPTION 'active group membership required to comment';
  END IF;
  RETURN NEW;
END;
$$;

-- Member list: content visibility decides.
CREATE OR REPLACE FUNCTION public.list_group_members(
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
  JOIN public.profiles profile ON profile.id = membership.profile_id
  WHERE membership.group_id = p_group_id
    AND membership.status = 'active'
    AND p_viewer_id IS NOT NULL
    AND public.community_group_content_visible(p_viewer_id, p_group_id)
    AND (profile.id = p_viewer_id OR public.social_can_view_profile(p_viewer_id, profile.id))
  ORDER BY CASE membership.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,
           membership.joined_at, profile.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- 3. Joining: open join (also completes an invitation), requests, invitations
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.group_notify(
  p_recipient_id uuid,
  p_type public.notification_type,
  p_title text,
  p_body text,
  p_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (p_recipient_id, p_type, p_title, p_body, p_data);
END;
$$;

-- Blocking either side cancels invitations exchanged by that pair. Group join
-- requests may still be reviewed by other unblocked moderators, but the
-- blocked moderator's aggregate request notice is removed so it cannot become
-- a notification side channel.
CREATE FUNCTION public.cleanup_group_access_on_profile_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.community_group_memberships membership
  WHERE membership.status = 'invited'
    AND (
      (membership.profile_id = NEW.blocker_id AND membership.invited_by = NEW.blocked_id)
      OR (membership.profile_id = NEW.blocked_id AND membership.invited_by = NEW.blocker_id)
    );

  DELETE FROM public.notifications notification
  WHERE notification.type = 'group_invitation'
    AND (
      (notification.user_id = NEW.blocker_id AND notification.data->>'invited_by' = NEW.blocked_id::text)
      OR (notification.user_id = NEW.blocked_id AND notification.data->>'invited_by' = NEW.blocker_id::text)
    );

  DELETE FROM public.notifications notification
  WHERE notification.type = 'group_join_request'
    AND (
      (
        notification.user_id = NEW.blocker_id
        AND EXISTS (
          SELECT 1
          FROM public.community_group_memberships requester
          WHERE requester.group_id::text = notification.data->>'group_id'
            AND requester.profile_id = NEW.blocked_id
            AND requester.status = 'requested'
        )
      )
      OR (
        notification.user_id = NEW.blocked_id
        AND EXISTS (
          SELECT 1
          FROM public.community_group_memberships requester
          WHERE requester.group_id::text = notification.data->>'group_id'
            AND requester.profile_id = NEW.blocker_id
            AND requester.status = 'requested'
        )
      )
    );

  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_blocks_cleanup_group_access
AFTER INSERT ON public.profile_blocks
FOR EACH ROW EXECUTE FUNCTION public.cleanup_group_access_on_profile_block();

CREATE OR REPLACE FUNCTION public.join_curated_community_group(
  p_actor_profile_id uuid,
  p_group_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.community_groups%ROWTYPE;
  v_existing public.community_group_memberships;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable';
  END IF;
  SELECT * INTO v_group FROM public.community_groups WHERE id = p_group_id;
  IF NOT FOUND OR v_group.status <> 'active' THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;

  SELECT * INTO v_existing
  FROM public.community_group_memberships membership
  WHERE membership.group_id = p_group_id AND membership.profile_id = p_actor_profile_id
  FOR UPDATE;

  IF FOUND AND v_existing.status = 'banned' THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;
  IF FOUND AND v_existing.status = 'active' THEN
    RETURN false;
  END IF;

  -- An invitation completes regardless of policy, unless its inviter and
  -- recipient are now blocked; otherwise only Open groups may be joined.
  IF FOUND AND v_existing.status = 'invited' AND v_existing.invited_by IS NOT NULL
     AND NOT public.social_can_view_profile(p_actor_profile_id, v_existing.invited_by) THEN
    RAISE EXCEPTION 'group unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (FOUND AND v_existing.status = 'invited') THEN
    IF v_group.join_policy <> 'open' OR v_group.visibility <> 'public' THEN
      RAISE EXCEPTION 'group_requires_request' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO public.community_group_memberships (group_id, profile_id, role, status, joined_at)
  VALUES (p_group_id, p_actor_profile_id, 'member', 'active', now())
  ON CONFLICT (group_id, profile_id) DO UPDATE
    SET role = 'member', status = 'active', joined_at = now(), updated_at = now(),
        decided_at = now(), request_message = NULL;
  RETURN true;
END;
$$;

-- Leave also cancels a pending request or declines an invitation.
CREATE OR REPLACE FUNCTION public.leave_curated_community_group(
  p_actor_profile_id uuid,
  p_group_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_membership public.community_group_memberships;
BEGIN
  SELECT * INTO v_membership
  FROM public.community_group_memberships membership
  WHERE membership.group_id = p_group_id AND membership.profile_id = p_actor_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_membership.status::text IN ('requested', 'invited') THEN
    DELETE FROM public.community_group_memberships
    WHERE group_id = p_group_id AND profile_id = p_actor_profile_id;
    RETURN true;
  END IF;
  IF v_membership.status <> 'active' THEN RETURN false; END IF;
  IF v_membership.role = 'owner' THEN
    RAISE EXCEPTION 'group owner must transfer or archive the group before leaving';
  END IF;
  UPDATE public.community_group_memberships
  SET status = 'left', updated_at = now()
  WHERE group_id = p_group_id AND profile_id = p_actor_profile_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.request_group_membership(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_message text DEFAULT NULL
)
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
      AND membership.role IN ('owner', 'moderator')
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
      AND membership.role IN ('owner', 'moderator')
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

CREATE FUNCTION public.decide_group_join_request(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_target_profile_id uuid,
  p_approve boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.community_groups%ROWTYPE;
  v_target public.community_group_memberships;
BEGIN
  PERFORM public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  SELECT * INTO v_group FROM public.community_groups WHERE id = p_group_id;
  SELECT * INTO v_target FROM public.community_group_memberships
  WHERE group_id = p_group_id AND profile_id = p_target_profile_id FOR UPDATE;
  IF NOT FOUND OR v_target.status <> 'requested' THEN
    RAISE EXCEPTION 'request unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.social_can_view_profile(p_actor_profile_id, p_target_profile_id) THEN
    RAISE EXCEPTION 'request unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_approve THEN
    UPDATE public.community_group_memberships
    SET status = 'active', role = 'member', joined_at = now(), decided_by = p_actor_profile_id,
        decided_at = now(), request_message = NULL, updated_at = now()
    WHERE group_id = p_group_id AND profile_id = p_target_profile_id;
    PERFORM public.community_group_log(p_group_id, p_actor_profile_id, 'request_approved', p_target_profile_id);
    PERFORM public.group_notify(
      p_target_profile_id, 'group_join_decision',
      'You joined ' || v_group.name,
      'Your request to join ' || v_group.name || ' was approved.',
      jsonb_build_object('group_id', p_group_id, 'group_slug', v_group.slug, 'decision', 'approved')
    );
    RETURN jsonb_build_object('profileId', p_target_profile_id, 'status', 'active', 'changed', true);
  END IF;

  UPDATE public.community_group_memberships
  SET status = 'removed', decided_by = p_actor_profile_id, decided_at = now(),
      request_message = NULL, updated_at = now()
  WHERE group_id = p_group_id AND profile_id = p_target_profile_id;
  PERFORM public.community_group_log(p_group_id, p_actor_profile_id, 'request_declined', p_target_profile_id);
  PERFORM public.group_notify(
    p_target_profile_id, 'group_join_decision',
    'Request to join ' || v_group.name,
    'The moderators of ' || v_group.name || ' did not approve your request at this time.',
    jsonb_build_object('group_id', p_group_id, 'group_slug', v_group.slug, 'decision', 'declined')
  );
  RETURN jsonb_build_object('profileId', p_target_profile_id, 'status', 'removed', 'changed', true);
END;
$$;

CREATE FUNCTION public.invite_to_group(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_target_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.community_groups%ROWTYPE;
  v_target public.community_group_memberships;
  v_recent integer;
BEGIN
  PERFORM public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF p_target_profile_id IS NULL OR p_target_profile_id = p_actor_profile_id
     OR NOT public.social_can_view_profile(p_actor_profile_id, p_target_profile_id) THEN
    RAISE EXCEPTION 'member unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_group FROM public.community_groups WHERE id = p_group_id;

  -- Invitation spam guard: 30 per inviter per day.
  SELECT count(*) INTO v_recent FROM public.community_group_moderation_events
  WHERE actor_id = p_actor_profile_id AND action = 'member_invited' AND created_at > now() - interval '24 hours';
  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'group_invite_rate_limited' USING ERRCODE = 'raise_exception';
  END IF;

  SELECT * INTO v_target FROM public.community_group_memberships
  WHERE group_id = p_group_id AND profile_id = p_target_profile_id FOR UPDATE;
  IF FOUND THEN
    IF v_target.status = 'active' THEN RETURN jsonb_build_object('profileId', p_target_profile_id, 'status', 'active', 'changed', false); END IF;
    IF v_target.status = 'invited' THEN RETURN jsonb_build_object('profileId', p_target_profile_id, 'status', 'invited', 'changed', false); END IF;
    IF v_target.status = 'banned' THEN
      RAISE EXCEPTION 'member is banned from this group' USING ERRCODE = 'check_violation';
    END IF;
    IF v_target.status = 'requested' THEN
      -- Crossed request/invitation: the moderator's invite approves it.
      RETURN public.decide_group_join_request(p_actor_profile_id, p_group_id, p_target_profile_id, true);
    END IF;
  END IF;

  INSERT INTO public.community_group_memberships (group_id, profile_id, role, status, invited_by)
  VALUES (p_group_id, p_target_profile_id, 'member', 'invited', p_actor_profile_id)
  ON CONFLICT (group_id, profile_id) DO UPDATE
    SET status = 'invited', role = 'member', invited_by = p_actor_profile_id, updated_at = now(),
        decided_by = NULL, decided_at = NULL;
  PERFORM public.community_group_log(p_group_id, p_actor_profile_id, 'member_invited', p_target_profile_id);
  PERFORM public.group_notify(
    p_target_profile_id, 'group_invitation',
    'Invitation to join ' || v_group.name,
    public.notification_actor_label(p_actor_profile_id) || ' invited you to join ' || v_group.name || '.',
    jsonb_build_object('group_id', p_group_id, 'group_slug', v_group.slug, 'invited_by', p_actor_profile_id)
  );
  RETURN jsonb_build_object('profileId', p_target_profile_id, 'status', 'invited', 'changed', true);
END;
$$;

ALTER TABLE public.community_group_moderation_events
  DROP CONSTRAINT community_group_moderation_events_action_check;
ALTER TABLE public.community_group_moderation_events
  ADD CONSTRAINT community_group_moderation_events_action_check CHECK (action IN (
    'post_pinned', 'post_unpinned', 'post_group_removed', 'post_group_restored',
    'member_removed', 'member_banned', 'member_unbanned', 'role_changed',
    'ownership_transferred', 'group_archived', 'settings_changed',
    'request_approved', 'request_declined', 'member_invited'
  ));

-- ---------------------------------------------------------------------------
-- 4. Reads for the UI
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.list_group_join_requests(p_actor_profile_id uuid, p_group_id uuid)
RETURNS TABLE(profile_id uuid, username text, display_name text, avatar_url text, requested_at timestamptz, request_message text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  RETURN QUERY
  SELECT profile.id, profile.username, profile.display_name, profile.avatar_url, membership.requested_at, membership.request_message
  FROM public.community_group_memberships membership
  JOIN public.profiles profile ON profile.id = membership.profile_id
  WHERE membership.group_id = p_group_id AND membership.status = 'requested'
    AND public.social_can_view_profile(p_actor_profile_id, profile.id)
  ORDER BY membership.requested_at, profile.id;
END;
$$;

CREATE FUNCTION public.list_my_group_invitations(p_actor_profile_id uuid)
RETURNS TABLE(group_id uuid, slug text, name text, description text, visibility public.community_group_visibility, invited_by_label text, invited_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT community_group.id, community_group.slug, community_group.name, community_group.description, community_group.visibility,
         public.notification_actor_label(membership.invited_by), membership.updated_at
  FROM public.community_group_memberships membership
  JOIN public.community_groups community_group ON community_group.id = membership.group_id
  WHERE membership.profile_id = p_actor_profile_id
    AND membership.status = 'invited'
    AND community_group.status = 'active'
    AND (
      membership.invited_by IS NULL
      OR public.social_can_view_profile(p_actor_profile_id, membership.invited_by)
    )
  ORDER BY membership.updated_at DESC;
$$;

-- Directory: public and private groups (private with its shell only);
-- unlisted only where the viewer is a member, invitee, or requester. A person
-- who merely knows an unlisted link can see its shell without making it appear
-- in general discovery.
CREATE FUNCTION public.list_visible_group_ids(p_viewer_id uuid)
RETURNS TABLE(group_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT community_group.id
  FROM public.community_groups community_group
  WHERE community_group.status = 'active'
    AND (
      community_group.visibility IN ('public', 'private')
      OR EXISTS (
        SELECT 1 FROM public.community_group_memberships membership
        WHERE membership.group_id = community_group.id
          AND membership.profile_id = p_viewer_id
          AND membership.status::text IN ('active', 'invited', 'requested')
      )
    );
$$;

-- Badges: pending join requests in groups the member moderates.
CREATE OR REPLACE FUNCTION public.member_activity_badges(p_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
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
       AND moderator.role IN ('owner', 'moderator')
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

-- ---------------------------------------------------------------------------
-- 5. Creation and settings accept visibility / join policy (allowed combos)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.community_group_policy_allowed(
  p_visibility public.community_group_visibility,
  p_join_policy public.community_group_join_policy
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (p_visibility = 'public')
      OR (p_visibility IN ('private', 'unlisted') AND p_join_policy IN ('request_approval', 'invite_only'));
$$;

DROP FUNCTION public.create_community_group(uuid, text, text, text, text, text[], text, text, integer, integer, text, text);
CREATE FUNCTION public.create_community_group(
  p_actor_profile_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_category text,
  p_rules text[] DEFAULT ARRAY[]::text[],
  p_vehicle_make text DEFAULT NULL,
  p_vehicle_model text DEFAULT NULL,
  p_year_start integer DEFAULT NULL,
  p_year_end integer DEFAULT NULL,
  p_location_region text DEFAULT NULL,
  p_posting_policy text DEFAULT 'members',
  p_visibility public.community_group_visibility DEFAULT 'public',
  p_join_policy public.community_group_join_policy DEFAULT 'open'
)
RETURNS public.community_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_group public.community_groups;
  v_recent integer;
  v_owned integer;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_actor_profile_id;
  IF NOT FOUND OR NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_profile.role <> 'admin' AND v_profile.created_at > now() - interval '7 days' THEN
    RAISE EXCEPTION 'group_creation_account_too_new' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_enforcement_actions action
    WHERE action.profile_id = p_actor_profile_id
      AND action.action_type IN ('temporary_posting_hold', 'suspension', 'ban')
      AND action.starts_at <= now()
      AND (action.ends_at IS NULL OR action.ends_at > now())
  ) THEN
    RAISE EXCEPTION 'group_creation_restricted' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_recent FROM public.community_group_creation_events
  WHERE actor_id = p_actor_profile_id AND created_at > now() - interval '24 hours';
  SELECT count(*) INTO v_owned
  FROM public.community_group_memberships membership
  JOIN public.community_groups community_group ON community_group.id = membership.group_id
  WHERE membership.profile_id = p_actor_profile_id
    AND membership.role = 'owner' AND membership.status = 'active'
    AND community_group.status = 'active';
  IF v_profile.role <> 'admin' AND (v_recent >= 2 OR v_owned >= 5) THEN
    RAISE EXCEPTION 'group_creation_rate_limited' USING ERRCODE = 'raise_exception';
  END IF;

  IF EXISTS (SELECT 1 FROM public.community_groups WHERE lower(slug) = lower(btrim(p_slug))) THEN
    RAISE EXCEPTION 'group_slug_taken' USING ERRCODE = 'unique_violation';
  END IF;
  IF p_posting_policy NOT IN ('members', 'moderators') THEN
    RAISE EXCEPTION 'invalid posting policy' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.community_group_policy_allowed(p_visibility, p_join_policy) THEN
    RAISE EXCEPTION 'group_policy_not_allowed' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.community_groups (
    slug, name, description, category, rules, visibility, join_policy,
    is_staff_curated, vehicle_make, vehicle_model, year_start, year_end,
    location_region, posting_policy, created_by
  ) VALUES (
    lower(btrim(p_slug)), btrim(p_name), btrim(p_description), p_category,
    COALESCE(p_rules, ARRAY[]::text[]), p_visibility, p_join_policy,
    false, NULLIF(btrim(p_vehicle_make), ''), NULLIF(btrim(p_vehicle_model), ''),
    p_year_start, p_year_end,
    NULLIF(btrim(p_location_region), ''), p_posting_policy, p_actor_profile_id
  ) RETURNING * INTO v_group;

  INSERT INTO public.community_group_memberships (group_id, profile_id, role, status)
  VALUES (v_group.id, p_actor_profile_id, 'owner', 'active');
  INSERT INTO public.community_group_creation_events (actor_id, group_id)
  VALUES (p_actor_profile_id, v_group.id);
  RETURN v_group;
END;
$$;

DROP FUNCTION public.update_community_group_settings(uuid, uuid, text, text, text, text[], text, text, integer, integer, text, text);
CREATE FUNCTION public.update_community_group_settings(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_rules text[],
  p_vehicle_make text,
  p_vehicle_model text,
  p_year_start integer,
  p_year_end integer,
  p_location_region text,
  p_posting_policy text,
  p_visibility public.community_group_visibility DEFAULT NULL,
  p_join_policy public.community_group_join_policy DEFAULT NULL
)
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
  IF v_role <> 'owner' THEN
    RAISE EXCEPTION 'only the owner can change group settings' USING ERRCODE = 'insufficient_privilege';
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

-- Group creators see their unlisted/private groups in "Joined" lists via
-- memberships; nothing else changes for curated creation.

REVOKE ALL ON FUNCTION public.community_group_content_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_group_shell_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.group_notify(uuid, public.notification_type, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_group_access_on_profile_block() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_group_membership(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_group_join_request(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_to_group(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_group_join_requests(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_group_invitations(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_visible_group_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_group_policy_allowed(public.community_group_visibility, public.community_group_join_policy) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_community_group(uuid, text, text, text, text, text[], text, text, integer, integer, text, text, public.community_group_visibility, public.community_group_join_policy) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_community_group_settings(uuid, uuid, text, text, text, text[], text, text, integer, integer, text, text, public.community_group_visibility, public.community_group_join_policy) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_group_content_visible(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_group_shell_visible(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_group_membership(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_group_join_request(uuid, uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.invite_to_group(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_group_join_requests(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_group_invitations(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_visible_group_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_community_group(uuid, text, text, text, text, text[], text, text, integer, integer, text, text, public.community_group_visibility, public.community_group_join_policy) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_community_group_settings(uuid, uuid, text, text, text, text[], text, text, integer, integer, text, text, public.community_group_visibility, public.community_group_join_policy) TO service_role;

COMMIT;
