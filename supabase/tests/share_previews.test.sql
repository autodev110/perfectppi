\set ON_ERROR_STOP on
BEGIN;

-- Plan 15.4: share previews answer for the anonymous audience only.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('7a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sp-public@example.test', '', '{}', '{"username":"SpPublic"}', now(), now()),
  ('7a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sp-private@example.test', '', '{}', '{"username":"SpPrivate"}', now(), now());

UPDATE public.profiles SET is_public = true, display_name = 'Pat Public', bio = 'E30 tinkerer', created_at = now() - interval '30 days'
WHERE auth_user_id = '7a000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET is_public = false, created_at = now() - interval '30 days'
WHERE auth_user_id = '7a000000-0000-0000-0000-000000000002';

CREATE TEMP TABLE sp AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '7a000000-0000-0000-0000-000000000001') AS pub,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7a000000-0000-0000-0000-000000000002') AS priv;

INSERT INTO public.vehicles (id, owner_id, vin, year, make, model, visibility)
SELECT '7a000000-0000-0000-0000-000000000100', pub, 'WBAAA1305H8250000', 1989, 'BMW', '325is', 'public' FROM sp;

INSERT INTO public.community_posts (id, author_id, vehicle_id, content, audience, status, moderation_status)
SELECT '7a000000-0000-0000-0000-000000000200', pub, '7a000000-0000-0000-0000-000000000100',
       E'New downpipe on the E30.\n\nSounds   great, no CEL. VIN ends in 0000 by the way.', 'public', 'active', 'active' FROM sp;
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT '7a000000-0000-0000-0000-000000000201', pub, 'Friends only thoughts', 'friends', 'active', 'active' FROM sp;
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT '7a000000-0000-0000-0000-000000000202', priv, 'Private author post', 'friends', 'active', 'active' FROM sp;

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.community_post_share_preview('7a000000-0000-0000-0000-000000000200');
  IF NOT FOUND THEN RAISE EXCEPTION 'a public post by a public author should preview'; END IF;
  IF r.author_label <> 'Pat Public' OR r.vehicle_label <> '1989 BMW 325is' THEN
    RAISE EXCEPTION 'preview fields wrong: % / %', r.author_label, r.vehicle_label;
  END IF;
  IF r.excerpt LIKE '%  %' OR r.excerpt LIKE E'%\n%' THEN RAISE EXCEPTION 'excerpt should be whitespace-normalized: %', r.excerpt; END IF;
  IF length(r.excerpt) > 160 THEN RAISE EXCEPTION 'excerpt too long'; END IF;
  IF r.vehicle_label LIKE '%WBAAA%' THEN RAISE EXCEPTION 'VIN must never reach a preview'; END IF;

  IF EXISTS (SELECT 1 FROM public.community_post_share_preview('7a000000-0000-0000-0000-000000000201')) THEN
    RAISE EXCEPTION 'friends-only posts must not preview';
  END IF;
  IF EXISTS (SELECT 1 FROM public.community_post_share_preview('7a000000-0000-0000-0000-000000000202')) THEN
    RAISE EXCEPTION 'private-author posts must not preview';
  END IF;

  -- The vehicle going private takes the post preview with it.
  UPDATE public.vehicles SET visibility = 'friends' WHERE id = '7a000000-0000-0000-0000-000000000100';
  IF EXISTS (SELECT 1 FROM public.community_post_share_preview('7a000000-0000-0000-0000-000000000200')) THEN
    RAISE EXCEPTION 'a post about a non-public vehicle must not preview';
  END IF;
  UPDATE public.vehicles SET visibility = 'public' WHERE id = '7a000000-0000-0000-0000-000000000100';

  -- Hidden content stops resolving.
  UPDATE public.community_posts SET moderation_status = 'pending_review' WHERE id = '7a000000-0000-0000-0000-000000000200';
  IF EXISTS (SELECT 1 FROM public.community_post_share_preview('7a000000-0000-0000-0000-000000000200')) THEN
    RAISE EXCEPTION 'hidden posts must not preview';
  END IF;
  UPDATE public.community_posts SET moderation_status = 'active' WHERE id = '7a000000-0000-0000-0000-000000000200';

  -- A suspended author disappears from previews.
  INSERT INTO public.user_enforcement_actions (profile_id, action_type, starts_at, reason_code)
  SELECT pub, 'suspension', now() - interval '1 minute', 'test' FROM sp;
  IF EXISTS (SELECT 1 FROM public.community_post_share_preview('7a000000-0000-0000-0000-000000000200')) THEN
    RAISE EXCEPTION 'suspended authors must not preview';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profile_share_preview('SpPublic')) THEN
    RAISE EXCEPTION 'suspended profiles must not preview';
  END IF;
  DELETE FROM public.user_enforcement_actions WHERE profile_id = (SELECT pub FROM sp);
END
$$;

-- Group posts never preview, whatever the group's visibility.
DO $$
DECLARE g public.community_groups;
BEGIN
  g := public.create_community_group((SELECT pub FROM sp), 'sp-public-group', 'SP Public Group', 'Open.', 'general');
  INSERT INTO public.community_posts (id, author_id, group_id, content, audience, status, moderation_status)
  VALUES ('7a000000-0000-0000-0000-000000000203', (SELECT pub FROM sp), g.id, 'Group text', 'public', 'active', 'active');
  IF EXISTS (SELECT 1 FROM public.community_post_share_preview('7a000000-0000-0000-0000-000000000203')) THEN
    RAISE EXCEPTION 'group posts must not preview';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_group_share_preview('SP-Public-Group')) THEN
    RAISE EXCEPTION 'public groups should preview (case-insensitive slug)';
  END IF;
  g := public.update_community_group_settings((SELECT pub FROM sp), g.id, 'SP Public Group', 'Open.', 'general',
    ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, 'members', 'unlisted', 'invite_only');
  IF EXISTS (SELECT 1 FROM public.community_group_share_preview('sp-public-group')) THEN
    RAISE EXCEPTION 'unlisted groups must not preview';
  END IF;
  g := public.update_community_group_settings((SELECT pub FROM sp), g.id, 'SP Public Group', 'Open.', 'general',
    ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, 'members', 'private', 'request_approval');
  IF NOT EXISTS (SELECT 1 FROM public.community_group_share_preview('sp-public-group') WHERE visibility = 'private') THEN
    RAISE EXCEPTION 'private groups preview their shell';
  END IF;
  PERFORM public.archive_group((SELECT pub FROM sp), g.id);
  IF EXISTS (SELECT 1 FROM public.community_group_share_preview('sp-public-group')) THEN
    RAISE EXCEPTION 'archived groups must not preview';
  END IF;
END
$$;

-- Profiles: public + exact lookup allowed; private profiles never.
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.profile_share_preview('sppublic');
  IF NOT FOUND OR r.display_name <> 'Pat Public' OR r.bio <> 'E30 tinkerer' THEN RAISE EXCEPTION 'public profile should preview'; END IF;
  IF EXISTS (SELECT 1 FROM public.profile_share_preview('SpPrivate')) THEN RAISE EXCEPTION 'private profiles must not preview'; END IF;
  UPDATE public.profiles SET allow_exact_username_lookup = false WHERE id = (SELECT pub FROM sp);
  IF EXISTS (SELECT 1 FROM public.profile_share_preview('sppublic')) THEN RAISE EXCEPTION 'lookup-disabled profiles must not preview'; END IF;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.community_post_share_preview(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.profile_share_preview(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'share previews leaked to clients';
  END IF;
END
$$;

ROLLBACK;
