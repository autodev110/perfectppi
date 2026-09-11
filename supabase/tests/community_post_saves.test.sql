\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('67000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'save-author@example.test', '', '{}',
   '{"username":"SaveAuthor"}', now(), now()),
  ('67000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'save-reader@example.test', '', '{}',
   '{"username":"SaveReader"}', now(), now()),
  ('67000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'save-private@example.test', '', '{}',
   '{"username":"SavePrivate"}', now(), now());

UPDATE public.profiles SET is_public = true
WHERE auth_user_id IN ('67000000-0000-0000-0000-000000000001', '67000000-0000-0000-0000-000000000002');

CREATE TEMP TABLE save_ids AS
SELECT
  max(id::text) FILTER (WHERE auth_user_id = '67000000-0000-0000-0000-000000000001')::uuid AS author_id,
  max(id::text) FILTER (WHERE auth_user_id = '67000000-0000-0000-0000-000000000002')::uuid AS reader_id,
  max(id::text) FILTER (WHERE auth_user_id = '67000000-0000-0000-0000-000000000003')::uuid AS private_id
FROM public.profiles;

INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT '68000000-0000-0000-0000-000000000001', author_id, 'Public post', 'public', 'active', 'active'
FROM save_ids;
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT '68000000-0000-0000-0000-000000000002', private_id, 'Friends-only post', 'friends', 'active', 'active'
FROM save_ids;

-- Storage and RPCs are service-only.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.community_post_saves', 'SELECT')
     OR has_function_privilege('authenticated', 'public.set_community_post_save(uuid,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.list_saved_community_post_ids(uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.member_activity_badges(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'save storage or RPCs leaked to authenticated clients';
  END IF;
END
$$;

-- Save a visible post; idempotent; appears in the saved list with state true.
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public.set_community_post_save((SELECT reader_id FROM save_ids), '68000000-0000-0000-0000-000000000001', true);
  IF (r->>'saved')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'save should succeed: %', r; END IF;
  r := public.set_community_post_save((SELECT reader_id FROM save_ids), '68000000-0000-0000-0000-000000000001', true);
  IF (SELECT count(*) FROM public.community_post_saves) <> 1 THEN RAISE EXCEPTION 'save must be idempotent'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_post_save_states((SELECT reader_id FROM save_ids), ARRAY['68000000-0000-0000-0000-000000000001'::uuid])
    WHERE saved
  ) THEN RAISE EXCEPTION 'save state should read true'; END IF;
  IF (SELECT count(*) FROM public.list_saved_community_post_ids((SELECT reader_id FROM save_ids))) <> 1 THEN
    RAISE EXCEPTION 'saved list should contain the post';
  END IF;
  -- Saves are private: the author sees nothing about it.
  IF EXISTS (
    SELECT 1 FROM public.community_post_save_states((SELECT author_id FROM save_ids), ARRAY['68000000-0000-0000-0000-000000000001'::uuid])
    WHERE saved
  ) THEN RAISE EXCEPTION 'save leaked to another member'; END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT author_id FROM save_ids)) <> 0 THEN
    RAISE EXCEPTION 'saving must not notify the author';
  END IF;
END
$$;

-- A post the actor cannot see cannot be saved.
DO $$
DECLARE
  hit boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_community_post_save((SELECT reader_id FROM save_ids), '68000000-0000-0000-0000-000000000002', true);
  EXCEPTION WHEN insufficient_privilege THEN
    hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'friends-only post was saved by a non-friend'; END IF;
END
$$;

-- Hiding the post removes it from the saved list without deleting the row;
-- restoring brings it back; unsaving always works.
UPDATE public.community_posts SET moderation_status = 'pending_review', status = 'hidden'
WHERE id = '68000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.list_saved_community_post_ids((SELECT reader_id FROM save_ids))) <> 0 THEN
    RAISE EXCEPTION 'hidden post must drop out of the saved list';
  END IF;
  IF (SELECT count(*) FROM public.community_post_saves) <> 1 THEN
    RAISE EXCEPTION 'hiding must not delete the save row';
  END IF;
END
$$;
UPDATE public.community_posts SET moderation_status = 'active', status = 'active'
WHERE id = '68000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  r jsonb;
BEGIN
  IF (SELECT count(*) FROM public.list_saved_community_post_ids((SELECT reader_id FROM save_ids))) <> 1 THEN
    RAISE EXCEPTION 'restored post should reappear in the saved list';
  END IF;
  r := public.set_community_post_save((SELECT reader_id FROM save_ids), '68000000-0000-0000-0000-000000000001', false);
  IF (r->>'saved')::boolean IS NOT FALSE OR (SELECT count(*) FROM public.community_post_saves) <> 0 THEN
    RAISE EXCEPTION 'unsave failed: %', r;
  END IF;
END
$$;

-- Activity badges: notifications, incoming requests (from available members
-- only), unread messages from others.
INSERT INTO public.notifications (user_id, type, title, body)
SELECT reader_id, 'message_received', 'x', 'y' FROM save_ids;
INSERT INTO public.notifications (user_id, type, title, body, read_at)
SELECT reader_id, 'message_received', 'x', 'y', now() FROM save_ids;
INSERT INTO public.friend_relationships (profile_low_id, profile_high_id, requested_by, status)
SELECT LEAST(author_id, reader_id), GREATEST(author_id, reader_id), author_id, 'pending' FROM save_ids;
INSERT INTO public.friend_relationships (profile_low_id, profile_high_id, requested_by, status)
SELECT LEAST(private_id, reader_id), GREATEST(private_id, reader_id), reader_id, 'pending' FROM save_ids;
INSERT INTO public.conversations (id) VALUES ('69000000-0000-0000-0000-000000000001');
INSERT INTO public.conversation_participants (conversation_id, profile_id)
SELECT '69000000-0000-0000-0000-000000000001'::uuid, author_id FROM save_ids
UNION ALL
SELECT '69000000-0000-0000-0000-000000000001'::uuid, reader_id FROM save_ids;
INSERT INTO public.messages (conversation_id, sender_id, content, status)
SELECT '69000000-0000-0000-0000-000000000001'::uuid, author_id, 'hello', 'unread'::public.message_status FROM save_ids
UNION ALL
SELECT '69000000-0000-0000-0000-000000000001'::uuid, author_id, 'seen', 'read'::public.message_status FROM save_ids
UNION ALL
SELECT '69000000-0000-0000-0000-000000000001'::uuid, reader_id, 'mine', 'unread'::public.message_status FROM save_ids;

DO $$
DECLARE
  badges jsonb;
BEGIN
  badges := public.member_activity_badges((SELECT reader_id FROM save_ids));
  IF (badges->>'unreadNotifications')::int <> 1 THEN RAISE EXCEPTION 'unread notifications: %', badges; END IF;
  IF (badges->>'pendingFriendRequests')::int <> 1 THEN RAISE EXCEPTION 'pending requests (own outgoing must not count): %', badges; END IF;
  IF (badges->>'unreadMessages')::int <> 1 THEN RAISE EXCEPTION 'unread messages (own and read must not count): %', badges; END IF;

  -- A blocked requester's pending request is removed by the block; a
  -- suspended requester's request is not counted.
  INSERT INTO public.user_enforcement_actions (profile_id, action_type, starts_at, reason_code)
  VALUES ((SELECT author_id FROM save_ids), 'suspension', now() - interval '1 minute', 'test');
  badges := public.member_activity_badges((SELECT reader_id FROM save_ids));
  IF (badges->>'pendingFriendRequests')::int <> 0 THEN RAISE EXCEPTION 'suspended requester still counted: %', badges; END IF;
END
$$;

ROLLBACK;
