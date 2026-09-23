BEGIN;

-- Per-photo content facts: only the server records them, a recorded hash is
-- immutable, recording one is not an inspection edit, and certification
-- requires them and freezes them into the media manifest.

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('81000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hashowner@example.test', '', '{}', '{"username":"HashOwner"}', now(), now()),
  ('81000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hashadmin@example.test', '', '{}', '{"username":"HashAdmin"}', now(), now());

UPDATE public.profiles SET role = 'admin' WHERE auth_user_id = '81000000-0000-0000-0000-000000000002';

INSERT INTO public.vehicles (id, owner_id, vin, year, make, model, visibility)
SELECT '82000000-0000-0000-0000-000000000001', id, '1HGCV1F30LA000081', 2020, 'Sample', 'Coupe', 'private'
FROM public.profiles WHERE auth_user_id = '81000000-0000-0000-0000-000000000001';

INSERT INTO public.ppi_requests (
  id, vehicle_id, requester_id, whose_car, requester_role, performer_type, ppi_type, status, inspection_scope
)
SELECT '83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001',
  id, 'own', 'documenting', 'self', 'personal', 'in_progress', 'dents_tires'
FROM public.profiles WHERE auth_user_id = '81000000-0000-0000-0000-000000000001';

INSERT INTO public.ppi_submissions (id, ppi_request_id, performer_id, version, is_current, status, catalog_version)
SELECT '84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', id, 1, true, 'in_progress', 2
FROM public.profiles WHERE auth_user_id = '81000000-0000-0000-0000-000000000001';

INSERT INTO public.ppi_sections (id, ppi_submission_id, section_type, sort_order)
VALUES ('85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', 'body_damage', 1);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- A client-supplied hash is discarded; attaching still counts as an edit.
SELECT set_config('test.revision_before', revision::text, true)
FROM public.ppi_submissions WHERE id = '84000000-0000-0000-0000-000000000001';

INSERT INTO public.ppi_media (id, ppi_section_id, url, media_type, content_sha256, byte_size, content_verified_at)
VALUES ('86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001',
        'r2-private:///ppi_media/h/front.jpg', 'image', repeat('a', 64), 10, now());

DO $$
BEGIN
  IF (SELECT content_sha256 FROM public.ppi_media WHERE id = '86000000-0000-0000-0000-000000000001') IS NOT NULL
    OR (SELECT byte_size FROM public.ppi_media WHERE id = '86000000-0000-0000-0000-000000000001') IS NOT NULL
  THEN
    RAISE EXCEPTION 'a client-supplied content hash was stored';
  END IF;
  IF (SELECT revision FROM public.ppi_submissions WHERE id = '84000000-0000-0000-0000-000000000001')
    <= current_setting('test.revision_before')::integer
  THEN
    RAISE EXCEPTION 'attaching a photo did not bump the revision';
  END IF;
END;
$$;

-- App users cannot write content facts: depending on the environment's grants
-- the update is denied, filtered by RLS, or reset by the trigger.
DO $$
BEGIN
  BEGIN
    UPDATE public.ppi_media
    SET content_sha256 = repeat('b', 64), byte_size = 10, content_verified_at = now()
    WHERE id = '86000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT content_sha256 FROM public.ppi_media WHERE id = '86000000-0000-0000-0000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'an app user updated a content hash';
  END IF;
END;
$$;

-- Admins pass RLS on ppi_media but are still app users: the trigger resets
-- any content facts they write.
SELECT set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
UPDATE public.ppi_media
SET content_sha256 = repeat('e', 64), byte_size = 10, content_verified_at = now(), caption = 'admin note'
WHERE id = '86000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT caption FROM public.ppi_media WHERE id = '86000000-0000-0000-0000-000000000001') IS DISTINCT FROM 'admin note' THEN
    RAISE EXCEPTION 'the admin update did not reach the row, so the trigger was not exercised';
  END IF;
  IF (SELECT content_sha256 FROM public.ppi_media WHERE id = '86000000-0000-0000-0000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'an admin app user wrote a content hash';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- Certification refuses unverified uploads.
DO $$
BEGIN
  PERFORM public.submit_ppi_certified(
    '84000000-0000-0000-0000-000000000001',
    (SELECT revision FROM public.ppi_submissions WHERE id = '84000000-0000-0000-0000-000000000001'),
    'inspection_accuracy/1', true
  );
  RAISE EXCEPTION 'certified an inspection with an unverified photo';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'media_unverified' THEN RAISE; END IF;
END;
$$;

-- The server records content facts without changing the reviewed revision.
SELECT set_config('test.revision_before', revision::text, true)
FROM public.ppi_submissions WHERE id = '84000000-0000-0000-0000-000000000001';

SET LOCAL ROLE service_role;

DO $$
BEGIN
  UPDATE public.ppi_media SET content_sha256 = repeat('c', 64)
  WHERE id = '86000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'a hash was stored without its size and verification time';
EXCEPTION WHEN check_violation THEN NULL;
END;
$$;

UPDATE public.ppi_media
SET content_sha256 = encode(sha256(convert_to('front photo bytes', 'UTF8')), 'hex'),
    byte_size = 17, content_type = 'image/jpeg', width = 4032, height = 3024, orientation = 6,
    content_verified_at = now()
WHERE id = '86000000-0000-0000-0000-000000000001';

DO $$
BEGIN
  IF (SELECT revision FROM public.ppi_submissions WHERE id = '84000000-0000-0000-0000-000000000001')
    <> current_setting('test.revision_before')::integer
  THEN
    RAISE EXCEPTION 'recording content facts bumped the revision';
  END IF;

  -- A recorded hash never changes, even for the server.
  BEGIN
    UPDATE public.ppi_media SET content_sha256 = repeat('d', 64)
    WHERE id = '86000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'a recorded content hash was overwritten';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'media_content_immutable' THEN RAISE; END IF;
  END;
END;
$$;

SET LOCAL ROLE authenticated;

CREATE TEMP TABLE hash_result ON COMMIT DROP AS
SELECT public.submit_ppi_certified(
  '84000000-0000-0000-0000-000000000001',
  (SELECT revision FROM public.ppi_submissions WHERE id = '84000000-0000-0000-0000-000000000001'),
  'inspection_accuracy/1', true
) AS result;

DO $$
DECLARE
  v_cert public.ppi_submission_certifications%ROWTYPE;
  v_entry jsonb;
BEGIN
  SELECT * INTO v_cert FROM public.ppi_submission_certifications
  WHERE ppi_submission_id = '84000000-0000-0000-0000-000000000001';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'certification was not recorded';
  END IF;
  v_entry := v_cert.media_manifest->0;
  IF v_entry->>'sha256' <> encode(sha256(convert_to('front photo bytes', 'UTF8')), 'hex')
    OR (v_entry->>'byte_size')::bigint <> 17
    OR v_entry->>'content_type' <> 'image/jpeg'
    OR (v_entry->>'width')::integer <> 4032
    OR (v_entry->>'height')::integer <> 3024
    OR (v_entry->>'orientation')::integer <> 6
  THEN
    RAISE EXCEPTION 'content facts were not frozen into the manifest: %', v_entry;
  END IF;
  IF v_entry ? 'content_verified_at' THEN
    RAISE EXCEPTION 'the manifest carries a processing timestamp';
  END IF;
  IF encode(sha256(convert_to(v_cert.media_manifest::text, 'UTF8')), 'hex') <> v_cert.media_manifest_hash THEN
    RAISE EXCEPTION 'media manifest hash is not reproducible from the manifest';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
