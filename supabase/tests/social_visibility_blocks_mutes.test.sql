\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '54000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'social-alice@example.test', '',
    '{}', '{"username":"SocialAlice"}', now(), now()
  ),
  (
    '54000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'social-bob@example.test', '',
    '{}', '{"username":"SocialBob"}', now(), now()
  ),
  (
    '54000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'social-casey@example.test', '',
    '{}', '{"username":"SocialCasey"}', now(), now()
  );

UPDATE public.profiles
SET is_public = true, default_post_audience = 'public'
WHERE auth_user_id IN (
  '54000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000002',
  '54000000-0000-0000-0000-000000000003'
);
SELECT id AS social_bob_profile_id FROM public.profiles
WHERE auth_user_id = '54000000-0000-0000-0000-000000000002' \gset

INSERT INTO public.friend_relationships (
  profile_low_id, profile_high_id, requested_by, status, responded_at
)
SELECT LEAST(alice.id, bob.id), GREATEST(alice.id, bob.id), alice.id, 'friends', now()
FROM public.profiles alice, public.profiles bob
WHERE alice.auth_user_id = '54000000-0000-0000-0000-000000000001'
  AND bob.auth_user_id = '54000000-0000-0000-0000-000000000002';

INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT
  '54100000-0000-0000-0000-000000000001', id,
  'Friends-only test post', 'friends', 'active', 'active'
FROM public.profiles
WHERE auth_user_id = '54000000-0000-0000-0000-000000000002';

DO $$
DECLARE
  alice_id uuid;
  casey_id uuid;
BEGIN
  SELECT id INTO alice_id FROM public.profiles
  WHERE auth_user_id = '54000000-0000-0000-0000-000000000001';
  SELECT id INTO casey_id FROM public.profiles
  WHERE auth_user_id = '54000000-0000-0000-0000-000000000003';

  IF NOT public.social_can_view_community_post(
    alice_id, '54100000-0000-0000-0000-000000000001', false
  ) THEN
    RAISE EXCEPTION 'friend could not see friends-only post';
  END IF;
  IF public.social_can_view_community_post(
    casey_id, '54100000-0000-0000-0000-000000000001', false
  ) THEN
    RAISE EXCEPTION 'non-friend could see friends-only post';
  END IF;
END
$$;

INSERT INTO public.profile_mutes (muter_id, muted_id)
SELECT alice.id, bob.id
FROM public.profiles alice, public.profiles bob
WHERE alice.auth_user_id = '54000000-0000-0000-0000-000000000001'
  AND bob.auth_user_id = '54000000-0000-0000-0000-000000000002';

DO $$
DECLARE
  alice_id uuid;
BEGIN
  SELECT id INTO alice_id FROM public.profiles
  WHERE auth_user_id = '54000000-0000-0000-0000-000000000001';
  IF public.social_can_view_community_post(
    alice_id, '54100000-0000-0000-0000-000000000001', false
  ) THEN
    RAISE EXCEPTION 'mute did not remove post from ordinary visibility';
  END IF;
  IF NOT public.social_can_view_community_post(
    alice_id, '54100000-0000-0000-0000-000000000001', true
  ) THEN
    RAISE EXCEPTION 'mute incorrectly changed base audience entitlement';
  END IF;
END
$$;

INSERT INTO public.conversations (id)
VALUES ('54200000-0000-0000-0000-000000000001');
INSERT INTO public.conversation_participants (conversation_id, profile_id)
SELECT '54200000-0000-0000-0000-000000000001', id
FROM public.profiles
WHERE auth_user_id IN (
  '54000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000002'
);
INSERT INTO public.notifications (user_id, type, title, body, data)
SELECT id, 'message_received', 'Message', 'Private preview',
  '{"conversation_id":"54200000-0000-0000-0000-000000000001"}'::jsonb
FROM public.profiles
WHERE auth_user_id = '54000000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"54000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SELECT public.set_own_profile_block(
  :'social_bob_profile_id'::uuid,
  true
);
RESET ROLE;

DO $$
DECLARE
  alice_id uuid;
  bob_id uuid;
BEGIN
  SELECT id INTO alice_id FROM public.profiles
  WHERE auth_user_id = '54000000-0000-0000-0000-000000000001';
  SELECT id INTO bob_id FROM public.profiles
  WHERE auth_user_id = '54000000-0000-0000-0000-000000000002';

  IF EXISTS (
    SELECT 1 FROM public.friend_relationships
    WHERE profile_low_id = LEAST(alice_id, bob_id)
      AND profile_high_id = GREATEST(alice_id, bob_id)
  ) THEN
    RAISE EXCEPTION 'blocking did not remove friendship';
  END IF;
  IF NOT public.social_profiles_are_blocked(alice_id, bob_id) THEN
    RAISE EXCEPTION 'block was not bidirectional for visibility';
  END IF;
  IF public.social_can_view_community_post(
    alice_id, '54100000-0000-0000-0000-000000000001', true
  ) THEN
    RAISE EXCEPTION 'block did not supersede post visibility';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = alice_id AND type = 'message_received'
  ) THEN
    RAISE EXCEPTION 'blocking retained stale direct-message notification';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"54000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.profile_blocks (blocker_id, blocked_id)
    SELECT alice.id, casey.id
    FROM public.profiles alice, public.profiles casey
    WHERE alice.auth_user_id = '54000000-0000-0000-0000-000000000001'
      AND casey.auth_user_id = '54000000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'direct block insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    UPDATE public.profiles SET is_public = false
    WHERE auth_user_id = '54000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'direct privacy update was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

SELECT public.set_own_social_privacy(false, 'friends', false, false);
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = '54000000-0000-0000-0000-000000000001'
      AND (is_public OR default_post_audience <> 'friends')
  ) THEN
    RAISE EXCEPTION 'private profile invariant was not enforced';
  END IF;
END
$$;

ROLLBACK;
