-- Friend requests and people search (plan sections 10, 12, 29.4, 36.2).
--
-- One friend_relationships row per unordered pair (already the case). This
-- migration adds the request lifecycle around it: send / accept / decline /
-- cancel / unfriend as SECURITY DEFINER transitions keyed on the caller,
-- crossed requests that resolve into one friendship, a per-profile request
-- policy, an append-only event log used for rate limiting and audit, the two
-- friend notification types, and a people-search function that applies
-- discoverability, exact-username lookup, blocks, and account state before a
-- single row leaves the database.
--
-- Declines are "soft": the row moves to `declined` and the requester keeps
-- seeing "request sent" (and cannot re-notify the addressee) for a cooldown.
-- The addressee sees no relationship and may send their own request later.
-- Nothing in this file tells a requester they were declined.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS friend_request_policy text NOT NULL DEFAULT 'everyone';
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_friend_request_policy_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_friend_request_policy_check
  CHECK (friend_request_policy IN ('everyone', 'friends_of_friends', 'nobody'));

-- The original status CHECKs were unnamed (friend_relationships_status_check
-- and friend_relationships_check2 in practice); drop whichever ones mention
-- status and leave the pair-ordering and requester-membership checks alone.
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.friend_relationships'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.friend_relationships DROP CONSTRAINT %I', v_name);
  END LOOP;
END
$$;
ALTER TABLE public.friend_relationships
  ADD CONSTRAINT friend_relationships_status_check
    CHECK (status IN ('pending', 'friends', 'declined')),
  ADD CONSTRAINT friend_relationships_responded_check CHECK (
    (status = 'pending' AND responded_at IS NULL)
    OR (status IN ('friends', 'declined') AND responded_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS friend_relationships_requested_by_idx
  ON public.friend_relationships(requested_by, status, created_at DESC);

-- Append-only log: rate limiting (sent per 24h) and an audit trail for
-- abuse review. Service-only.
CREATE TABLE IF NOT EXISTS public.friend_request_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('sent', 'accepted', 'declined', 'cancelled', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS friend_request_events_actor_idx
  ON public.friend_request_events(actor_id, event, created_at DESC);
ALTER TABLE public.friend_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friend_request_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.friend_request_events FROM service_role;
GRANT SELECT, INSERT ON public.friend_request_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.friend_request_events_id_seq TO service_role;

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'friend_request';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'friend_request_accepted';

-- A requester must not learn about a decline through a direct read: the
-- member policy now hides declined rows from the person who asked.
DROP POLICY IF EXISTS friend_relationships_select_member ON public.friend_relationships;
CREATE POLICY friend_relationships_select_member
  ON public.friend_relationships FOR SELECT TO authenticated
  USING (
    public.get_my_profile_id() IN (profile_low_id, profile_high_id)
    AND (status <> 'declined' OR requested_by IS DISTINCT FROM public.get_my_profile_id())
  );

-- ---------------------------------------------------------------------------
-- 2. Read helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.friend_mutual_ids(p_first_id uuid, p_second_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN a.profile_low_id = p_first_id THEN a.profile_high_id ELSE a.profile_low_id END
  FROM public.friend_relationships a
  WHERE a.status = 'friends' AND p_first_id IN (a.profile_low_id, a.profile_high_id)
  INTERSECT
  SELECT CASE WHEN b.profile_low_id = p_second_id THEN b.profile_high_id ELSE b.profile_low_id END
  FROM public.friend_relationships b
  WHERE b.status = 'friends' AND p_second_id IN (b.profile_low_id, b.profile_high_id);
$$;

-- One of: self | blocked | friends | outgoing_request | incoming_request | none.
-- "blocked" is only reported to the person who did the blocking; being
-- blocked by someone reads as "none" (plan 11: blocks are not announced).
CREATE OR REPLACE FUNCTION public.friend_relationship_state(p_viewer_id uuid, p_target_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.friend_relationships%ROWTYPE;
BEGIN
  IF p_viewer_id IS NULL OR p_target_id IS NULL THEN RETURN 'none'; END IF;
  IF p_viewer_id = p_target_id THEN RETURN 'self'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.profile_blocks
    WHERE blocker_id = p_viewer_id AND blocked_id = p_target_id
  ) THEN
    RETURN 'blocked';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profile_blocks
    WHERE blocker_id = p_target_id AND blocked_id = p_viewer_id
  ) THEN
    RETURN 'none';
  END IF;

  SELECT * INTO v_row
  FROM public.friend_relationships
  WHERE profile_low_id = LEAST(p_viewer_id, p_target_id)
    AND profile_high_id = GREATEST(p_viewer_id, p_target_id);
  IF NOT FOUND THEN RETURN 'none'; END IF;

  IF v_row.status = 'friends' THEN RETURN 'friends'; END IF;
  IF v_row.status = 'pending' THEN
    RETURN CASE WHEN v_row.requested_by = p_viewer_id THEN 'outgoing_request' ELSE 'incoming_request' END;
  END IF;
  -- declined: the requester keeps seeing a pending request (soft decline).
  RETURN CASE WHEN v_row.requested_by = p_viewer_id THEN 'outgoing_request' ELSE 'none' END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Transitions. Every function derives the actor from the session, locks
--    the unordered pair with an advisory lock so crossed requests serialize,
--    and returns the canonical state the client should render.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.friend_pair_lock(p_first_id uuid, p_second_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT pg_advisory_xact_lock(
    hashtext('friend_pair'),
    hashtext(LEAST(p_first_id, p_second_id)::text || ':' || GREATEST(p_first_id, p_second_id)::text)
  );
$$;

-- Deletes the addressee's pending "friend_request" notice from a requester.
-- plpgsql (not sql) so the enum value added above is not evaluated while
-- this migration's transaction is still open.
CREATE OR REPLACE FUNCTION public.friend_clear_request_notification(p_addressee_id uuid, p_requester_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE user_id = p_addressee_id
    AND type = 'friend_request'
    AND data->>'requester_id' = p_requester_id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.friend_notify(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_type public.notification_type
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_name text;
BEGIN
  -- A recipient who muted the actor's notifications gets no notice.
  IF EXISTS (
    SELECT 1 FROM public.profile_mutes
    WHERE muter_id = p_recipient_id AND muted_id = p_actor_id AND mute_notifications
  ) THEN
    RETURN;
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = p_actor_id;
  v_name := COALESCE(NULLIF(v_actor.display_name, ''), '@' || v_actor.username, 'A member');

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_recipient_id,
    p_type,
    CASE p_type
      WHEN 'friend_request' THEN 'New friend request'
      ELSE 'Friend request accepted'
    END,
    CASE p_type
      WHEN 'friend_request' THEN v_name || ' wants to be friends'
      ELSE v_name || ' accepted your friend request'
    END,
    jsonb_build_object(
      'requester_id', CASE WHEN p_type = 'friend_request' THEN p_actor_id ELSE p_recipient_id END,
      'profile_id', p_actor_id,
      'username', v_actor.username
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.send_friend_request(
  p_actor_profile_id uuid,
  p_target_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := p_actor_profile_id;
  v_row public.friend_relationships%ROWTYPE;
  v_exists boolean;
  v_policy text;
  v_sent_24h integer;
  v_pending integer;
BEGIN
  IF v_me IS NULL OR p_target_profile_id IS NULL OR v_me = p_target_profile_id THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.social_profile_is_available(v_me) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Covers blocks in either direction, suspensions, and pending accounts
  -- without revealing which one applied.
  IF NOT public.social_can_view_profile(v_me, p_target_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.friend_pair_lock(v_me, p_target_profile_id);

  SELECT * INTO v_row
  FROM public.friend_relationships
  WHERE profile_low_id = LEAST(v_me, p_target_profile_id)
    AND profile_high_id = GREATEST(v_me, p_target_profile_id);
  v_exists := FOUND;

  IF v_exists THEN
    IF v_row.status = 'friends' THEN
      RETURN jsonb_build_object('state', 'friends', 'changed', false);
    END IF;
    IF v_row.status = 'pending' AND v_row.requested_by = v_me THEN
      RETURN jsonb_build_object('state', 'outgoing_request', 'changed', false);
    END IF;
    IF v_row.status = 'pending' THEN
      -- Crossed requests: the other side already asked, so this is an accept.
      UPDATE public.friend_relationships
      SET status = 'friends', responded_at = now(), updated_at = now()
      WHERE profile_low_id = v_row.profile_low_id AND profile_high_id = v_row.profile_high_id;
      PERFORM public.friend_clear_request_notification(v_me, p_target_profile_id);
      PERFORM public.friend_notify(p_target_profile_id, v_me, 'friend_request_accepted');
      INSERT INTO public.friend_request_events (actor_id, target_id, event)
      VALUES (v_me, p_target_profile_id, 'accepted');
      RETURN jsonb_build_object('state', 'friends', 'changed', true);
    END IF;
    -- declined
    IF v_row.requested_by = v_me AND v_row.responded_at > now() - interval '30 days' THEN
      -- Soft decline cooldown: idempotent "sent", no new notice.
      RETURN jsonb_build_object('state', 'outgoing_request', 'changed', false);
    END IF;
  END IF;

  SELECT friend_request_policy INTO v_policy
  FROM public.profiles WHERE id = p_target_profile_id;
  IF v_policy = 'nobody' THEN
    RAISE EXCEPTION 'friend_request_not_accepted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_policy = 'friends_of_friends'
     AND NOT EXISTS (SELECT 1 FROM public.friend_mutual_ids(v_me, p_target_profile_id)) THEN
    RAISE EXCEPTION 'friend_request_not_accepted' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_sent_24h
  FROM public.friend_request_events
  WHERE actor_id = v_me AND event = 'sent' AND created_at > now() - interval '24 hours';
  SELECT count(*) INTO v_pending
  FROM public.friend_relationships
  WHERE requested_by = v_me AND status = 'pending';
  IF v_sent_24h >= 20 OR v_pending >= 100 THEN
    RAISE EXCEPTION 'friend_request_rate_limited' USING ERRCODE = 'raise_exception';
  END IF;

  IF v_exists THEN
    -- Re-request after cooldown, or the declining side changing their mind.
    UPDATE public.friend_relationships
    SET status = 'pending', requested_by = v_me, responded_at = NULL,
        created_at = now(), updated_at = now()
    WHERE profile_low_id = v_row.profile_low_id AND profile_high_id = v_row.profile_high_id;
  ELSE
    INSERT INTO public.friend_relationships (profile_low_id, profile_high_id, requested_by, status)
    VALUES (LEAST(v_me, p_target_profile_id), GREATEST(v_me, p_target_profile_id), v_me, 'pending');
  END IF;

  PERFORM public.friend_notify(p_target_profile_id, v_me, 'friend_request');
  INSERT INTO public.friend_request_events (actor_id, target_id, event)
  VALUES (v_me, p_target_profile_id, 'sent');
  RETURN jsonb_build_object('state', 'outgoing_request', 'changed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(
  p_actor_profile_id uuid,
  p_requester_profile_id uuid,
  p_accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := p_actor_profile_id;
  v_row public.friend_relationships%ROWTYPE;
BEGIN
  IF v_me IS NULL OR p_requester_profile_id IS NULL OR v_me = p_requester_profile_id THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_accept IS NULL THEN
    RAISE EXCEPTION 'accept decision is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT public.social_profile_is_available(v_me) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.friend_pair_lock(v_me, p_requester_profile_id);

  SELECT * INTO v_row
  FROM public.friend_relationships
  WHERE profile_low_id = LEAST(v_me, p_requester_profile_id)
    AND profile_high_id = GREATEST(v_me, p_requester_profile_id);

  IF FOUND AND v_row.status = 'friends' THEN
    -- Already friends (a crossed request resolved it): accept is idempotent,
    -- decline is not a valid transition and is ignored.
    RETURN jsonb_build_object('state', 'friends', 'changed', false);
  END IF;
  IF NOT FOUND OR v_row.status <> 'pending' OR v_row.requested_by <> p_requester_profile_id THEN
    RAISE EXCEPTION 'request unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.friend_clear_request_notification(v_me, p_requester_profile_id);

  IF p_accept THEN
    IF NOT public.social_can_view_profile(v_me, p_requester_profile_id) THEN
      RAISE EXCEPTION 'request unavailable' USING ERRCODE = 'no_data_found';
    END IF;
    UPDATE public.friend_relationships
    SET status = 'friends', responded_at = now(), updated_at = now()
    WHERE profile_low_id = v_row.profile_low_id AND profile_high_id = v_row.profile_high_id;
    PERFORM public.friend_notify(p_requester_profile_id, v_me, 'friend_request_accepted');
    INSERT INTO public.friend_request_events (actor_id, target_id, event)
    VALUES (v_me, p_requester_profile_id, 'accepted');
    RETURN jsonb_build_object('state', 'friends', 'changed', true);
  END IF;

  UPDATE public.friend_relationships
  SET status = 'declined', responded_at = now(), updated_at = now()
  WHERE profile_low_id = v_row.profile_low_id AND profile_high_id = v_row.profile_high_id;
  INSERT INTO public.friend_request_events (actor_id, target_id, event)
  VALUES (v_me, p_requester_profile_id, 'declined');
  RETURN jsonb_build_object('state', 'none', 'changed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(
  p_actor_profile_id uuid,
  p_target_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := p_actor_profile_id;
  v_deleted integer;
BEGIN
  IF v_me IS NULL OR p_target_profile_id IS NULL OR v_me = p_target_profile_id THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.social_profile_is_available(v_me) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.friend_pair_lock(v_me, p_target_profile_id);

  DELETE FROM public.friend_relationships
  WHERE profile_low_id = LEAST(v_me, p_target_profile_id)
    AND profile_high_id = GREATEST(v_me, p_target_profile_id)
    AND status IN ('pending', 'declined')
    AND requested_by = v_me;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    PERFORM public.friend_clear_request_notification(p_target_profile_id, v_me);
    INSERT INTO public.friend_request_events (actor_id, target_id, event)
    VALUES (v_me, p_target_profile_id, 'cancelled');
  END IF;

  RETURN jsonb_build_object(
    'state', public.friend_relationship_state(v_me, p_target_profile_id),
    'changed', v_deleted > 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_friend(
  p_actor_profile_id uuid,
  p_target_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := p_actor_profile_id;
  v_deleted integer;
BEGIN
  IF v_me IS NULL OR p_target_profile_id IS NULL OR v_me = p_target_profile_id THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.social_profile_is_available(v_me) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.friend_pair_lock(v_me, p_target_profile_id);

  DELETE FROM public.friend_relationships
  WHERE profile_low_id = LEAST(v_me, p_target_profile_id)
    AND profile_high_id = GREATEST(v_me, p_target_profile_id)
    AND status = 'friends';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    INSERT INTO public.friend_request_events (actor_id, target_id, event)
    VALUES (v_me, p_target_profile_id, 'removed');
  END IF;

  RETURN jsonb_build_object(
    'state', public.friend_relationship_state(v_me, p_target_profile_id),
    'changed', v_deleted > 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Lists for the signed-in member
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_friend_requests(p_actor_profile_id uuid)
RETURNS TABLE(
  direction text,
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE WHEN rel.requested_by = me.id THEN 'outgoing' ELSE 'incoming' END,
    other.id, other.username, other.display_name, other.avatar_url, rel.created_at
  FROM (SELECT p_actor_profile_id AS id) me
  JOIN public.friend_relationships rel
    ON me.id IN (rel.profile_low_id, rel.profile_high_id)
  JOIN public.profiles other
    ON other.id = CASE WHEN rel.profile_low_id = me.id THEN rel.profile_high_id ELSE rel.profile_low_id END
  WHERE me.id IS NOT NULL
    AND (
      rel.status = 'pending'
      OR (rel.status = 'declined' AND rel.requested_by = me.id)
    )
    AND public.social_can_view_profile(me.id, other.id)
  ORDER BY rel.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_my_friends(p_actor_profile_id uuid)
RETURNS TABLE(
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_public boolean,
  friends_since timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT other.id, other.username, other.display_name, other.avatar_url, other.is_public, rel.responded_at
  FROM (SELECT p_actor_profile_id AS id) me
  JOIN public.friend_relationships rel
    ON me.id IN (rel.profile_low_id, rel.profile_high_id)
  JOIN public.profiles other
    ON other.id = CASE WHEN rel.profile_low_id = me.id THEN rel.profile_high_id ELSE rel.profile_low_id END
  WHERE me.id IS NOT NULL
    AND rel.status = 'friends'
    AND public.social_can_view_profile(me.id, other.id)
  ORDER BY lower(COALESCE(other.display_name, other.username, '')), other.id;
$$;

-- ---------------------------------------------------------------------------
-- 5. People search (plan 12). The database applies every visibility rule;
--    the server only forwards the query and pages the result.
--    * Partial username/display-name matches require `discoverable`.
--    * A complete username finds a non-discoverable profile only while that
--      profile allows exact lookup.
--    * Blocks (both directions), suspensions, and pending accounts never
--      appear. The caller is excluded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_profiles(
  p_viewer_profile_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_public boolean,
  exact_match boolean,
  relationship_state text,
  mutual_friend_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := p_viewer_profile_id;
  v_q text := lower(regexp_replace(COALESCE(p_query, ''), '^\s*@', ''));
BEGIN
  v_q := btrim(v_q);
  IF v_me IS NULL OR length(v_q) < 2 OR length(v_q) > 64 THEN
    RETURN;
  END IF;
  IF NOT public.social_profile_is_available(v_me) THEN
    RETURN;
  END IF;
  -- LIKE metacharacters in the query are literal.
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  WITH candidates AS (
    SELECT
      p.id, p.username, p.display_name, p.avatar_url, p.is_public,
      (p.username_normalized = v_q) AS exact_match,
      (p.username_normalized LIKE v_q || '%') AS username_prefix
    FROM public.profiles p
    WHERE p.id <> v_me
      AND p.username_state = 'claimed'
      AND (
        (p.allow_exact_username_lookup AND p.username_normalized = v_q)
        OR (
          p.discoverable
          AND (
            p.username_normalized LIKE v_q || '%'
            OR lower(p.display_name) LIKE v_q || '%'
            OR lower(p.display_name) LIKE '% ' || v_q || '%'
          )
        )
      )
  )
  SELECT
    c.id, c.username, c.display_name, c.avatar_url, c.is_public,
    c.exact_match,
    public.friend_relationship_state(v_me, c.id),
    (SELECT count(*)::integer FROM public.friend_mutual_ids(v_me, c.id))
  FROM candidates c
  WHERE public.social_can_view_profile(v_me, c.id)
  ORDER BY c.exact_match DESC, c.username_prefix DESC,
           lower(COALESCE(c.display_name, c.username, '')), c.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 25)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Settings: the request policy joins the existing privacy RPC. The old
--    4-argument signature is dropped so PostgREST resolution stays unique.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_own_social_privacy(boolean, public.community_post_audience, boolean, boolean);

CREATE OR REPLACE FUNCTION public.set_own_social_privacy(
  p_is_public boolean,
  p_default_post_audience public.community_post_audience,
  p_discoverable boolean DEFAULT true,
  p_allow_exact_username_lookup boolean DEFAULT true,
  p_friend_request_policy text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE auth_user_id = auth.uid()
    AND username_state = 'claimed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT p_is_public AND p_default_post_audience <> 'friends' THEN
    RAISE EXCEPTION 'private profiles can only default to friends';
  END IF;
  IF p_friend_request_policy IS NOT NULL
     AND p_friend_request_policy NOT IN ('everyone', 'friends_of_friends', 'nobody') THEN
    RAISE EXCEPTION 'invalid friend request policy' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.profiles
  SET is_public = p_is_public,
      default_post_audience = p_default_post_audience,
      discoverable = p_discoverable,
      allow_exact_username_lookup = p_allow_exact_username_lookup,
      friend_request_policy = COALESCE(p_friend_request_policy, friend_request_policy)
  WHERE id = v_profile.id
  RETURNING * INTO v_profile;

  IF NOT p_is_public THEN
    UPDATE public.community_posts
    SET audience = 'friends'
    WHERE author_id = v_profile.id
      AND audience = 'public';
  END IF;

  RETURN v_profile;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Blocking now also clears friend notices between the pair (plan 11:
--    cancel requests in both directions and remove them from notifications).
--    Body otherwise identical to 20260910114747.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_own_profile_block(
  p_target_profile_id uuid,
  p_blocked boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid := public.get_my_profile_id();
BEGIN
  IF v_profile_id IS NULL OR p_target_profile_id IS NULL OR v_profile_id = p_target_profile_id THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_blocked AND NOT public.social_profile_is_available(p_target_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_blocked THEN
    PERFORM public.friend_pair_lock(v_profile_id, p_target_profile_id);

    INSERT INTO public.profile_blocks (blocker_id, blocked_id)
    VALUES (v_profile_id, p_target_profile_id)
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

    DELETE FROM public.friend_relationships friendship
    WHERE friendship.profile_low_id = LEAST(v_profile_id, p_target_profile_id)
      AND friendship.profile_high_id = GREATEST(v_profile_id, p_target_profile_id);

    DELETE FROM public.notifications notification
    WHERE notification.type IN ('friend_request', 'friend_request_accepted')
      AND (
        (notification.user_id = v_profile_id AND notification.data->>'profile_id' = p_target_profile_id::text)
        OR (notification.user_id = p_target_profile_id AND notification.data->>'profile_id' = v_profile_id::text)
      );

    DELETE FROM public.profile_mutes mute
    WHERE mute.muter_id = v_profile_id
      AND mute.muted_id = p_target_profile_id;

    DELETE FROM public.notifications notification
    WHERE notification.type = 'message_received'
      AND notification.user_id IN (v_profile_id, p_target_profile_id)
      AND EXISTS (
        SELECT 1
        FROM public.conversation_participants first_member
        JOIN public.conversation_participants second_member
          ON second_member.conversation_id = first_member.conversation_id
        WHERE first_member.profile_id = v_profile_id
          AND second_member.profile_id = p_target_profile_id
          AND notification.data->>'conversation_id' = first_member.conversation_id::text
      );
  ELSE
    DELETE FROM public.profile_blocks block
    WHERE block.blocker_id = v_profile_id
      AND block.blocked_id = p_target_profile_id;
  END IF;

  RETURN p_blocked;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants. Friend/search operations are server-mediated so a custom client
--    cannot bypass product flags, enumeration limits, or endpoint telemetry.
--    The server authenticates the member and supplies their profile ID.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.friend_pair_lock(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.friend_clear_request_notification(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.friend_notify(uuid, uuid, public.notification_type) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.friend_mutual_ids(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.friend_relationship_state(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friend_mutual_ids(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.friend_relationship_state(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.send_friend_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_friend_request(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_friend_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_friend(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_friend_requests(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_friends(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_profiles(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_own_social_privacy(boolean, public.community_post_audience, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_friend_requests(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_my_friends(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_profiles(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_own_social_privacy(boolean, public.community_post_audience, boolean, boolean, text) TO authenticated, service_role;
