\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('71000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'market-seller@example.test', '', '{}',
   '{"username":"MarketSeller"}', now(), now()),
  ('71000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'market-buyer@example.test', '', '{}',
   '{"username":"MarketBuyer"}', now(), now()),
  ('71000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'blocked-buyer@example.test', '', '{}',
   '{"username":"BlockedBuyer"}', now(), now());

CREATE TEMP TABLE marketplace_test_ids AS
SELECT
  max(id::text) FILTER (WHERE auth_user_id = '71000000-0000-0000-0000-000000000001')::uuid AS seller_id,
  max(id::text) FILTER (WHERE auth_user_id = '71000000-0000-0000-0000-000000000002')::uuid AS buyer_id,
  max(id::text) FILTER (WHERE auth_user_id = '71000000-0000-0000-0000-000000000003')::uuid AS blocked_id
FROM public.profiles;

UPDATE public.profiles SET is_public = true
WHERE auth_user_id::text LIKE '71000000-%';

INSERT INTO public.vehicles (id, owner_id, vin, year, make, model, visibility)
SELECT '72000000-0000-0000-0000-000000000001', seller_id,
       '1HGCM82633A004352', 2020, 'Honda', 'Accord', 'public'
FROM marketplace_test_ids;

INSERT INTO public.marketplace_listings (
  id, vehicle_id, seller_id, title, asking_price_cents, status
)
SELECT '73000000-0000-0000-0000-000000000001',
       '72000000-0000-0000-0000-000000000001', seller_id,
       '2020 Honda Accord', 2200000, 'active'
FROM marketplace_test_ids;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = '72000000-0000-0000-0000-000000000001'
  ) OR EXISTS (
    SELECT 1 FROM public.marketplace_listings
    WHERE id = '73000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'public vehicle or listing row bypassed the redacted server DTO';
  END IF;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.request_marketplace_inspection(uuid,uuid,public.inspection_scope)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.request_marketplace_inspection(uuid,uuid,public.inspection_scope)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.marketplace_visible_listing_ids(uuid,uuid[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'marketplace inspection RPC leaked to an untrusted role';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.marketplace_visible_listing_ids(
      (SELECT buyer_id FROM marketplace_test_ids),
      ARRAY['73000000-0000-0000-0000-000000000001'::uuid]
    )
  ) THEN
    RAISE EXCEPTION 'eligible listing was hidden from the server visibility projection';
  END IF;
END
$$;

CREATE TEMP TABLE first_request AS
SELECT result.*
FROM marketplace_test_ids ids
CROSS JOIN LATERAL public.request_marketplace_inspection(
  ids.buyer_id,
  '73000000-0000-0000-0000-000000000001',
  'complete'
) result;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = '72000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'inspection requester could not read the requested vehicle';
  END IF;
END
$$;
RESET ROLE;

DO $$
DECLARE
  v_request public.ppi_requests;
  v_repeat record;
BEGIN
  SELECT request_row.* INTO v_request
  FROM public.ppi_requests request_row
  WHERE request_row.id = (SELECT request_id FROM first_request);

  IF NOT (SELECT created FROM first_request)
     OR v_request.status <> 'pending_assignment'
     OR v_request.whose_car <> 'other'
     OR v_request.requester_role <> 'buying'
     OR v_request.performer_type <> 'technician'
     OR v_request.ppi_type <> 'general_tech'
     OR v_request.marketplace_listing_id <> '73000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'marketplace request fields were not created correctly';
  END IF;

  SELECT result.* INTO v_repeat
  FROM marketplace_test_ids ids
  CROSS JOIN LATERAL public.request_marketplace_inspection(
    ids.buyer_id,
    '73000000-0000-0000-0000-000000000001',
    'complete'
  ) result;

  IF v_repeat.created OR v_repeat.request_id <> v_request.id THEN
    RAISE EXCEPTION 'repeat request was not idempotent';
  END IF;

  -- The seller learns about the request exactly once and never who asked.
  IF (SELECT count(*) FROM public.notifications
      WHERE user_id = (SELECT seller_id FROM marketplace_test_ids)
        AND type = 'listing_inspection_requested'
        AND data->>'request_id' = v_request.id::text) <> 1 THEN
    RAISE EXCEPTION 'seller should receive one inspection-request notice per created request';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE type = 'listing_inspection_requested'
      AND (data ? 'requester_id' OR data ? 'buyer_id')
  ) THEN
    RAISE EXCEPTION 'seller notice must not carry the buyer identity';
  END IF;

  BEGIN
    PERFORM public.request_marketplace_inspection(
      (SELECT seller_id FROM marketplace_test_ids),
      '73000000-0000-0000-0000-000000000001',
      'complete'
    );
    RAISE EXCEPTION 'seller requested an inspection on their own listing';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

INSERT INTO public.profile_blocks (blocker_id, blocked_id)
SELECT seller_id, blocked_id FROM marketplace_test_ids;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.marketplace_visible_listing_ids(
      (SELECT blocked_id FROM marketplace_test_ids),
      ARRAY['73000000-0000-0000-0000-000000000001'::uuid]
    )
  ) THEN
    RAISE EXCEPTION 'blocked listing leaked through the server visibility projection';
  END IF;

  BEGIN
    PERFORM public.request_marketplace_inspection(
      (SELECT blocked_id FROM marketplace_test_ids),
      '73000000-0000-0000-0000-000000000001',
      'complete'
    );
    RAISE EXCEPTION 'blocked buyer created a marketplace inspection request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.marketplace_listings
  SET status = 'archived'
  WHERE id = '73000000-0000-0000-0000-000000000001';

  BEGIN
    PERFORM public.request_marketplace_inspection(
      (SELECT blocked_id FROM marketplace_test_ids),
      '73000000-0000-0000-0000-000000000001',
      'complete'
    );
    RAISE EXCEPTION 'archived listing accepted an inspection request';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
DELETE FROM public.marketplace_listings
WHERE id = '73000000-0000-0000-0000-000000000001';
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.ppi_requests
    WHERE id = (SELECT request_id FROM first_request)
      AND marketplace_listing_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'listing deletion did not preserve and detach inspection history';
  END IF;
END
$$;

ROLLBACK;
