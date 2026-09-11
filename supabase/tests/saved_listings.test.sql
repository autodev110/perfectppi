\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('6e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sl-seller@example.test', '', '{}', '{"username":"SlSeller"}', now(), now()),
  ('6e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sl-buyer@example.test', '', '{}', '{"username":"SlBuyer"}', now(), now()),
  ('6e000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'sl-blocked@example.test', '', '{}', '{"username":"SlBlocked"}', now(), now());

UPDATE public.profiles SET is_public = true WHERE auth_user_id::text LIKE '6e000000-%';

CREATE TEMP TABLE sl AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '6e000000-0000-0000-0000-000000000001') AS seller_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '6e000000-0000-0000-0000-000000000002') AS buyer_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '6e000000-0000-0000-0000-000000000003') AS blocked_id;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '6f000000-0000-0000-0000-000000000001', seller_id, 2019, 'Mazda', 'MX-5', 'public' FROM sl;
INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '6f000000-0000-0000-0000-000000000002', seller_id, 2015, 'Ford', 'Focus', 'private' FROM sl;
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status)
SELECT '70000000-0000-0000-0000-000000000001', '6f000000-0000-0000-0000-000000000001', seller_id, 'MX-5 club edition', 2150000, 'active' FROM sl;
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status)
SELECT '70000000-0000-0000-0000-000000000002', '6f000000-0000-0000-0000-000000000002', seller_id, 'Private vehicle listing', 500000, 'active' FROM sl;

-- Service-only surface.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.marketplace_listing_saves', 'SELECT')
     OR has_function_privilege('authenticated', 'public.set_marketplace_listing_save(uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'saved listings leaked to authenticated clients';
  END IF;
END
$$;

-- Save requires a visible listing; the seller cannot save their own.
DO $$
DECLARE
  hit boolean := false;
  r jsonb;
BEGIN
  r := public.set_marketplace_listing_save((SELECT buyer_id FROM sl), '70000000-0000-0000-0000-000000000001', true);
  IF (r->>'saved')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'save failed: %', r; END IF;
  r := public.set_marketplace_listing_save((SELECT buyer_id FROM sl), '70000000-0000-0000-0000-000000000001', true);
  IF (SELECT count(*) FROM public.marketplace_listing_saves) <> 1 THEN RAISE EXCEPTION 'save must be idempotent'; END IF;

  BEGIN
    PERFORM public.set_marketplace_listing_save((SELECT buyer_id FROM sl), '70000000-0000-0000-0000-000000000002', true);
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'listing on a private vehicle must not be saveable'; END IF;

  hit := false;
  BEGIN
    PERFORM public.set_marketplace_listing_save((SELECT seller_id FROM sl), '70000000-0000-0000-0000-000000000001', true);
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'sellers must not save their own listing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.marketplace_listing_save_states((SELECT buyer_id FROM sl), ARRAY['70000000-0000-0000-0000-000000000001'::uuid]) WHERE saved
  ) THEN RAISE EXCEPTION 'save state should be true'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.marketplace_listing_save_states((SELECT seller_id FROM sl), ARRAY['70000000-0000-0000-0000-000000000001'::uuid]) WHERE saved
  ) THEN RAISE EXCEPTION 'saves must be private to the saver'; END IF;
END
$$;

-- Price drop → one notice; a second change the same day updates it in place.
UPDATE public.marketplace_listings SET asking_price_cents = 1990000 WHERE id = '70000000-0000-0000-0000-000000000001';
UPDATE public.marketplace_listings SET asking_price_cents = 1950000 WHERE id = '70000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  n public.notifications%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT buyer_id FROM sl) AND type = 'saved_listing_updated') <> 1 THEN
    RAISE EXCEPTION 'two same-day changes must collapse into one notice';
  END IF;
  SELECT * INTO n FROM public.notifications WHERE user_id = (SELECT buyer_id FROM sl) AND type = 'saved_listing_updated';
  IF n.body NOT LIKE 'Price dropped to $19,500 on a listing you saved%' THEN RAISE EXCEPTION 'price body wrong: %', n.body; END IF;
  IF n.data->>'change' <> 'price_drop' OR n.data->>'listing_id' <> '70000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'notice data wrong: %', n.data;
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT seller_id FROM sl)) <> 0 THEN
    RAISE EXCEPTION 'the seller must not be notified about their own change';
  END IF;
END
$$;

-- Sold: listing stays in the saved list with its status; blocked sellers vanish.
UPDATE public.notifications SET read_at = now() WHERE type = 'saved_listing_updated';
UPDATE public.marketplace_listings SET status = 'sold' WHERE id = '70000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT buyer_id FROM sl) AND type = 'saved_listing_updated' AND read_at IS NULL AND body LIKE '%marked sold%') <> 1 THEN
    RAISE EXCEPTION 'sold notice missing';
  END IF;
  IF (SELECT listing_status FROM public.list_saved_marketplace_listing_ids((SELECT buyer_id FROM sl)) LIMIT 1) <> 'sold' THEN
    RAISE EXCEPTION 'saved list should keep the sold listing with its status';
  END IF;
END
$$;
INSERT INTO public.profile_blocks (blocker_id, blocked_id) SELECT seller_id, buyer_id FROM sl;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.list_saved_marketplace_listing_ids((SELECT buyer_id FROM sl))) <> 0 THEN
    RAISE EXCEPTION 'blocked seller listing must leave the saved list';
  END IF;
END
$$;
UPDATE public.marketplace_listings SET status = 'active' WHERE id = '70000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT buyer_id FROM sl) AND body LIKE '%back on the market%') <> 0 THEN
    RAISE EXCEPTION 'blocked savers must not be notified';
  END IF;
END
$$;
DELETE FROM public.profile_blocks;

-- Unsave always works.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.set_marketplace_listing_save((SELECT buyer_id FROM sl), '70000000-0000-0000-0000-000000000001', false);
  IF (r->>'saved')::boolean IS NOT FALSE OR (SELECT count(*) FROM public.marketplace_listing_saves) <> 0 THEN
    RAISE EXCEPTION 'unsave failed';
  END IF;
END
$$;

ROLLBACK;
