\set ON_ERROR_STOP on
BEGIN;

-- Plan 25.1: structured listing filters and saved searches with daily notices.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('7e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ss-buyer@example.test', '', '{}', '{"username":"SsBuyer"}', now(), now()),
  ('7e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ss-seller@example.test', '', '{}', '{"username":"SsSeller"}', now(), now()),
  ('7e000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ss-techseller@example.test', '', '{}', '{"username":"SsTechSeller"}', now(), now());
UPDATE public.profiles SET is_public = true WHERE auth_user_id::text LIKE '7e000000-%';
UPDATE public.profiles SET role = 'technician' WHERE auth_user_id = '7e000000-0000-0000-0000-000000000003';

CREATE TEMP TABLE ss AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '7e000000-0000-0000-0000-000000000001') AS buyer,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7e000000-0000-0000-0000-000000000002') AS seller,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7e000000-0000-0000-0000-000000000003') AS techseller;
INSERT INTO public.technician_profiles (profile_id) SELECT techseller FROM ss;

INSERT INTO public.vehicles (id, owner_id, year, make, model, trim, mileage, transmission, drivetrain, body_style, visibility)
SELECT '7e000000-0000-0000-0000-000000000100', seller, 2016, 'Mazda', 'MX-5', 'Club', 41000, '6-speed manual', 'RWD', 'Convertible', 'public' FROM ss;
INSERT INTO public.vehicles (id, owner_id, year, make, model, mileage, transmission, drivetrain, body_style, visibility)
SELECT '7e000000-0000-0000-0000-000000000101', techseller, 2021, 'Toyota', 'RAV4', 22000, 'Automatic', 'AWD', 'SUV', 'public' FROM ss;
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, location, status, created_at)
SELECT '7e000000-0000-0000-0000-000000000200', '7e000000-0000-0000-0000-000000000100', seller, 'Club edition Miata', 1850000, 'Portland, OR', 'active', now() - interval '2 days' FROM ss;
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, location, status, created_at)
SELECT '7e000000-0000-0000-0000-000000000201', '7e000000-0000-0000-0000-000000000101', techseller, 'Low-mile RAV4', 2990000, 'Seattle, WA', 'active', now() - interval '2 days' FROM ss;
-- "Inspected" means the seller shared an inspection (plan 25.3): the seller's
-- own completed self-inspection, attached to the Miata listing.
INSERT INTO public.ppi_requests (id, vehicle_id, requester_id, whose_car, requester_role, performer_type, ppi_type, status, inspection_scope)
SELECT '7e000000-0000-0000-0000-000000000300', '7e000000-0000-0000-0000-000000000100', seller, 'own', 'selling', 'self', 'personal', 'completed', 'complete' FROM ss;
INSERT INTO public.ppi_submissions (ppi_request_id, performer_id, version, is_current, status, submitted_at, completed_at)
SELECT '7e000000-0000-0000-0000-000000000300', seller, 1, true, 'completed', now() - interval '1 day', now() - interval '1 day' FROM ss;
SELECT public.attach_listing_inspection((SELECT seller FROM ss), '7e000000-0000-0000-0000-000000000200', '7e000000-0000-0000-0000-000000000300');

-- ---------------------------------------------------------------------------
-- 1. Filter semantics
-- ---------------------------------------------------------------------------
DO $$
DECLARE miata uuid := '7e000000-0000-0000-0000-000000000200'; rav uuid := '7e000000-0000-0000-0000-000000000201';
BEGIN
  IF NOT public.marketplace_listing_matches_filters(miata, '{"make":"mazda","transmission":"manual","drivetrain":"rwd","bodyStyle":"convertible"}') THEN
    RAISE EXCEPTION 'structured text filters should match case-insensitively';
  END IF;
  IF public.marketplace_listing_matches_filters(miata, '{"maxMileage": 30000}') THEN RAISE EXCEPTION 'max mileage should exclude'; END IF;
  IF NOT public.marketplace_listing_matches_filters(rav, '{"maxMileage": 30000, "minYear": 2020, "maxPrice": 30000}') THEN RAISE EXCEPTION 'ranges should include'; END IF;
  IF public.marketplace_listing_matches_filters(rav, '{"maxPrice": 25000}') THEN RAISE EXCEPTION 'max price is in dollars'; END IF;
  IF NOT public.marketplace_listing_matches_filters(miata, '{"inspected": true}') THEN RAISE EXCEPTION 'inspected should match a shared inspection'; END IF;
  IF public.marketplace_listing_matches_filters(rav, '{"inspected": true}') THEN RAISE EXCEPTION 'uninspected listings must not match inspected'; END IF;
  IF NOT public.marketplace_listing_matches_filters(rav, '{"sellerType":"technician"}') OR public.marketplace_listing_matches_filters(miata, '{"sellerType":"technician"}') THEN
    RAISE EXCEPTION 'seller type should follow technician profiles';
  END IF;
  IF NOT public.marketplace_listing_matches_filters(miata, '{"sellerType":"member"}') THEN RAISE EXCEPTION 'member seller type'; END IF;
  IF NOT public.marketplace_listing_matches_filters(miata, '{"region":"portland"}') OR public.marketplace_listing_matches_filters(miata, '{"region":"seattle"}') THEN
    RAISE EXCEPTION 'region matches the listing location text';
  END IF;
  IF NOT public.marketplace_listing_matches_filters(miata, '{"q":"club edition"}') THEN RAISE EXCEPTION 'q matches title'; END IF;
  IF public.marketplace_listing_matches_filters(miata, '{"q":"100%"}') THEN RAISE EXCEPTION 'LIKE metacharacters are literal'; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Saved searches: limit, ownership, notices once per day, blocks
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  s public.marketplace_saved_searches;
  hit boolean := false;
  i integer;
BEGIN
  BEGIN
    PERFORM public.upsert_marketplace_saved_search((SELECT buyer FROM ss), NULL, 'Everything', '{}'::jsonb, true);
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'empty filters are refused'; END IF;

  s := public.upsert_marketplace_saved_search((SELECT buyer FROM ss), NULL, 'Manual Miatas', '{"make":"Mazda","transmission":"manual"}', true);
  IF s.profile_id <> (SELECT buyer FROM ss) OR s.name <> 'Manual Miatas' THEN RAISE EXCEPTION 'saved search shape'; END IF;
  s := public.upsert_marketplace_saved_search((SELECT buyer FROM ss), s.id, 'Manual Miatas under 20k', '{"make":"Mazda","transmission":"manual","maxPrice":20000}', true);
  IF s.filters->>'maxPrice' <> '20000' THEN RAISE EXCEPTION 'update should replace filters'; END IF;

  hit := false;
  BEGIN
    PERFORM public.upsert_marketplace_saved_search((SELECT seller FROM ss), s.id, 'Hijack', '{"make":"Mazda"}', true);
  EXCEPTION WHEN no_data_found THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'only the owner edits a saved search'; END IF;

  FOR i IN 1..9 LOOP
    PERFORM public.upsert_marketplace_saved_search((SELECT buyer FROM ss), NULL, 'Search ' || i, jsonb_build_object('minYear', 2000 + i), false);
  END LOOP;
  hit := false;
  BEGIN
    PERFORM public.upsert_marketplace_saved_search((SELECT buyer FROM ss), NULL, 'Eleventh', '{"minYear": 1999}', false);
  EXCEPTION WHEN check_violation THEN hit := SQLERRM = 'saved_search_limit';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'ten saved searches per member'; END IF;
  IF (SELECT count(*) FROM public.list_marketplace_saved_searches((SELECT buyer FROM ss))) <> 10 THEN RAISE EXCEPTION 'list should show all ten'; END IF;

  -- The matcher only considers listings created after last_matched_at.
  IF public.notify_marketplace_saved_search_matches() <> 0 THEN RAISE EXCEPTION 'nothing new yet'; END IF;
  UPDATE public.marketplace_saved_searches SET last_matched_at = now() - interval '3 days' WHERE id = s.id;
  IF public.notify_marketplace_saved_search_matches() <> 1 THEN RAISE EXCEPTION 'one notice for the matching search'; END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT buyer FROM ss) AND type = 'saved_search_match') <> 1 THEN
    RAISE EXCEPTION 'buyer should get one saved-search notice';
  END IF;
  IF (SELECT data->>'saved_search_id' FROM public.notifications WHERE user_id = (SELECT buyer FROM ss) AND type = 'saved_search_match') <> s.id::text THEN
    RAISE EXCEPTION 'notice should link the saved search';
  END IF;
  -- Same day again: nothing.
  IF public.notify_marketplace_saved_search_matches() <> 0 THEN RAISE EXCEPTION 'at most one notice per search per day'; END IF;

  -- A blocked seller's listing never counts.
  INSERT INTO public.profile_blocks (blocker_id, blocked_id) SELECT seller, buyer FROM ss;
  UPDATE public.marketplace_saved_searches SET last_matched_at = now() - interval '3 days' WHERE id = s.id;
  IF public.notify_marketplace_saved_search_matches() <> 0 THEN RAISE EXCEPTION 'blocked sellers must not trigger notices'; END IF;
  DELETE FROM public.profile_blocks;

  IF NOT public.delete_marketplace_saved_search((SELECT buyer FROM ss), s.id) THEN RAISE EXCEPTION 'owner deletes'; END IF;
  IF public.delete_marketplace_saved_search((SELECT seller FROM ss), s.id) THEN RAISE EXCEPTION 'delete is owner-only and idempotent'; END IF;
END
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.marketplace_saved_searches', 'SELECT')
     OR has_function_privilege('authenticated', 'public.upsert_marketplace_saved_search(uuid,uuid,text,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.notify_marketplace_saved_search_matches(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'saved searches leaked to clients';
  END IF;
END
$$;

ROLLBACK;
