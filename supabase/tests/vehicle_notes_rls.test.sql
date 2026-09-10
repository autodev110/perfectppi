\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '51000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'vehicle-notes-owner@example.test', '',
    '{}', '{"username":"NotesOwner"}', now(), now()
  ),
  (
    '51000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'vehicle-notes-stranger@example.test', '',
    '{}', '{"username":"NotesStranger"}', now(), now()
  );

UPDATE public.profiles
SET id = CASE auth_user_id
  WHEN '51000000-0000-0000-0000-000000000001' THEN '51100000-0000-0000-0000-000000000001'::uuid
  WHEN '51000000-0000-0000-0000-000000000002' THEN '51100000-0000-0000-0000-000000000002'::uuid
END
WHERE auth_user_id IN (
  '51000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000002'
);

INSERT INTO public.vehicles (id, owner_id, make, model, visibility)
VALUES (
  '51200000-0000-0000-0000-000000000001',
  '51100000-0000-0000-0000-000000000001',
  'Acura', 'TLX', 'public'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

INSERT INTO public.vehicle_notes (vehicle_id, notes)
VALUES ('51200000-0000-0000-0000-000000000001', 'Owner-only note');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.vehicle_notes) <> 1 THEN
    RAISE EXCEPTION 'vehicle owner cannot read their note';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"51000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.vehicle_notes) <> 0 THEN
    RAISE EXCEPTION 'another user can read notes for a public vehicle';
  END IF;

  BEGIN
    INSERT INTO public.vehicle_notes (vehicle_id, notes)
    VALUES ('51200000-0000-0000-0000-000000000001', 'Unauthorized replacement')
    ON CONFLICT (vehicle_id) DO UPDATE SET notes = EXCLUDED.notes;
    RAISE EXCEPTION 'another user can modify notes for a public vehicle';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.vehicle_notes', 'SELECT') THEN
    RAISE EXCEPTION 'anonymous users were granted access to vehicle notes';
  END IF;
END;
$$;

ROLLBACK;
