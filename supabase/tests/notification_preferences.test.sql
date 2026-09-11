\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('6a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'notif-author@example.test', '', '{}', '{"username":"NotifAuthor"}', now(), now()),
  ('6a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'notif-bea@example.test', '', '{}', '{"username":"NotifBea"}', now(), now()),
  ('6a000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'notif-cal@example.test', '', '{}', '{"username":"NotifCal"}', now(), now()),
  ('6a000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'notif-dee@example.test', '', '{}', '{"username":"NotifDee"}', now(), now());

UPDATE public.profiles SET is_public = true WHERE auth_user_id::text LIKE '6a000000-%';
UPDATE public.profiles SET display_name = 'Bea Bolt' WHERE auth_user_id = '6a000000-0000-0000-0000-000000000002';

CREATE TEMP TABLE n_ids AS
SELECT
  max(id::text) FILTER (WHERE auth_user_id = '6a000000-0000-0000-0000-000000000001')::uuid AS author,
  max(id::text) FILTER (WHERE auth_user_id = '6a000000-0000-0000-0000-000000000002')::uuid AS bea,
  max(id::text) FILTER (WHERE auth_user_id = '6a000000-0000-0000-0000-000000000003')::uuid AS cal,
  max(id::text) FILTER (WHERE auth_user_id = '6a000000-0000-0000-0000-000000000004')::uuid AS dee
FROM public.profiles;

INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT '6b000000-0000-0000-0000-000000000001', author, 'Brake bleed question', 'public', 'active', 'active'
FROM n_ids;

-- ---------------------------------------------------------------------------
-- 1. Defaults and locked categories
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean := false;
BEGIN
  IF (SELECT count(*) FROM public.list_notification_preferences((SELECT author FROM n_ids))) <> 6 THEN
    RAISE EXCEPTION 'expected six categories';
  END IF;
  IF EXISTS (SELECT 1 FROM public.list_notification_preferences((SELECT author FROM n_ids)) WHERE NOT in_app OR NOT push) THEN
    RAISE EXCEPTION 'everything should default to enabled';
  END IF;
  IF (SELECT count(*) FROM public.list_notification_preferences((SELECT author FROM n_ids)) WHERE locked) <> 2 THEN
    RAISE EXCEPTION 'safety and account must be locked';
  END IF;
  BEGIN
    PERFORM public.set_notification_preference((SELECT author FROM n_ids), 'safety', false, false);
  EXCEPTION WHEN check_violation THEN
    hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'safety notices must not be switchable'; END IF;
  IF has_table_privilege('authenticated', 'public.notification_preferences', 'SELECT')
     OR has_function_privilege('authenticated', 'public.set_notification_preference(uuid,text,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'preferences leaked to authenticated clients';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Comment aggregation: one unread notice per post per day, distinct actors
-- ---------------------------------------------------------------------------
INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status)
SELECT '6b000000-0000-0000-0000-000000000001', bea, 'Use a pressure bleeder', 'active', 'active' FROM n_ids;
DO $$
DECLARE
  n public.notifications%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.notifications WHERE user_id = (SELECT author FROM n_ids) AND type = 'post_comment';
  IF NOT FOUND THEN RAISE EXCEPTION 'author should be told about the comment'; END IF;
  IF n.body <> 'Bea Bolt commented on your post' OR (n.data->>'count')::int <> 1 THEN
    RAISE EXCEPTION 'first comment notice wrong: % / %', n.body, n.data;
  END IF;
  IF n.data->>'post_id' <> '6b000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'post id missing'; END IF;
END
$$;
INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status)
SELECT '6b000000-0000-0000-0000-000000000001', cal, 'Gravity bleed works too', 'active', 'active' FROM n_ids;
INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status)
SELECT '6b000000-0000-0000-0000-000000000001', bea, 'Second thought', 'active', 'active' FROM n_ids;
DO $$
DECLARE
  n public.notifications%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT author FROM n_ids) AND type = 'post_comment') <> 1 THEN
    RAISE EXCEPTION 'comments on one post must aggregate into one unread notice';
  END IF;
  SELECT * INTO n FROM public.notifications WHERE user_id = (SELECT author FROM n_ids) AND type = 'post_comment';
  IF (n.data->>'count')::int <> 2 OR n.title <> '2 comments on your post' THEN
    RAISE EXCEPTION 'aggregate should count distinct actors: % / %', n.title, n.data;
  END IF;
  IF n.body NOT LIKE '% and 1 other commented on your post' THEN
    RAISE EXCEPTION 'aggregate body wrong: %', n.body;
  END IF;
END
$$;

-- The author's own comment and a comment on a hidden post are silent.
INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status)
SELECT '6b000000-0000-0000-0000-000000000001', author, 'Thanks all', 'active', 'active' FROM n_ids;
DO $$
BEGIN
  IF (SELECT (data->>'count')::int FROM public.notifications WHERE user_id = (SELECT author FROM n_ids) AND type = 'post_comment') <> 2 THEN
    RAISE EXCEPTION 'own comment must not count';
  END IF;
END
$$;

-- After reading, new activity starts a fresh notice.
DO $$
DECLARE
  cleared integer;
BEGIN
  cleared := public.mark_all_notifications_read((SELECT author FROM n_ids));
  IF cleared <> 1 THEN RAISE EXCEPTION 'mark all read should clear one notice, got %', cleared; END IF;
END
$$;
INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status)
SELECT '6b000000-0000-0000-0000-000000000001', dee, 'Late to the party', 'active', 'active' FROM n_ids;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT author FROM n_ids) AND type = 'post_comment' AND read_at IS NULL) <> 1
     OR (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT author FROM n_ids) AND type = 'post_comment') <> 2 THEN
    RAISE EXCEPTION 'read notices must not be reopened';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Like aggregation, mute silence, blocked silence
-- ---------------------------------------------------------------------------
SELECT public.set_community_post_like(bea, '6b000000-0000-0000-0000-000000000001', true) FROM n_ids;
SELECT public.set_community_post_like(cal, '6b000000-0000-0000-0000-000000000001', true) FROM n_ids;
DO $$
DECLARE
  n public.notifications%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.notifications WHERE user_id = (SELECT author FROM n_ids) AND type = 'post_likes';
  IF NOT FOUND OR (n.data->>'count')::int <> 2 OR n.title <> '2 likes on your post' THEN
    RAISE EXCEPTION 'like aggregate wrong: % / %', n.title, n.data;
  END IF;
END
$$;
INSERT INTO public.profile_mutes (muter_id, muted_id, mute_notifications)
SELECT author, dee, true FROM n_ids;
SELECT public.set_community_post_like(dee, '6b000000-0000-0000-0000-000000000001', true) FROM n_ids;
DO $$
BEGIN
  IF (SELECT (data->>'count')::int FROM public.notifications WHERE user_id = (SELECT author FROM n_ids) AND type = 'post_likes') <> 2 THEN
    RAISE EXCEPTION 'a muted member must not add to the notice';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Preferences are enforced at insert time for every producer
-- ---------------------------------------------------------------------------
SELECT public.set_notification_preference(bea, 'social', false, true) FROM n_ids;
SELECT public.send_friend_request((SELECT author FROM n_ids), (SELECT bea FROM n_ids));
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.notifications WHERE user_id = (SELECT bea FROM n_ids) AND type = 'friend_request') THEN
    RAISE EXCEPTION 'social in-app notices must be suppressed when switched off';
  END IF;
  IF public.notification_allowed((SELECT bea FROM n_ids), 'friend_request', 'push') IS NOT TRUE THEN
    RAISE EXCEPTION 'push preference should be independent of in-app';
  END IF;
  IF public.notification_allowed((SELECT bea FROM n_ids), 'moderation_decision', 'in_app') IS NOT TRUE THEN
    RAISE EXCEPTION 'safety notices are always allowed';
  END IF;
  -- The relationship itself still changed; only the notice was dropped.
  IF public.friend_relationship_state((SELECT bea FROM n_ids), (SELECT author FROM n_ids)) <> 'incoming_request' THEN
    RAISE EXCEPTION 'request should exist without a notice';
  END IF;
END
$$;

ROLLBACK;
