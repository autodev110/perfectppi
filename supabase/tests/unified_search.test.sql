\set ON_ERROR_STOP on
BEGIN;

-- Plan 27.2: unified search understands automotive terms and never leaks
-- through results.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('7d000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'us-viewer@example.test', '', '{}', '{"username":"UsViewer"}', now(), now()),
  ('7d000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'us-owner@example.test', '', '{}', '{"username":"UsOwner"}', now(), now()),
  ('7d000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'us-blocked@example.test', '', '{}', '{"username":"UsBlocked"}', now(), now()),
  ('7d000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'us-tech@example.test', '', '{}', '{"username":"UsTech"}', now(), now());
UPDATE public.profiles SET is_public = true, created_at = now() - interval '30 days' WHERE auth_user_id::text LIKE '7d000000-%';
UPDATE public.profiles SET display_name = 'Sam Wrench', role = 'technician' WHERE auth_user_id = '7d000000-0000-0000-0000-000000000004';

CREATE TEMP TABLE us AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '7d000000-0000-0000-0000-000000000001') AS viewer,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7d000000-0000-0000-0000-000000000002') AS owner,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7d000000-0000-0000-0000-000000000003') AS blocked,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7d000000-0000-0000-0000-000000000004') AS tech;

INSERT INTO public.technician_profiles (profile_id, specialties, service_area, total_inspections)
SELECT tech, ARRAY['Subaru', 'EV diagnostics'], 'Portland, OR', 12 FROM us;

INSERT INTO public.vehicles (id, owner_id, vin, year, make, model, trim, nickname, visibility)
SELECT '7d000000-0000-0000-0000-000000000100', owner, 'JF1GV7E68CG000001', 2012, 'Subaru', 'WRX STI', 'Limited', 'Blue Beast', 'public' FROM us;
INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '7d000000-0000-0000-0000-000000000101', owner, 2019, 'Subaru', 'Outback', 'private' FROM us;
INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '7d000000-0000-0000-0000-000000000102', blocked, 2015, 'Subaru', 'BRZ', 'public' FROM us;

INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status)
SELECT '7d000000-0000-0000-0000-000000000200', '7d000000-0000-0000-0000-000000000100', owner, 'Clean STI, full service history', 2400000, 'active' FROM us;

INSERT INTO public.community_posts (id, author_id, vehicle_id, content, audience, status, moderation_status)
SELECT '7d000000-0000-0000-0000-000000000300', owner, '7d000000-0000-0000-0000-000000000100', 'Threw a P0420 after the downpipe swap. Cat efficiency?', 'public', 'active', 'active' FROM us;
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT '7d000000-0000-0000-0000-000000000301', owner, 'Friends only STI thoughts', 'friends', 'active', 'active' FROM us;
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT '7d000000-0000-0000-0000-000000000302', blocked, 'STI for sale soon, subie fans', 'public', 'active', 'active' FROM us;

DO $$
DECLARE g public.community_groups;
BEGIN
  g := public.create_community_group((SELECT owner FROM us), 'subie-club', 'Subie Club PDX', 'Subaru owners in Portland.', 'make_model',
    ARRAY[]::text[], 'Subaru', NULL, 2008, NULL, 'Portland, OR', 'members', 'public', 'open');
  g := public.create_community_group((SELECT owner FROM us), 'secret-sti', 'Secret STI Garage', 'Unlisted STI group.', 'make_model',
    ARRAY[]::text[], 'Subaru', 'WRX STI', NULL, NULL, NULL, 'members', 'unlisted', 'invite_only');
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Query understanding: aliases, years, diagnostic codes
-- ---------------------------------------------------------------------------
DO $$
DECLARE q record;
BEGIN
  SELECT * INTO q FROM public.community_search_terms('Subie 2012 p0420, Chevy');
  IF NOT ('subaru' = ANY(q.makes)) OR NOT ('chevrolet' = ANY(q.makes)) THEN RAISE EXCEPTION 'aliases should resolve: %', q.makes; END IF;
  IF NOT (2012 = ANY(q.years)) THEN RAISE EXCEPTION 'years should be extracted: %', q.years; END IF;
  IF NOT ('P0420' = ANY(q.codes)) THEN RAISE EXCEPTION 'diagnostic codes should be extracted: %', q.codes; END IF;
  IF '2012' = ANY(q.terms) THEN RAISE EXCEPTION 'years are not plain terms'; END IF;
  SELECT * INTO q FROM public.community_search_terms('100% _sure_');
  IF NOT ('100\%' = ANY(q.terms)) THEN RAISE EXCEPTION 'LIKE metacharacters must be escaped: %', q.terms; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Posts: alias + code search, blocks, audience
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.search_community_posts((SELECT viewer FROM us), 'p0420')) THEN
    RAISE EXCEPTION 'diagnostic codes should find posts';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_community_posts((SELECT viewer FROM us), 'subie') WHERE post_id = '7d000000-0000-0000-0000-000000000300') THEN
    RAISE EXCEPTION 'make aliases should match the attached vehicle';
  END IF;
  IF EXISTS (SELECT 1 FROM public.search_community_posts((SELECT viewer FROM us), 'sti') WHERE post_id = '7d000000-0000-0000-0000-000000000301') THEN
    RAISE EXCEPTION 'friends-only posts must not surface for strangers';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_community_posts((SELECT viewer FROM us), 'sti') WHERE post_id = '7d000000-0000-0000-0000-000000000302') THEN
    RAISE EXCEPTION 'public posts should surface before a block';
  END IF;
  INSERT INTO public.profile_blocks (blocker_id, blocked_id) SELECT blocked, viewer FROM us;
  IF EXISTS (SELECT 1 FROM public.search_community_posts((SELECT viewer FROM us), 'sti') WHERE post_id = '7d000000-0000-0000-0000-000000000302') THEN
    RAISE EXCEPTION 'blocked authors must not surface';
  END IF;
  UPDATE public.community_posts SET moderation_status = 'pending_review' WHERE id = '7d000000-0000-0000-0000-000000000300';
  IF EXISTS (SELECT 1 FROM public.search_community_posts((SELECT viewer FROM us), 'p0420')) THEN
    RAISE EXCEPTION 'hidden posts must leave results';
  END IF;
  UPDATE public.community_posts SET moderation_status = 'active' WHERE id = '7d000000-0000-0000-0000-000000000300';
  IF EXISTS (SELECT 1 FROM public.search_community_posts((SELECT viewer FROM us), 'x')) THEN
    RAISE EXCEPTION 'one-character queries return nothing';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Groups, vehicles, listings, technicians
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.search_community_groups((SELECT viewer FROM us), 'portland subaru')) THEN
    RAISE EXCEPTION 'groups should match region and make';
  END IF;
  IF EXISTS (SELECT 1 FROM public.search_community_groups((SELECT viewer FROM us), 'secret')) THEN
    RAISE EXCEPTION 'unlisted groups must not be discoverable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_community_groups((SELECT owner FROM us), 'secret')) THEN
    RAISE EXCEPTION 'members find their unlisted groups';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_community_groups((SELECT viewer FROM us), '2012 subaru')) THEN
    RAISE EXCEPTION 'a year inside the group range should count';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.search_vehicles((SELECT viewer FROM us), 'blue beast')) THEN
    RAISE EXCEPTION 'nicknames should match public vehicles';
  END IF;
  IF EXISTS (SELECT 1 FROM public.search_vehicles((SELECT viewer FROM us), 'outback')) THEN
    RAISE EXCEPTION 'private vehicles never surface';
  END IF;
  IF EXISTS (SELECT 1 FROM public.search_vehicles((SELECT viewer FROM us), 'brz')) THEN
    RAISE EXCEPTION 'a blocker''s vehicle must not surface';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_vehicles((SELECT viewer FROM us), '2012')) THEN
    RAISE EXCEPTION 'a bare year should find vehicles';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.search_marketplace_listings((SELECT viewer FROM us), 'service history')) THEN
    RAISE EXCEPTION 'listings should match titles';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_marketplace_listings((SELECT viewer FROM us), 'subie 2012')) THEN
    RAISE EXCEPTION 'listings should match alias + year';
  END IF;
  UPDATE public.vehicles SET visibility = 'friends' WHERE id = '7d000000-0000-0000-0000-000000000100';
  IF EXISTS (SELECT 1 FROM public.search_marketplace_listings((SELECT viewer FROM us), 'service history')) THEN
    RAISE EXCEPTION 'listings on non-public vehicles must not surface';
  END IF;
  UPDATE public.vehicles SET visibility = 'public' WHERE id = '7d000000-0000-0000-0000-000000000100';

  IF NOT EXISTS (SELECT 1 FROM public.search_technicians((SELECT viewer FROM us), 'wrench')) THEN
    RAISE EXCEPTION 'technicians should match names';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_technicians((SELECT viewer FROM us), 'ev diagnostics')) THEN
    RAISE EXCEPTION 'technicians should match specialties';
  END IF;
  UPDATE public.profiles SET is_public = false WHERE id = (SELECT tech FROM us);
  IF EXISTS (SELECT 1 FROM public.search_technicians((SELECT viewer FROM us), 'wrench')) THEN
    RAISE EXCEPTION 'private technician profiles must not surface';
  END IF;
  UPDATE public.profiles SET is_public = true WHERE id = (SELECT tech FROM us);

  IF NOT EXISTS (SELECT 1 FROM public.search_make_suggestions('subru') WHERE suggestion = 'Subaru') THEN
    RAISE EXCEPTION 'typo suggestions should offer makes';
  END IF;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.search_community_posts(uuid,text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.search_vehicles(uuid,text,integer,integer)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.vehicle_make_aliases', 'SELECT') THEN
    RAISE EXCEPTION 'search internals leaked to clients';
  END IF;
END
$$;

ROLLBACK;
