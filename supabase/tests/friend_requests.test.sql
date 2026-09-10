\set ON_ERROR_STOP on
BEGIN;

-- Fixtures: seven claimed members.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'friend-alice@example.test', '', '{}', '{"username":"FriendAlice"}', now(), now()),
  ('61000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'friend-bob@example.test', '', '{}', '{"username":"FriendBob"}', now(), now()),
  ('61000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'friend-casey@example.test', '', '{}', '{"username":"FriendCasey"}', now(), now()),
  ('61000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'friend-dana@example.test', '', '{}', '{"username":"FriendDana"}', now(), now()),
  ('61000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'friend-erin@example.test', '', '{}', '{"username":"FriendErin"}', now(), now()),
  ('61000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'friend-frank@example.test', '', '{}', '{"username":"FriendFrank"}', now(), now()),
  ('61000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'friend-gus@example.test', '', '{}', '{"username":"FriendGus"}', now(), now());

UPDATE public.profiles SET display_name = 'Alice Friend' WHERE auth_user_id = '61000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET display_name = 'Bob Builder' WHERE auth_user_id = '61000000-0000-0000-0000-000000000002';
-- Casey: hidden from partial search, still reachable by exact username.
UPDATE public.profiles SET display_name = 'Casey Quiet', discoverable = false
WHERE auth_user_id = '61000000-0000-0000-0000-000000000003';
UPDATE public.profiles SET friend_request_policy = 'nobody'
WHERE auth_user_id = '61000000-0000-0000-0000-000000000005';
UPDATE public.profiles SET friend_request_policy = 'friends_of_friends', display_name = 'Frank Mutual'
WHERE auth_user_id = '61000000-0000-0000-0000-000000000006';
-- Erin's display name starts with Gus's username so ranking is observable.
UPDATE public.profiles SET display_name = 'Friendgus Fan'
WHERE auth_user_id = '61000000-0000-0000-0000-000000000005';

CREATE TEMP TABLE ids AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '61000000-0000-0000-0000-000000000001') AS alice,
  (SELECT id FROM public.profiles WHERE auth_user_id = '61000000-0000-0000-0000-000000000002') AS bob,
  (SELECT id FROM public.profiles WHERE auth_user_id = '61000000-0000-0000-0000-000000000003') AS casey,
  (SELECT id FROM public.profiles WHERE auth_user_id = '61000000-0000-0000-0000-000000000004') AS dana,
  (SELECT id FROM public.profiles WHERE auth_user_id = '61000000-0000-0000-0000-000000000005') AS erin,
  (SELECT id FROM public.profiles WHERE auth_user_id = '61000000-0000-0000-0000-000000000006') AS frank,
  (SELECT id FROM public.profiles WHERE auth_user_id = '61000000-0000-0000-0000-000000000007') AS gus;
GRANT SELECT ON ids TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_auth_id text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_auth_id, 'role', 'authenticated')::text, true);
$$;

-- Production friend/search RPCs are service-only. These test-only wrappers
-- emulate the authenticated server after it has resolved the session profile.
CREATE OR REPLACE FUNCTION public.send_friend_request(p_target uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.send_friend_request(public.get_my_profile_id(), p_target);
$$;
CREATE OR REPLACE FUNCTION public.respond_friend_request(p_requester uuid, p_accept boolean) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.respond_friend_request(public.get_my_profile_id(), p_requester, p_accept);
$$;
CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_target uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.cancel_friend_request(public.get_my_profile_id(), p_target);
$$;
CREATE OR REPLACE FUNCTION public.remove_friend(p_target uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.remove_friend(public.get_my_profile_id(), p_target);
$$;
CREATE OR REPLACE FUNCTION public.list_friend_requests()
RETURNS TABLE(direction text, profile_id uuid, username text, display_name text, avatar_url text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM public.list_friend_requests(public.get_my_profile_id());
$$;
CREATE OR REPLACE FUNCTION public.list_my_friends()
RETURNS TABLE(profile_id uuid, username text, display_name text, avatar_url text, is_public boolean, friends_since timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM public.list_my_friends(public.get_my_profile_id());
$$;
CREATE OR REPLACE FUNCTION public.search_profiles(p_query text)
RETURNS TABLE(profile_id uuid, username text, display_name text, avatar_url text, is_public boolean,
              exact_match boolean, relationship_state text, mutual_friend_count integer)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM public.search_profiles(public.get_my_profile_id(), p_query, 20, 0);
$$;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_friend_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_friends() TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Send, idempotent resend, and crossed requests resolve to one friendship.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
DO $$
DECLARE
  r jsonb;
  bob uuid := (SELECT bob FROM ids);
BEGIN
  r := public.send_friend_request(bob);
  IF r->>'state' <> 'outgoing_request' OR (r->>'changed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'first send returned %', r;
  END IF;
  r := public.send_friend_request(bob);
  IF r->>'state' <> 'outgoing_request' OR (r->>'changed')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'resend was not idempotent: %', r;
  END IF;
  IF (SELECT count(*) FROM public.list_friend_requests() WHERE direction = 'outgoing' AND profile_id = bob) <> 1 THEN
    RAISE EXCEPTION 'outgoing request missing from list';
  END IF;
END
$$;
RESET ROLE;

DO $$
DECLARE
  alice uuid := (SELECT alice FROM ids);
  bob uuid := (SELECT bob FROM ids);
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = bob AND type = 'friend_request') <> 1 THEN
    RAISE EXCEPTION 'addressee should have exactly one friend_request notice';
  END IF;
  IF public.friend_relationship_state(bob, alice) <> 'incoming_request' THEN
    RAISE EXCEPTION 'addressee state should be incoming_request';
  END IF;
  IF public.friend_relationship_state(alice, alice) <> 'self' THEN
    RAISE EXCEPTION 'self state';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000002');
DO $$
DECLARE
  r jsonb;
  alice uuid := (SELECT alice FROM ids);
BEGIN
  IF (SELECT count(*) FROM public.list_friend_requests() WHERE direction = 'incoming' AND profile_id = alice) <> 1 THEN
    RAISE EXCEPTION 'incoming request missing from list';
  END IF;
  -- Bob sends back instead of tapping accept: crossed request → friends.
  r := public.send_friend_request(alice);
  IF r->>'state' <> 'friends' OR (r->>'changed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'crossed request did not resolve to friends: %', r;
  END IF;
  IF (SELECT count(*) FROM public.list_my_friends() WHERE profile_id = alice) <> 1 THEN
    RAISE EXCEPTION 'friend list missing alice';
  END IF;
END
$$;
RESET ROLE;

DO $$
DECLARE
  alice uuid := (SELECT alice FROM ids);
  bob uuid := (SELECT bob FROM ids);
BEGIN
  IF (SELECT count(*) FROM public.friend_relationships
      WHERE profile_low_id = LEAST(alice, bob) AND profile_high_id = GREATEST(alice, bob)) <> 1 THEN
    RAISE EXCEPTION 'crossed requests must leave exactly one row';
  END IF;
  IF NOT public.social_profiles_are_friends(alice, bob) THEN
    RAISE EXCEPTION 'pair should be friends';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = bob AND type = 'friend_request') <> 0 THEN
    RAISE EXCEPTION 'resolved request should clear the pending notice';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = alice AND type = 'friend_request_accepted') <> 1 THEN
    RAISE EXCEPTION 'requester should be told the request was accepted';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Soft decline: requester keeps "sent", cannot re-notify, cannot read the
--    declined row; the decliner may later ask and be accepted.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
SELECT public.send_friend_request((SELECT casey FROM ids));
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000003');
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public.respond_friend_request((SELECT alice FROM ids), false);
  IF r->>'state' <> 'none' THEN RAISE EXCEPTION 'decline should read as none: %', r; END IF;
  IF (SELECT count(*) FROM public.friend_relationships) <> 1 THEN
    RAISE EXCEPTION 'decliner should still see the declined row through RLS';
  END IF;
END
$$;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
DO $$
DECLARE
  r jsonb;
  casey uuid := (SELECT casey FROM ids);
BEGIN
  IF (SELECT count(*) FROM public.friend_relationships WHERE casey IN (profile_low_id, profile_high_id)) <> 0 THEN
    RAISE EXCEPTION 'requester must not read the declined row';
  END IF;
  r := public.send_friend_request(casey);
  IF r->>'state' <> 'outgoing_request' OR (r->>'changed')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'resend during cooldown should be a silent no-op: %', r;
  END IF;
  IF (SELECT count(*) FROM public.list_friend_requests() WHERE direction = 'outgoing' AND profile_id = casey) <> 1 THEN
    RAISE EXCEPTION 'soft-declined request should still list as outgoing';
  END IF;
END
$$;
RESET ROLE;
DO $$
DECLARE
  casey uuid := (SELECT casey FROM ids);
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = casey AND type = 'friend_request') <> 0 THEN
    RAISE EXCEPTION 'decline must clear the notice and cooldown resend must not recreate it';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT alice FROM ids) AND type <> 'friend_request_accepted') <> 0 THEN
    RAISE EXCEPTION 'decline must not notify the requester';
  END IF;
END
$$;

-- Casey changes their mind and asks Alice; Alice accepts.
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000003');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.send_friend_request((SELECT alice FROM ids));
  IF r->>'state' <> 'outgoing_request' OR (r->>'changed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'decliner should be able to request: %', r;
  END IF;
END
$$;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
DO $$
DECLARE r jsonb;
BEGIN
  IF (SELECT count(*) FROM public.list_friend_requests()
      WHERE direction = 'incoming' AND profile_id = (SELECT casey FROM ids)) <> 1 THEN
    RAISE EXCEPTION 'alice should now see an incoming request';
  END IF;
  r := public.respond_friend_request((SELECT casey FROM ids), true);
  IF r->>'state' <> 'friends' THEN RAISE EXCEPTION 'accept failed: %', r; END IF;
  -- Accepting twice is idempotent; declining an accepted request is ignored.
  r := public.respond_friend_request((SELECT casey FROM ids), true);
  IF (r->>'changed')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'second accept should be a no-op'; END IF;
  r := public.respond_friend_request((SELECT casey FROM ids), false);
  IF r->>'state' <> 'friends' THEN RAISE EXCEPTION 'decline after accept must not unfriend'; END IF;
END
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. Cancel and unfriend are idempotent and silent.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
SELECT public.send_friend_request((SELECT dana FROM ids));
DO $$
DECLARE r jsonb;
BEGIN
  r := public.cancel_friend_request((SELECT dana FROM ids));
  IF r->>'state' <> 'none' OR (r->>'changed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'cancel: %', r; END IF;
  r := public.cancel_friend_request((SELECT dana FROM ids));
  IF (r->>'changed')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'second cancel should be a no-op'; END IF;
  r := public.remove_friend((SELECT bob FROM ids));
  IF r->>'state' <> 'none' OR (r->>'changed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'remove: %', r; END IF;
  r := public.remove_friend((SELECT bob FROM ids));
  IF (r->>'changed')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'second remove should be a no-op'; END IF;
END
$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT dana FROM ids)) <> 0 THEN
    RAISE EXCEPTION 'cancel must remove the addressee notice';
  END IF;
  IF public.social_profiles_are_friends((SELECT alice FROM ids), (SELECT bob FROM ids)) THEN
    RAISE EXCEPTION 'unfriend did not revoke friendship';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT bob FROM ids)) <> 0 THEN
    RAISE EXCEPTION 'unfriend must not notify';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Request policy: nobody, friends of friends.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
DO $$
DECLARE
  hit boolean := false;
BEGIN
  BEGIN
    PERFORM public.send_friend_request((SELECT erin FROM ids));
  EXCEPTION WHEN OTHERS THEN
    hit := SQLERRM = 'friend_request_not_accepted';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'policy nobody should reject'; END IF;

  hit := false;
  BEGIN
    PERFORM public.send_friend_request((SELECT frank FROM ids));
  EXCEPTION WHEN OTHERS THEN
    hit := SQLERRM = 'friend_request_not_accepted';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'friends_of_friends without a mutual should reject'; END IF;
END
$$;
RESET ROLE;
-- Bob befriends Frank and Alice (fixture rows), so Alice and Frank share Bob.
INSERT INTO public.friend_relationships (profile_low_id, profile_high_id, requested_by, status, responded_at)
SELECT LEAST(bob, frank), GREATEST(bob, frank), bob, 'friends', now() FROM ids;
INSERT INTO public.friend_relationships (profile_low_id, profile_high_id, requested_by, status, responded_at)
SELECT LEAST(bob, alice), GREATEST(bob, alice), bob, 'friends', now() FROM ids;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.send_friend_request((SELECT frank FROM ids));
  IF r->>'state' <> 'outgoing_request' THEN RAISE EXCEPTION 'mutual friend should unlock request: %', r; END IF;
END
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 5. Blocking cancels the request, clears notices, and prevents new ones.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
SELECT public.send_friend_request((SELECT dana FROM ids));
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000004');
SELECT public.set_own_profile_block((SELECT alice FROM ids), true);
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
DO $$
DECLARE
  hit boolean := false;
BEGIN
  BEGIN
    PERFORM public.send_friend_request((SELECT dana FROM ids));
  EXCEPTION WHEN OTHERS THEN
    hit := SQLERRM = 'profile unavailable' AND SQLSTATE = 'P0002';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'blocked pair should read as unavailable'; END IF;
END
$$;
RESET ROLE;
DO $$
DECLARE
  alice uuid := (SELECT alice FROM ids);
  dana uuid := (SELECT dana FROM ids);
BEGIN
  IF EXISTS (SELECT 1 FROM public.friend_relationships
             WHERE profile_low_id = LEAST(alice, dana) AND profile_high_id = GREATEST(alice, dana)) THEN
    RAISE EXCEPTION 'block must delete the pending request';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = dana AND type = 'friend_request') <> 0 THEN
    RAISE EXCEPTION 'block must clear friend notices';
  END IF;
  IF public.friend_relationship_state(dana, alice) <> 'blocked' THEN RAISE EXCEPTION 'blocker state'; END IF;
  IF public.friend_relationship_state(alice, dana) <> 'none' THEN RAISE EXCEPTION 'blocked party must see none'; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. People search honors discoverability, exact lookup, blocks, and self.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
DO $$
DECLARE
  n integer;
  rec record;
BEGIN
  SELECT count(*) INTO n FROM public.search_profiles('bob');
  IF n <> 1 THEN RAISE EXCEPTION 'expected bob, got % rows', n; END IF;
  SELECT * INTO rec FROM public.search_profiles('bob');
  IF rec.relationship_state <> 'friends' OR rec.exact_match THEN
    RAISE EXCEPTION 'bob result state/exact wrong: % %', rec.relationship_state, rec.exact_match;
  END IF;

  -- Display-name word match; "Builder" is Bob's second word.
  SELECT count(*) INTO n FROM public.search_profiles('build');
  IF n <> 1 THEN RAISE EXCEPTION 'display-name word prefix should match'; END IF;

  -- Casey is not discoverable: partial misses, exact username hits.
  SELECT count(*) INTO n FROM public.search_profiles('cas');
  IF n <> 0 THEN RAISE EXCEPTION 'non-discoverable profile leaked into partial search'; END IF;
  SELECT count(*) INTO n FROM public.search_profiles('@FriendCasey');
  IF n <> 1 THEN RAISE EXCEPTION 'exact username lookup should find a non-discoverable profile'; END IF;
  SELECT * INTO rec FROM public.search_profiles('friendcasey');
  IF NOT rec.exact_match OR rec.relationship_state <> 'friends' THEN
    RAISE EXCEPTION 'exact match flags wrong';
  END IF;

  -- Dana blocked Alice: invisible either way.
  SELECT count(*) INTO n FROM public.search_profiles('dana');
  IF n <> 0 THEN RAISE EXCEPTION 'blocked profile leaked into search'; END IF;
  SELECT count(*) INTO n FROM public.search_profiles('FriendDana');
  IF n <> 0 THEN RAISE EXCEPTION 'blocked profile leaked into exact lookup'; END IF;

  -- Self is excluded; LIKE metacharacters are literal; short queries return nothing.
  SELECT count(*) INTO n FROM public.search_profiles('friendalice');
  IF n <> 0 THEN RAISE EXCEPTION 'self should not appear'; END IF;
  SELECT count(*) INTO n FROM public.search_profiles('bo%');
  IF n <> 0 THEN RAISE EXCEPTION 'percent must be literal'; END IF;
  SELECT count(*) INTO n FROM public.search_profiles('f');
  IF n <> 0 THEN RAISE EXCEPTION 'single-character query should return nothing'; END IF;

  -- Frank: mutual friend Bob counted, pending request state reported.
  SELECT * INTO rec FROM public.search_profiles('frank');
  IF rec.mutual_friend_count <> 1 OR rec.relationship_state <> 'outgoing_request' THEN
    RAISE EXCEPTION 'frank mutual/state wrong: % %', rec.mutual_friend_count, rec.relationship_state;
  END IF;
END
$$;
RESET ROLE;
DO $$
BEGIN
  -- Search keys on the session even for the service role: no claims → nothing.
  PERFORM set_config('request.jwt.claims', '', true);
  IF (SELECT count(*) FROM public.search_profiles('friend')) <> 0 THEN
    RAISE EXCEPTION 'search without a session must return nothing';
  END IF;
END
$$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000002');
DO $$
DECLARE
  ordered uuid[];
BEGIN
  -- Exact username (Gus) ranks above a display-name prefix match (Erin).
  SELECT array_agg(profile_id ORDER BY ord) INTO ordered
  FROM (SELECT profile_id, row_number() OVER () AS ord FROM public.search_profiles('friendgus')) ranked;
  IF ordered IS NULL OR array_length(ordered, 1) <> 2 OR ordered[1] <> (SELECT gus FROM ids) OR ordered[2] <> (SELECT erin FROM ids) THEN
    RAISE EXCEPTION 'exact username should rank first: %', ordered;
  END IF;
END
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 7. Rate limit and session guards.
-- ---------------------------------------------------------------------------
INSERT INTO public.friend_request_events (actor_id, target_id, event)
SELECT alice, gus, 'sent' FROM ids, generate_series(1, 20);
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
DO $$
DECLARE
  hit boolean := false;
BEGIN
  BEGIN
    PERFORM public.send_friend_request((SELECT gus FROM ids));
  EXCEPTION WHEN OTHERS THEN
    hit := SQLERRM = 'friend_request_rate_limited';
  END;
  IF NOT hit THEN RAISE EXCEPTION '20 sends in 24h should rate-limit'; END IF;
END
$$;
-- No session → insufficient_privilege; a member cannot friend themselves.
SELECT pg_temp.act_as('61000000-0000-0000-0000-0000000000ff');
DO $$
DECLARE
  hit boolean := false;
BEGIN
  BEGIN
    PERFORM public.send_friend_request((SELECT gus FROM ids));
  EXCEPTION WHEN insufficient_privilege THEN
    hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'unknown session should be rejected'; END IF;
END
$$;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
DO $$
DECLARE
  hit boolean := false;
BEGIN
  BEGIN
    PERFORM public.send_friend_request((SELECT alice FROM ids));
  EXCEPTION WHEN insufficient_privilege THEN
    hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'self request should be rejected'; END IF;
  hit := false;
  BEGIN
    PERFORM public.respond_friend_request((SELECT gus FROM ids), NULL);
  EXCEPTION WHEN invalid_parameter_value THEN
    hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'NULL accept/decline decision should be rejected'; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 8. Privacy RPC carries the policy; NULL leaves it unchanged.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p public.profiles%ROWTYPE;
BEGIN
  p := public.set_own_social_privacy(true, 'public', true, true, 'friends_of_friends');
  IF p.friend_request_policy <> 'friends_of_friends' THEN RAISE EXCEPTION 'policy not saved'; END IF;
  p := public.set_own_social_privacy(true, 'public', true, true);
  IF p.friend_request_policy <> 'friends_of_friends' THEN RAISE EXCEPTION 'NULL policy must not reset'; END IF;
  BEGIN
    PERFORM public.set_own_social_privacy(true, 'public', true, true, 'anyone');
    RAISE EXCEPTION 'invalid policy accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;
RESET ROLE;

-- Authenticated members cannot touch the event log or helper functions directly.
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('61000000-0000-0000-0000-000000000001');
DO $$
DECLARE
  hit boolean := false;
BEGIN
  BEGIN
    PERFORM count(*) FROM public.friend_request_events;
  EXCEPTION WHEN insufficient_privilege THEN
    hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'friend_request_events must be service-only'; END IF;
  hit := false;
  BEGIN
    PERFORM public.friend_notify((SELECT bob FROM ids), (SELECT alice FROM ids), 'friend_request');
  EXCEPTION WHEN insufficient_privilege THEN
    hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'friend_notify must not be callable by members'; END IF;
  hit := false;
  BEGIN
    PERFORM public.send_friend_request((SELECT alice FROM ids), (SELECT bob FROM ids));
  EXCEPTION WHEN insufficient_privilege THEN
    hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'production friend transitions must be service-only'; END IF;
  hit := false;
  BEGIN
    PERFORM public.search_profiles((SELECT alice FROM ids), 'friendbob', 20, 0);
  EXCEPTION WHEN insufficient_privilege THEN
    hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'production people search must be service-only'; END IF;
END
$$;
RESET ROLE;

ROLLBACK;
