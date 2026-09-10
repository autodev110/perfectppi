BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'owner@example.test', '',
    '{}', '{"username":"FlowOwner"}', now(), now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'assigned@example.test', '',
    '{}', '{"username":"FlowTech"}', now(), now()
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'unassigned@example.test', '',
    '{}', '{"username":"FlowStranger"}', now(), now()
  );

UPDATE public.profiles
SET role = 'technician'
WHERE auth_user_id IN (
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);

INSERT INTO public.vehicles (
  id, owner_id, vin, year, make, model, visibility
) SELECT
  '20000000-0000-0000-0000-000000000001',
  id,
  'WVWZZZ1JZXW000001',
  2019,
  'Volkswagen',
  'Golf',
  'private'
FROM public.profiles
WHERE auth_user_id = '10000000-0000-0000-0000-000000000001';

INSERT INTO public.ppi_requests (
  id, vehicle_id, requester_id, assigned_tech_id, whose_car,
  requester_role, performer_type, ppi_type, status
) SELECT
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  owner_profile.id,
  tech_profile.id,
  'own',
  'buying',
  'technician',
  'general_tech',
  'assigned'
FROM public.profiles owner_profile
CROSS JOIN public.profiles tech_profile
WHERE owner_profile.auth_user_id = '10000000-0000-0000-0000-000000000001'
  AND tech_profile.auth_user_id = '10000000-0000-0000-0000-000000000002';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ppi_answers'
      AND column_name = 'deferred_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION 'ppi_answers.deferred_at was not created';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.vehicles WHERE id = '20000000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'assigned technician cannot read the private inspection vehicle';
  END IF;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.vehicles WHERE id = '20000000-0000-0000-0000-000000000001') <> 0 THEN
    RAISE EXCEPTION 'unassigned technician can read another user''s private vehicle';
  END IF;
END;
$$;

ROLLBACK;
