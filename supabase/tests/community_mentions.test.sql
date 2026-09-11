\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('77000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mention-author@example.test', '', '{}', '{"username":"MentionAuthor"}', now(), now()),
  ('77000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mention-friend@example.test', '', '{}', '{"username":"MentionFriend"}', now(), now()),
  ('77000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mention-group@example.test', '', '{}', '{"username":"MentionGroup"}', now(), now()),
  ('77000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mention-closed@example.test', '', '{}', '{"username":"MentionClosed"}', now(), now());

CREATE TEMP TABLE mention_actors AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '77000000-0000-0000-0000-000000000001') author,
  (SELECT id FROM public.profiles WHERE auth_user_id = '77000000-0000-0000-0000-000000000002') friend,
  (SELECT id FROM public.profiles WHERE auth_user_id = '77000000-0000-0000-0000-000000000003') group_peer,
  (SELECT id FROM public.profiles WHERE auth_user_id = '77000000-0000-0000-0000-000000000004') closed;

UPDATE public.profiles SET is_public = true;
UPDATE public.profiles SET mention_policy = 'friends'
WHERE id = (SELECT friend FROM mention_actors);
UPDATE public.profiles SET mention_policy = 'friends_and_groups'
WHERE id = (SELECT group_peer FROM mention_actors);
UPDATE public.profiles SET mention_policy = 'nobody'
WHERE id = (SELECT closed FROM mention_actors);

INSERT INTO public.friend_relationships (
  profile_low_id, profile_high_id, requested_by, status, responded_at
)
SELECT LEAST(author, friend), GREATEST(author, friend), author, 'friends', now()
FROM mention_actors;

INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
)
SELECT '77000000-0000-0000-0000-000000000010', author,
       'Thanks @MentionFriend, @MentionClosed, and @UnknownUser.',
       'public', 'active', 'active'
FROM mention_actors;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.community_mentions
      WHERE post_id = '77000000-0000-0000-0000-000000000010') <> 1 THEN
    RAISE EXCEPTION 'mention privacy did not retain exactly the eligible friend';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications notification
    WHERE notification.user_id = (SELECT friend FROM mention_actors)
      AND notification.type = 'post_mention'
      AND notification.data->>'post_id' = '77000000-0000-0000-0000-000000000010'
  ) THEN
    RAISE EXCEPTION 'eligible mention did not create a notification';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications notification
    WHERE notification.user_id = (SELECT closed FROM mention_actors)
      AND notification.type = 'post_mention'
  ) THEN
    RAISE EXCEPTION 'mention policy nobody received a notification';
  END IF;
END
$$;

-- Email-like text and overlong handles cannot resolve a valid username
-- buried inside a larger token.
INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
)
SELECT '77000000-0000-0000-0000-000000000011', author,
       'Not mentions: person@MentionFriend and @MentionFriendSuffix.',
       'public', 'active', 'active'
FROM mention_actors;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.community_mentions
    WHERE post_id = '77000000-0000-0000-0000-000000000011'
  ) THEN
    RAISE EXCEPTION 'invalid mention boundary resolved a profile';
  END IF;
END
$$;

-- Reprocessing unchanged content is idempotent and cannot create another
-- notification.
UPDATE public.community_posts SET content = content
WHERE id = '77000000-0000-0000-0000-000000000010';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.notifications notification
      WHERE notification.type = 'post_mention'
        AND notification.data->>'post_id' = '77000000-0000-0000-0000-000000000010') <> 1 THEN
    RAISE EXCEPTION 'unchanged mention created a duplicate notification';
  END IF;
END
$$;

-- Private-group peers can mention one another only while both memberships and
-- the group are active.
INSERT INTO public.community_groups (
  id, slug, name, description, category, visibility, join_policy, created_by
)
SELECT '77000000-0000-0000-0000-000000000020', 'mention-private-group',
       'Mention Private Group', 'Private test group.', 'general', 'private',
       'request_approval', author
FROM mention_actors;
INSERT INTO public.community_group_memberships (group_id, profile_id, role, status)
SELECT '77000000-0000-0000-0000-000000000020'::uuid, author,
       'owner'::public.community_group_role, 'active'::public.community_group_membership_status
FROM mention_actors
UNION ALL
SELECT '77000000-0000-0000-0000-000000000020'::uuid, group_peer,
       'member'::public.community_group_role, 'active'::public.community_group_membership_status
FROM mention_actors;
INSERT INTO public.community_posts (
  id, author_id, group_id, content, audience, status, moderation_status
)
SELECT '77000000-0000-0000-0000-000000000021', author,
       '77000000-0000-0000-0000-000000000020', 'Welcome @MentionGroup.',
       'public', 'active', 'active'
FROM mention_actors;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_mentions
    WHERE post_id = '77000000-0000-0000-0000-000000000021'
      AND mentioned_profile_id = (SELECT group_peer FROM mention_actors)
  ) THEN
    RAISE EXCEPTION 'eligible private-group mention was not resolved';
  END IF;
END
$$;

-- Hidden drafts never notify. Publication creates the mention once the
-- destination is actually viewable.
INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
)
SELECT '77000000-0000-0000-0000-000000000030', author,
       'Draft for @MentionFriend.', 'public', 'hidden', 'active'
FROM mention_actors;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.community_mentions
             WHERE post_id = '77000000-0000-0000-0000-000000000030') THEN
    RAISE EXCEPTION 'hidden post created a mention';
  END IF;
END
$$;
UPDATE public.community_posts SET status = 'active'
WHERE id = '77000000-0000-0000-0000-000000000030';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.community_mentions
                 WHERE post_id = '77000000-0000-0000-0000-000000000030') THEN
    RAISE EXCEPTION 'published post did not activate its mention';
  END IF;
END
$$;

-- Comment mentions point at the comment while retaining the parent post for
-- visibility checks.
INSERT INTO public.community_comments (
  id, post_id, author_id, content, status, moderation_status
)
SELECT '77000000-0000-0000-0000-000000000040',
       '77000000-0000-0000-0000-000000000010', author,
       'Follow-up for @MentionFriend.', 'active', 'active'
FROM mention_actors;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_mentions
    WHERE comment_id = '77000000-0000-0000-0000-000000000040'
      AND post_id IS NULL
  ) THEN
    RAISE EXCEPTION 'comment mention was not stored against the comment';
  END IF;
END
$$;

-- A block suppresses both the link and notification without revealing the
-- relationship to the author.
UPDATE public.profiles SET mention_policy = 'everyone'
WHERE id = (SELECT group_peer FROM mention_actors);
INSERT INTO public.profile_blocks (blocker_id, blocked_id)
SELECT group_peer, author FROM mention_actors;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.community_mentions
    WHERE author_id = (SELECT author FROM mention_actors)
      AND mentioned_profile_id = (SELECT group_peer FROM mention_actors)
  ) THEN
    RAISE EXCEPTION 'blocking did not remove an existing resolved mention';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications notification
    WHERE notification.user_id = (SELECT group_peer FROM mention_actors)
      AND notification.type = 'post_mention'
      AND notification.data->>'actor_id' = (SELECT author::text FROM mention_actors)
  ) THEN
    RAISE EXCEPTION 'blocking did not remove existing mention notifications';
  END IF;
END
$$;
INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
)
SELECT '77000000-0000-0000-0000-000000000050', author,
       'Blocked destination @MentionGroup.', 'public', 'active', 'active'
FROM mention_actors;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.community_mentions
             WHERE post_id = '77000000-0000-0000-0000-000000000050') THEN
    RAISE EXCEPTION 'blocked mention was resolved';
  END IF;
END
$$;

-- More than ten resolved accounts rejects the publication transaction.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  ('77000000-0000-0000-0000-' || lpad((100 + number)::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'mention-cap-' || number || '@example.test', '', '{}',
  jsonb_build_object('username', 'MentionCap' || lpad(number::text, 2, '0')),
  now(), now()
FROM generate_series(1, 11) number;
UPDATE public.profiles SET is_public = true, mention_policy = 'everyone'
WHERE auth_user_id::text LIKE '77000000-0000-0000-0000-0000000001%';
DO $$
DECLARE
  rejected boolean := false;
  mention_text text;
BEGIN
  SELECT string_agg('@MentionCap' || lpad(number::text, 2, '0'), ' ')
  INTO mention_text
  FROM generate_series(1, 11) number;
  BEGIN
    INSERT INTO public.community_posts (
      id, author_id, content, audience, status, moderation_status
    )
    SELECT '77000000-0000-0000-0000-000000000060', author,
           mention_text, 'public', 'active', 'active'
    FROM mention_actors;
  EXCEPTION WHEN check_violation THEN
    rejected := SQLERRM = 'posts and comments can mention up to 10 people';
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'more than ten resolved mentions were accepted'; END IF;
END
$$;

-- Direct updates cannot bypass the canonical privacy RPC.
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"77000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '77000000-0000-0000-0000-000000000002', true);
DO $$
DECLARE changed_rows integer := 0;
BEGIN
  BEGIN
    UPDATE public.profiles SET mention_policy = 'everyone'
    WHERE id = (SELECT friend FROM mention_actors);
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    changed_rows := 0;
  END;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'mention privacy bypassed the canonical RPC'; END IF;
END
$$;
SELECT public.set_own_social_privacy(
  true, 'public', true, true, 'everyone', true, false, 'nobody'
);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT mention_policy FROM public.profiles
      WHERE id = (SELECT friend FROM mention_actors)) <> 'nobody' THEN
    RAISE EXCEPTION 'privacy RPC did not update mention policy';
  END IF;
END
$$;

ROLLBACK;
