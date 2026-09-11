\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('72000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ug-founder@example.test', '', '{}', '{"username":"UgFounder"}', now(), now()),
  ('72000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ug-newbie@example.test', '', '{}', '{"username":"UgNewbie"}', now(), now()),
  ('72000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ug-member@example.test', '', '{}', '{"username":"UgMember"}', now(), now()),
  ('72000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ug-suspended@example.test', '', '{}', '{"username":"UgSuspend"}', now(), now());

UPDATE public.profiles SET is_public = true WHERE auth_user_id::text LIKE '72000000-%';
-- Founder and member are established accounts; newbie signed up just now.
UPDATE public.profiles SET created_at = now() - interval '30 days'
WHERE auth_user_id IN ('72000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000004');

CREATE TEMP TABLE ug AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '72000000-0000-0000-0000-000000000001') AS founder,
  (SELECT id FROM public.profiles WHERE auth_user_id = '72000000-0000-0000-0000-000000000002') AS newbie,
  (SELECT id FROM public.profiles WHERE auth_user_id = '72000000-0000-0000-0000-000000000003') AS member,
  (SELECT id FROM public.profiles WHERE auth_user_id = '72000000-0000-0000-0000-000000000004') AS suspended,
  NULL::uuid AS group_id;

INSERT INTO public.user_enforcement_actions (profile_id, action_type, starts_at, reason_code)
SELECT suspended, 'temporary_posting_hold', now() - interval '1 hour', 'test' FROM ug;

-- ---------------------------------------------------------------------------
-- 1. Creation gates: account age, enforcement, rate limits, slug uniqueness
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean := false;
  g public.community_groups;
BEGIN
  BEGIN
    PERFORM public.create_community_group((SELECT newbie FROM ug), 'newbie-club', 'Newbie Club', 'Too soon.', 'general');
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'group_creation_account_too_new';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'week-old accounts should not create groups'; END IF;

  hit := false;
  BEGIN
    PERFORM public.create_community_group((SELECT suspended FROM ug), 'held-club', 'Held Club', 'Nope.', 'general');
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'group_creation_restricted';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'restricted accounts should not create groups'; END IF;

  g := public.create_community_group(
    (SELECT founder FROM ug), 'Miata-Meetups', 'Miata Meetups', 'Weekend drives and wrenching.', 'local_club',
    ARRAY['Be kind'], 'Mazda', 'MX-5', 1990, NULL, 'Portland, OR', 'members'
  );
  UPDATE ug SET group_id = g.id;
  IF g.slug <> 'miata-meetups' OR g.is_staff_curated OR g.visibility <> 'public' OR g.join_policy <> 'open'
     OR g.location_region <> 'Portland, OR' OR g.posting_policy <> 'members' THEN
    RAISE EXCEPTION 'created group has wrong shape: % % %', g.slug, g.visibility, g.location_region;
  END IF;
  IF public.community_group_role_of((SELECT founder FROM ug), g.id) <> 'owner' THEN RAISE EXCEPTION 'creator must own'; END IF;
  IF (SELECT count(*) FROM public.community_group_creation_events WHERE actor_id = (SELECT founder FROM ug)) <> 1 THEN
    RAISE EXCEPTION 'creation must be logged';
  END IF;

  hit := false;
  BEGIN
    PERFORM public.create_community_group((SELECT member FROM ug), 'MIATA-meetups', 'Copy', 'Duplicate slug.', 'general');
  EXCEPTION WHEN unique_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'slugs must be unique case-insensitively'; END IF;

  -- Second group today is fine, the third is rate-limited.
  PERFORM public.create_community_group((SELECT founder FROM ug), 'pnw-detailing', 'PNW Detailing', 'Paint care.', 'detailing');
  hit := false;
  BEGIN
    PERFORM public.create_community_group((SELECT founder FROM ug), 'third-today', 'Third', 'Too many.', 'general');
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'group_creation_rate_limited';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'third group in 24h should be rate limited'; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. A member-created group is fully live: join, post, comment, visibility,
--    member list — without staff curation.
-- ---------------------------------------------------------------------------
SELECT public.join_curated_community_group(member, group_id) FROM ug;
INSERT INTO public.community_posts (id, author_id, group_id, content, audience, status, moderation_status)
SELECT '73000000-0000-0000-0000-000000000001', member, group_id, 'First drive this Sunday', 'public', 'active', 'active' FROM ug;
INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status)
SELECT '73000000-0000-0000-0000-000000000001', founder, 'See you there', 'active', 'active' FROM ug;
DO $$
BEGIN
  IF NOT public.social_can_view_community_post((SELECT newbie FROM ug), '73000000-0000-0000-0000-000000000001', false) THEN
    RAISE EXCEPTION 'public member-created group posts should be visible to signed-in members';
  END IF;
  IF (SELECT count(*) FROM public.list_group_members((SELECT newbie FROM ug), (SELECT group_id FROM ug))) <> 2 THEN
    RAISE EXCEPTION 'member list should work for member-created groups';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Settings: owner only; announcement mode restricts posting to moderators
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean := false;
  g public.community_groups;
BEGIN
  BEGIN
    PERFORM public.update_community_group_settings((SELECT member FROM ug), (SELECT group_id FROM ug),
      'Hijack', 'x', 'general', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, 'members');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'members must not change settings'; END IF;

  g := public.update_community_group_settings((SELECT founder FROM ug), (SELECT group_id FROM ug),
    'Miata Meetups PDX', 'Weekend drives, wrenching, and announcements.', 'local_club',
    ARRAY['Be kind', 'No sales spam'], 'Mazda', 'MX-5', 1990, NULL, 'Portland, OR', 'moderators');
  IF g.name <> 'Miata Meetups PDX' OR g.posting_policy <> 'moderators' OR g.slug <> 'miata-meetups' THEN
    RAISE EXCEPTION 'settings update wrong: % % %', g.name, g.posting_policy, g.slug;
  END IF;
  IF (SELECT count(*) FROM public.community_group_moderation_events WHERE group_id = g.id AND action = 'settings_changed') <> 1 THEN
    RAISE EXCEPTION 'settings changes must be audited';
  END IF;

  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
    SELECT member, group_id, 'Can I post?', 'public', 'active', 'active' FROM ug;
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'only group moderators can post here';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'members must not post in an announcement group'; END IF;

  INSERT INTO public.community_posts (id, author_id, group_id, content, audience, status, moderation_status)
  SELECT '73000000-0000-0000-0000-000000000002', founder, group_id, 'Announcement', 'public', 'active', 'active' FROM ug;
  -- Members still comment on announcements.
  INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status)
  SELECT '73000000-0000-0000-0000-000000000002', member, 'Noted!', 'active', 'active' FROM ug;
END
$$;

-- Nothing here is client-callable.
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.create_community_group(uuid,text,text,text,text,text[],text,text,integer,integer,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.update_community_group_settings(uuid,uuid,text,text,text,text[],text,text,integer,integer,text,text)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.community_group_creation_events', 'SELECT') THEN
    RAISE EXCEPTION 'group creation leaked to authenticated clients';
  END IF;
END
$$;

ROLLBACK;
