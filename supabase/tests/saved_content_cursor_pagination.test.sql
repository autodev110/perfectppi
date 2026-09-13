\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('b4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cursor-author@example.test', '', '{}', '{"username":"CursorAuthor"}', now(), now()),
  ('b4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cursor-reader@example.test', '', '{}', '{"username":"CursorReader"}', now(), now());

UPDATE public.profiles SET is_public = true WHERE auth_user_id::text LIKE 'b4000000-%';

CREATE TEMP TABLE saved_cursor_ids AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b4000000-0000-0000-0000-000000000001') AS author_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b4000000-0000-0000-0000-000000000002') AS reader_id;

INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT post_id, author_id, 'Cursor post ' || ordinal, 'public', 'active', 'active'
FROM saved_cursor_ids
CROSS JOIN (VALUES
  ('b4100000-0000-0000-0000-000000000001'::uuid, 1),
  ('b4100000-0000-0000-0000-000000000002'::uuid, 2),
  ('b4100000-0000-0000-0000-000000000003'::uuid, 3),
  ('b4100000-0000-0000-0000-000000000004'::uuid, 4)
) AS seed(post_id, ordinal);

INSERT INTO public.community_post_saves (profile_id, post_id, created_at)
SELECT reader_id, post_id, saved_at
FROM saved_cursor_ids
CROSS JOIN (VALUES
  ('b4100000-0000-0000-0000-000000000001'::uuid, '2026-09-13 01:00:00+00'::timestamptz),
  ('b4100000-0000-0000-0000-000000000002'::uuid, '2026-09-13 02:00:00+00'::timestamptz),
  ('b4100000-0000-0000-0000-000000000003'::uuid, '2026-09-13 03:00:00+00'::timestamptz)
) AS seed(post_id, saved_at);

CREATE TEMP TABLE saved_post_boundary AS
SELECT post_id, saved_at
FROM public.list_saved_community_post_ids_cursor((SELECT reader_id FROM saved_cursor_ids), 2)
ORDER BY saved_at, post_id
LIMIT 1;

INSERT INTO public.community_post_saves (profile_id, post_id, created_at)
SELECT reader_id, 'b4100000-0000-0000-0000-000000000004', '2026-09-13 04:00:00+00'
FROM saved_cursor_ids;

DO $$
BEGIN
  IF (SELECT count(*) FROM saved_post_boundary) <> 1
     OR (SELECT post_id FROM saved_post_boundary) <> 'b4100000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'saved-post first-page boundary is wrong';
  END IF;
  IF (SELECT array_agg(post_id ORDER BY saved_at DESC, post_id DESC)
      FROM public.list_saved_community_post_ids_cursor(
        (SELECT reader_id FROM saved_cursor_ids), 2,
        (SELECT saved_at FROM saved_post_boundary), (SELECT post_id FROM saved_post_boundary)
      )) <> ARRAY['b4100000-0000-0000-0000-000000000001'::uuid] THEN
    RAISE EXCEPTION 'saved-post cursor duplicated, skipped, or admitted a newer save';
  END IF;
END
$$;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT vehicle_id, author_id, 2020 + ordinal, 'Cursor', 'Car ' || ordinal, 'public'
FROM saved_cursor_ids
CROSS JOIN (VALUES
  ('b4200000-0000-0000-0000-000000000001'::uuid, 1),
  ('b4200000-0000-0000-0000-000000000002'::uuid, 2),
  ('b4200000-0000-0000-0000-000000000003'::uuid, 3),
  ('b4200000-0000-0000-0000-000000000004'::uuid, 4)
) AS seed(vehicle_id, ordinal);

INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status)
SELECT listing_id, vehicle_id, author_id, 'Cursor listing ' || ordinal, 1000000 + ordinal, 'active'
FROM saved_cursor_ids
CROSS JOIN (VALUES
  ('b4300000-0000-0000-0000-000000000001'::uuid, 'b4200000-0000-0000-0000-000000000001'::uuid, 1),
  ('b4300000-0000-0000-0000-000000000002'::uuid, 'b4200000-0000-0000-0000-000000000002'::uuid, 2),
  ('b4300000-0000-0000-0000-000000000003'::uuid, 'b4200000-0000-0000-0000-000000000003'::uuid, 3),
  ('b4300000-0000-0000-0000-000000000004'::uuid, 'b4200000-0000-0000-0000-000000000004'::uuid, 4)
) AS seed(listing_id, vehicle_id, ordinal);

INSERT INTO public.marketplace_listing_saves (profile_id, listing_id, created_at)
SELECT reader_id, listing_id, saved_at
FROM saved_cursor_ids
CROSS JOIN (VALUES
  ('b4300000-0000-0000-0000-000000000001'::uuid, '2026-09-13 01:00:00+00'::timestamptz),
  ('b4300000-0000-0000-0000-000000000002'::uuid, '2026-09-13 02:00:00+00'::timestamptz),
  ('b4300000-0000-0000-0000-000000000003'::uuid, '2026-09-13 03:00:00+00'::timestamptz)
) AS seed(listing_id, saved_at);

CREATE TEMP TABLE saved_listing_boundary AS
SELECT listing_id, saved_at
FROM public.list_saved_marketplace_listing_ids_cursor((SELECT reader_id FROM saved_cursor_ids), 2)
ORDER BY saved_at, listing_id
LIMIT 1;

INSERT INTO public.marketplace_listing_saves (profile_id, listing_id, created_at)
SELECT reader_id, 'b4300000-0000-0000-0000-000000000004', '2026-09-13 04:00:00+00'
FROM saved_cursor_ids;

DO $$
BEGIN
  IF (SELECT count(*) FROM saved_listing_boundary) <> 1
     OR (SELECT listing_id FROM saved_listing_boundary) <> 'b4300000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'saved-listing first-page boundary is wrong';
  END IF;
  IF (SELECT array_agg(listing_id ORDER BY saved_at DESC, listing_id DESC)
      FROM public.list_saved_marketplace_listing_ids_cursor(
        (SELECT reader_id FROM saved_cursor_ids), 2,
        (SELECT saved_at FROM saved_listing_boundary), (SELECT listing_id FROM saved_listing_boundary)
      )) <> ARRAY['b4300000-0000-0000-0000-000000000001'::uuid] THEN
    RAISE EXCEPTION 'saved-listing cursor duplicated, skipped, or admitted a newer save';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.list_saved_community_post_ids_cursor(
      (SELECT reader_id FROM saved_cursor_ids), 20, now(), NULL
    )
  ) OR EXISTS (
    SELECT 1 FROM public.list_saved_marketplace_listing_ids_cursor(
      (SELECT reader_id FROM saved_cursor_ids), 20, now(), NULL
    )
  ) THEN
    RAISE EXCEPTION 'partial saved-content cursor must return no rows';
  END IF;
  IF has_function_privilege('authenticated', 'public.list_saved_community_post_ids_cursor(uuid,integer,timestamptz,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.list_saved_marketplace_listing_ids_cursor(uuid,integer,timestamptz,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'saved-content cursor RPCs leaked to authenticated clients';
  END IF;
END
$$;

ROLLBACK;
