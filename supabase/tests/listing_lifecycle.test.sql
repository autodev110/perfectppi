\set ON_ERROR_STOP on
BEGIN;

-- Plan 25.2: Manage Listing lifecycle — pending/paused/sold/removed,
-- visibility, saver notices, soft vs hard remove, seller history.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('8e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'll-seller@example.test', '', '{}', '{"username":"LlSeller"}', now(), now()),
  ('8e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'll-buyer@example.test', '', '{}', '{"username":"LlBuyer"}', now(), now());
UPDATE public.profiles SET is_public = true WHERE auth_user_id::text LIKE '8e000000-%';

CREATE TEMP TABLE ll AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '8e000000-0000-0000-0000-000000000001') AS seller,
  (SELECT id FROM public.profiles WHERE auth_user_id = '8e000000-0000-0000-0000-000000000002') AS buyer;
GRANT SELECT ON ll TO PUBLIC;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '8e000000-0000-0000-0000-000000000100', seller, 2018, 'Honda', 'Civic', 'public' FROM ll;
INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '8e000000-0000-0000-0000-000000000101', seller, 2012, 'Subaru', 'WRX', 'public' FROM ll;
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status)
SELECT '8e000000-0000-0000-0000-000000000200', '8e000000-0000-0000-0000-000000000100', seller, 'Civic Si', 1500000, 'active' FROM ll;
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status)
SELECT '8e000000-0000-0000-0000-000000000201', '8e000000-0000-0000-0000-000000000101', seller, 'Untouched WRX', 900000, 'active' FROM ll;

-- ---------------------------------------------------------------------------
-- 1. Status transitions and visibility
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  civic uuid := '8e000000-0000-0000-0000-000000000200';
  row_out public.marketplace_listings;
  hit boolean;
BEGIN
  -- Only the seller may change status.
  hit := false;
  BEGIN
    PERFORM public.set_marketplace_listing_status((SELECT buyer FROM ll), civic, 'paused');
  EXCEPTION WHEN no_data_found THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'non-owner must not change status'; END IF;

  -- Pending stays visible; paused does not.
  row_out := public.set_marketplace_listing_status((SELECT seller FROM ll), civic, 'pending');
  IF row_out.status <> 'pending' THEN RAISE EXCEPTION 'pending expected'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marketplace_visible_listing_ids((SELECT buyer FROM ll), ARRAY[civic])) THEN
    RAISE EXCEPTION 'pending listings remain visible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_marketplace_listings((SELECT buyer FROM ll), 'civic')) THEN
    RAISE EXCEPTION 'pending listings remain searchable';
  END IF;
  row_out := public.set_marketplace_listing_status((SELECT seller FROM ll), civic, 'paused');
  IF EXISTS (SELECT 1 FROM public.marketplace_visible_listing_ids((SELECT buyer FROM ll), ARRAY[civic])) THEN
    RAISE EXCEPTION 'paused listings are hidden';
  END IF;
  IF EXISTS (SELECT 1 FROM public.search_marketplace_listings((SELECT buyer FROM ll), 'civic')) THEN
    RAISE EXCEPTION 'paused listings are not searchable';
  END IF;

  -- Resume, sell, relist.
  row_out := public.set_marketplace_listing_status((SELECT seller FROM ll), civic, 'active');
  row_out := public.set_marketplace_listing_status((SELECT seller FROM ll), civic, 'sold');
  hit := false;
  BEGIN
    PERFORM public.set_marketplace_listing_status((SELECT seller FROM ll), civic, 'paused');
  EXCEPTION WHEN check_violation THEN hit := SQLERRM = 'listing_sold';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'sold listings only relist or get removed'; END IF;
  row_out := public.set_marketplace_listing_status((SELECT seller FROM ll), civic, 'active');
  IF row_out.status <> 'active' OR row_out.removed_at IS NOT NULL THEN RAISE EXCEPTION 'relist'; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Saver notices for the new states
-- ---------------------------------------------------------------------------
DO $$
DECLARE civic uuid := '8e000000-0000-0000-0000-000000000200';
BEGIN
  PERFORM public.set_marketplace_listing_save((SELECT buyer FROM ll), civic, true);
  PERFORM public.set_marketplace_listing_status((SELECT seller FROM ll), civic, 'pending');
  IF (SELECT data->>'change' FROM public.notifications WHERE user_id = (SELECT buyer FROM ll) AND type = 'saved_listing_updated' ORDER BY created_at DESC LIMIT 1) <> 'pending' THEN
    RAISE EXCEPTION 'pending should notify savers';
  END IF;
  PERFORM public.set_marketplace_listing_status((SELECT seller FROM ll), civic, 'paused');
  IF (SELECT data->>'change' FROM public.notifications WHERE user_id = (SELECT buyer FROM ll) AND type = 'saved_listing_updated' ORDER BY created_at DESC LIMIT 1) <> 'removed' THEN
    RAISE EXCEPTION 'paused reads as no longer available to savers';
  END IF;
  PERFORM public.set_marketplace_listing_status((SELECT seller FROM ll), civic, 'active');
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Remove: soft while referenced, hard otherwise; removed is terminal
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  civic uuid := '8e000000-0000-0000-0000-000000000200';
  wrx uuid := '8e000000-0000-0000-0000-000000000201';
  hit boolean;
  h record;
BEGIN
  -- The Civic is saved by the buyer → soft.
  IF public.remove_marketplace_listing((SELECT seller FROM ll), civic) <> 'soft' THEN
    RAISE EXCEPTION 'saved listing removes softly';
  END IF;
  IF (SELECT status FROM public.marketplace_listings WHERE id = civic) <> 'removed'
     OR (SELECT removed_at FROM public.marketplace_listings WHERE id = civic) IS NULL THEN
    RAISE EXCEPTION 'soft remove keeps the row with removed_at';
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketplace_visible_listing_ids(NULL, ARRAY[civic])) THEN
    RAISE EXCEPTION 'removed listings are invisible';
  END IF;
  -- Savers keep the listing with its status.
  IF (SELECT listing_status FROM public.list_saved_marketplace_listing_ids((SELECT buyer FROM ll), 20, 0)) <> 'removed' THEN
    RAISE EXCEPTION 'saved list keeps removed status';
  END IF;

  hit := false;
  BEGIN
    PERFORM public.set_marketplace_listing_status((SELECT seller FROM ll), civic, 'active');
  EXCEPTION WHEN check_violation THEN hit := SQLERRM = 'listing_removed';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'removed is terminal'; END IF;
  IF public.remove_marketplace_listing((SELECT seller FROM ll), civic) <> 'soft' THEN
    RAISE EXCEPTION 'removing twice is idempotent';
  END IF;

  -- Seller history ignores removed rows.
  SELECT * INTO h FROM public.marketplace_seller_history((SELECT seller FROM ll));
  IF h.active_count <> 1 OR h.sold_count <> 0 THEN RAISE EXCEPTION 'history: % %', h.active_count, h.sold_count; END IF;

  -- A second live listing for the same vehicle is refused.
  hit := false;
  BEGIN
    INSERT INTO public.marketplace_listings (vehicle_id, seller_id, title, asking_price_cents, status)
    SELECT '8e000000-0000-0000-0000-000000000101', seller, 'Duplicate WRX', 1, 'paused' FROM ll;
  EXCEPTION WHEN unique_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'one live listing per vehicle'; END IF;

  -- The WRX has no references → hard delete.
  IF public.remove_marketplace_listing((SELECT seller FROM ll), wrx) <> 'hard' THEN
    RAISE EXCEPTION 'unreferenced listing deletes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketplace_listings WHERE id = wrx) THEN RAISE EXCEPTION 'hard delete removes the row'; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS clients: cannot hard-delete a referenced listing, cannot revive removed
-- ---------------------------------------------------------------------------
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status)
SELECT '8e000000-0000-0000-0000-000000000202', '8e000000-0000-0000-0000-000000000101', seller, 'WRX again', 950000, 'active' FROM ll;
SELECT public.set_marketplace_listing_save((SELECT buyer FROM ll), '8e000000-0000-0000-0000-000000000202', true);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '8e000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
DECLARE hit boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.marketplace_listings WHERE id = '8e000000-0000-0000-0000-000000000202';
  EXCEPTION WHEN check_violation THEN hit := SQLERRM = 'listing_remove_soft';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'RLS delete of a referenced listing must be refused'; END IF;

  UPDATE public.marketplace_listings SET status = 'removed' WHERE id = '8e000000-0000-0000-0000-000000000202';
  IF (SELECT removed_at FROM public.marketplace_listings WHERE id = '8e000000-0000-0000-0000-000000000202') IS NULL THEN
    RAISE EXCEPTION 'removed_at is stamped by the trigger';
  END IF;
  hit := false;
  BEGIN
    UPDATE public.marketplace_listings SET status = 'active' WHERE id = '8e000000-0000-0000-0000-000000000202';
  EXCEPTION WHEN check_violation THEN hit := SQLERRM = 'listing_removed';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'clients cannot revive a removed listing'; END IF;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.set_marketplace_listing_status(uuid,uuid,public.listing_status)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.remove_marketplace_listing(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.marketplace_seller_history(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'lifecycle functions leaked to clients';
  END IF;
END
$$;

ROLLBACK;
