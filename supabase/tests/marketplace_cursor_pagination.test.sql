\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('b6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cursor-market-seller@example.test', '', '{}', '{"username":"CursorSeller"}', now(), now()),
  ('b6000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cursor-market-buyer@example.test', '', '{}', '{"username":"CursorBuyer"}', now(), now()),
  ('b6000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cursor-market-tech@example.test', '', '{}', '{"username":"CursorTech"}', now(), now()),
  ('b6000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cursor-market-blocked@example.test', '', '{}', '{"username":"CursorBlocked"}', now(), now());

UPDATE public.profiles SET is_public = true, created_at = now() - interval '30 days'
WHERE auth_user_id::text LIKE 'b6000000-%';
UPDATE public.profiles SET role = 'technician'
WHERE auth_user_id = 'b6000000-0000-0000-0000-000000000003';

CREATE TEMP TABLE market_cursor_ids AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b6000000-0000-0000-0000-000000000001') seller,
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b6000000-0000-0000-0000-000000000002') buyer,
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b6000000-0000-0000-0000-000000000003') tech,
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b6000000-0000-0000-0000-000000000004') blocked_seller;
INSERT INTO public.technician_profiles (profile_id) SELECT tech FROM market_cursor_ids;

INSERT INTO public.vehicles (
  id, owner_id, year, make, model, trim, mileage, transmission, drivetrain, body_style, visibility
)
SELECT vehicle_id, seller, year, 'Cursor', model, 'Touring', mileage, 'Automatic', 'FWD', 'Sedan', 'public'
FROM market_cursor_ids
CROSS JOIN (VALUES
  ('b6100000-0000-0000-0000-000000000001'::uuid, 2018, 'One', 50000),
  ('b6100000-0000-0000-0000-000000000002'::uuid, 2019, 'Two', 10000),
  ('b6100000-0000-0000-0000-000000000003'::uuid, 2020, 'Three', 30000),
  ('b6100000-0000-0000-0000-000000000004'::uuid, 2021, 'Four', NULL::integer),
  ('b6100000-0000-0000-0000-000000000005'::uuid, 2022, 'Five', 20000),
  ('b6100000-0000-0000-0000-000000000007'::uuid, 2023, 'Paused', 15000)
) seed(vehicle_id, year, model, mileage);

INSERT INTO public.marketplace_listings (
  id, vehicle_id, seller_id, title, asking_price_cents, location, status, created_at
)
SELECT listing_id, vehicle_id, seller, 'Cursor vehicle ' || ordinal, price, 'Tbilisi, GE', status, created_at
FROM market_cursor_ids
CROSS JOIN (VALUES
  ('b6200000-0000-0000-0000-000000000001'::uuid, 'b6100000-0000-0000-0000-000000000001'::uuid, 1, 50000, 'active'::public.listing_status, '2026-09-01 01:00:00+00'::timestamptz),
  ('b6200000-0000-0000-0000-000000000002'::uuid, 'b6100000-0000-0000-0000-000000000002'::uuid, 2, 10000, 'pending'::public.listing_status, '2026-09-01 02:00:00+00'::timestamptz),
  ('b6200000-0000-0000-0000-000000000003'::uuid, 'b6100000-0000-0000-0000-000000000003'::uuid, 3, 30000, 'active'::public.listing_status, '2026-09-01 03:00:00+00'::timestamptz),
  ('b6200000-0000-0000-0000-000000000004'::uuid, 'b6100000-0000-0000-0000-000000000004'::uuid, 4, 20000, 'active'::public.listing_status, '2026-09-01 04:00:00+00'::timestamptz),
  ('b6200000-0000-0000-0000-000000000005'::uuid, 'b6100000-0000-0000-0000-000000000005'::uuid, 5, 40000, 'active'::public.listing_status, '2026-09-01 05:00:00+00'::timestamptz),
  ('b6200000-0000-0000-0000-000000000007'::uuid, 'b6100000-0000-0000-0000-000000000007'::uuid, 7, 15000, 'paused'::public.listing_status, '2026-09-01 07:00:00+00'::timestamptz)
) seed(listing_id, vehicle_id, ordinal, price, status, created_at);

INSERT INTO public.vehicles (id, owner_id, year, make, model, mileage, visibility)
SELECT 'b6100000-0000-0000-0000-000000000008', tech, 2024, 'Tech', 'Listing', 8000, 'public'
FROM market_cursor_ids;
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status, created_at)
SELECT 'b6200000-0000-0000-0000-000000000008', 'b6100000-0000-0000-0000-000000000008', tech,
       'Technician listing', 80000, 'active', '2026-09-01 00:00:00+00'
FROM market_cursor_ids;

INSERT INTO public.vehicles (id, owner_id, year, make, model, mileage, visibility)
SELECT 'b6100000-0000-0000-0000-000000000009', blocked_seller, 2024, 'Blocked', 'Listing', 9000, 'public'
FROM market_cursor_ids;
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status, created_at)
SELECT 'b6200000-0000-0000-0000-000000000009', 'b6100000-0000-0000-0000-000000000009', blocked_seller,
       'Blocked seller listing', 90000, 'active', '2026-09-01 09:00:00+00'
FROM market_cursor_ids;
INSERT INTO public.profile_blocks (blocker_id, blocked_id) SELECT buyer, blocked_seller FROM market_cursor_ids;

INSERT INTO public.ppi_requests (
  id, vehicle_id, requester_id, whose_car, requester_role, performer_type, ppi_type, status, inspection_scope
)
SELECT 'b6300000-0000-0000-0000-000000000001', 'b6100000-0000-0000-0000-000000000003', seller,
       'own', 'selling', 'self', 'personal', 'completed', 'complete'
FROM market_cursor_ids;
INSERT INTO public.ppi_submissions (
  id, ppi_request_id, performer_id, version, is_current, status, submitted_at, completed_at
)
SELECT 'b6400000-0000-0000-0000-000000000001', 'b6300000-0000-0000-0000-000000000001', seller,
       1, true, 'completed', '2026-09-10 01:00:00+00', '2026-09-10 02:00:00+00'
FROM market_cursor_ids;
SELECT public.attach_listing_inspection(
  (SELECT seller FROM market_cursor_ids),
  'b6200000-0000-0000-0000-000000000003',
  'b6300000-0000-0000-0000-000000000001'
);

CREATE TEMP TABLE market_newest_boundary AS
SELECT listing_id, sort_timestamp
FROM public.list_marketplace_listing_ids_cursor(
  (SELECT buyer FROM market_cursor_ids), '{"make":"Cursor"}', 'newest', 2
)
ORDER BY sort_timestamp DESC, listing_id DESC OFFSET 1 LIMIT 1;

CREATE TEMP TABLE market_price_boundary AS
SELECT listing_id, sort_numeric
FROM public.list_marketplace_listing_ids_cursor(
  (SELECT buyer FROM market_cursor_ids), '{"make":"Cursor"}', 'price_asc', 2
)
ORDER BY sort_numeric, listing_id OFFSET 1 LIMIT 1;

INSERT INTO public.vehicles (
  id, owner_id, year, make, model, mileage, transmission, drivetrain, body_style, visibility
)
SELECT 'b6100000-0000-0000-0000-000000000006', seller, 2024, 'Cursor', 'Six', 5000,
       'Automatic', 'FWD', 'Sedan', 'public'
FROM market_cursor_ids;
INSERT INTO public.marketplace_listings (
  id, vehicle_id, seller_id, title, asking_price_cents, location, status, created_at
)
SELECT 'b6200000-0000-0000-0000-000000000006', 'b6100000-0000-0000-0000-000000000006', seller,
       'Cursor vehicle inserted between pages', 5000, 'Tbilisi, GE', 'active', '2026-09-01 06:00:00+00'
FROM market_cursor_ids;

DO $$
DECLARE ids uuid[];
BEGIN
  IF (SELECT listing_id FROM market_newest_boundary) <> 'b6200000-0000-0000-0000-000000000004' THEN
    RAISE EXCEPTION 'newest boundary is wrong';
  END IF;
  SELECT array_agg(listing_id ORDER BY sort_timestamp DESC, listing_id DESC) INTO ids
  FROM public.list_marketplace_listing_ids_cursor(
    (SELECT buyer FROM market_cursor_ids), '{"make":"Cursor"}', 'newest', 10, NULL,
    (SELECT sort_timestamp FROM market_newest_boundary), (SELECT listing_id FROM market_newest_boundary)
  );
  IF ids <> ARRAY[
    'b6200000-0000-0000-0000-000000000003'::uuid,
    'b6200000-0000-0000-0000-000000000002'::uuid,
    'b6200000-0000-0000-0000-000000000001'::uuid
  ] THEN RAISE EXCEPTION 'newest cursor duplicated, skipped, or admitted a newer listing: %', ids; END IF;

  IF (SELECT listing_id FROM market_price_boundary) <> 'b6200000-0000-0000-0000-000000000004' THEN
    RAISE EXCEPTION 'price boundary is wrong';
  END IF;
  SELECT array_agg(listing_id ORDER BY sort_numeric, listing_id) INTO ids
  FROM public.list_marketplace_listing_ids_cursor(
    (SELECT buyer FROM market_cursor_ids), '{"make":"Cursor"}', 'price_asc', 10,
    (SELECT sort_numeric FROM market_price_boundary), NULL, (SELECT listing_id FROM market_price_boundary)
  );
  IF ids <> ARRAY[
    'b6200000-0000-0000-0000-000000000003'::uuid,
    'b6200000-0000-0000-0000-000000000005'::uuid,
    'b6200000-0000-0000-0000-000000000001'::uuid
  ] THEN RAISE EXCEPTION 'price cursor duplicated, skipped, or admitted a cheaper listing: %', ids; END IF;
END
$$;

DO $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(listing_id ORDER BY sort_timestamp, listing_id) INTO ids
  FROM public.list_marketplace_listing_ids_cursor((SELECT buyer FROM market_cursor_ids), '{"make":"Cursor"}', 'oldest', 20);
  IF ids <> ARRAY[
    'b6200000-0000-0000-0000-000000000001'::uuid,
    'b6200000-0000-0000-0000-000000000002'::uuid,
    'b6200000-0000-0000-0000-000000000003'::uuid,
    'b6200000-0000-0000-0000-000000000004'::uuid,
    'b6200000-0000-0000-0000-000000000005'::uuid,
    'b6200000-0000-0000-0000-000000000006'::uuid
  ] THEN RAISE EXCEPTION 'oldest ordering is wrong: %', ids; END IF;

  SELECT array_agg(listing_id ORDER BY sort_numeric DESC, listing_id DESC) INTO ids
  FROM public.list_marketplace_listing_ids_cursor((SELECT buyer FROM market_cursor_ids), '{"make":"Cursor"}', 'price_desc', 20);
  IF ids[1] <> 'b6200000-0000-0000-0000-000000000001' OR ids[6] <> 'b6200000-0000-0000-0000-000000000006' THEN
    RAISE EXCEPTION 'descending price ordering is wrong: %', ids;
  END IF;

  SELECT array_agg(listing_id ORDER BY sort_numeric, listing_id) INTO ids
  FROM public.list_marketplace_listing_ids_cursor((SELECT buyer FROM market_cursor_ids), '{"make":"Cursor"}', 'mileage_asc', 20);
  IF ids[1] <> 'b6200000-0000-0000-0000-000000000006' OR ids[6] <> 'b6200000-0000-0000-0000-000000000004' THEN
    RAISE EXCEPTION 'mileage ordering/null placement is wrong: %', ids;
  END IF;

  SELECT array_agg(listing_id ORDER BY sort_timestamp DESC, listing_id DESC) INTO ids
  FROM public.list_marketplace_listing_ids_cursor((SELECT buyer FROM market_cursor_ids), '{"make":"Cursor"}', 'recently_inspected', 20);
  IF ids[1] <> 'b6200000-0000-0000-0000-000000000003' THEN
    RAISE EXCEPTION 'recent inspection ordering is wrong: %', ids;
  END IF;
END
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.list_marketplace_listing_ids_cursor(
       (SELECT buyer FROM market_cursor_ids),
       '{"q":"vehicle 3","minYear":2020,"maxYear":2020,"maxPrice":300,"maxMileage":30000,"transmission":"auto","drivetrain":"fwd","bodyStyle":"sedan","region":"tbilisi","inspected":true,"sellerType":"member"}',
       'newest', 20
     )) <> 1 THEN
    RAISE EXCEPTION 'combined Marketplace filters do not match the visible inspected listing';
  END IF;
  IF (SELECT count(*) FROM public.list_marketplace_listing_ids_cursor(
       (SELECT buyer FROM market_cursor_ids), '{"sellerType":"technician"}', 'newest', 20
     )) <> 1 THEN
    RAISE EXCEPTION 'technician seller filter is wrong';
  END IF;
  IF EXISTS (SELECT 1 FROM public.list_marketplace_listing_ids_cursor(
       (SELECT buyer FROM market_cursor_ids), '{"make":"Blocked"}', 'newest', 20
     )) THEN
    RAISE EXCEPTION 'blocked seller listing leaked into Marketplace browse';
  END IF;
  IF (SELECT total_count FROM public.list_marketplace_listing_ids_cursor(
       (SELECT buyer FROM market_cursor_ids), '{"make":"Cursor"}', 'newest', 1
     )) <> 6 THEN
    RAISE EXCEPTION 'Marketplace total count is wrong';
  END IF;
  IF EXISTS (SELECT 1 FROM public.list_marketplace_listing_ids_cursor(
       (SELECT buyer FROM market_cursor_ids), '{}', 'newest', 20, 1, NULL, gen_random_uuid()
     )) OR EXISTS (SELECT 1 FROM public.list_marketplace_listing_ids_cursor(
       (SELECT buyer FROM market_cursor_ids), '{}', 'not-a-sort', 20
     )) THEN
    RAISE EXCEPTION 'invalid Marketplace cursor or sort must return no rows';
  END IF;
  IF has_function_privilege(
       'authenticated',
       'public.list_marketplace_listing_ids_cursor(uuid,jsonb,text,integer,numeric,timestamptz,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Marketplace cursor RPC leaked to authenticated clients';
  END IF;
END
$$;

ROLLBACK;
