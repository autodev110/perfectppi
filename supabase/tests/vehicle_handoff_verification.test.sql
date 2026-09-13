\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('8a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'handoff-seller@example.test', '', '{}', '{"username":"HandoffSeller"}', now(), now()),
  ('8a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'handoff-buyer@example.test', '', '{}', '{"username":"HandoffBuyer"}', now(), now());

UPDATE public.profiles
SET is_public = true, username_state = 'claimed'
WHERE auth_user_id::text LIKE '8a000000-0000-0000-0000-00000000000%';

CREATE TEMP TABLE handoff_actors AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '8a000000-0000-0000-0000-000000000001') seller,
  (SELECT id FROM public.profiles WHERE auth_user_id = '8a000000-0000-0000-0000-000000000002') buyer;

INSERT INTO public.vehicles (
  id, owner_id, vin, year, make, model, trim, engine, drivetrain,
  transmission, body_style, configuration_type, engine_original,
  transmission_original, drivetrain_original, ownership_state, sold_at,
  visibility, mileage, mileage_status, nickname
)
SELECT
  '8a000000-0000-0000-0000-000000000010', seller,
  '1HGCM82633A004352', 2003, 'Honda', 'Accord', 'EX', 'K24 swap',
  'FWD', '6-speed manual', 'Sedan', 'custom_build', false, false, true,
  'previously_owned', now(), 'public', 145000, 'not_actual', 'Seller nickname'
FROM handoff_actors;

DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.claim_vehicle_handoff(uuid, text, text)',
    'EXECUTE'
  ) OR has_table_privilege(
    'authenticated',
    'public.vehicle_handoff_claims',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'ordinary clients can bypass the server-routed claim flow';
  END IF;
END
$$;

SELECT public.issue_vehicle_handoff_claim(
  '8a000000-0000-0000-0000-000000000010',
  (SELECT seller FROM handoff_actors),
  repeat('a', 64)
);

DO $$
DECLARE
  v_outcome text;
BEGIN
  SELECT result.outcome INTO v_outcome
  FROM public.claim_vehicle_handoff(
    (SELECT buyer FROM handoff_actors),
    repeat('a', 64),
    '1HGCM82633A999999'
  ) result;
  IF v_outcome <> 'invalid' THEN
    RAISE EXCEPTION 'mismatched VIN was accepted: %', v_outcome;
  END IF;

  SELECT result.outcome INTO v_outcome
  FROM public.claim_vehicle_handoff(
    (SELECT buyer FROM handoff_actors),
    repeat('a', 64),
    '1HGCM82633A004352'
  ) result;
  IF v_outcome <> 'success' THEN
    RAISE EXCEPTION 'valid handoff was rejected: %', v_outcome;
  END IF;

  SELECT result.outcome INTO v_outcome
  FROM public.claim_vehicle_handoff(
    (SELECT buyer FROM handoff_actors),
    repeat('a', 64),
    '1HGCM82633A004352'
  ) result;
  IF v_outcome <> 'invalid' THEN
    RAISE EXCEPTION 'one-time claim code was reusable: %', v_outcome;
  END IF;
END
$$;

DO $$
DECLARE
  v_source public.vehicles;
  v_buyer public.vehicles;
BEGIN
  SELECT * INTO v_source
  FROM public.vehicles
  WHERE id = '8a000000-0000-0000-0000-000000000010';
  SELECT * INTO v_buyer
  FROM public.vehicles
  WHERE owner_id = (SELECT buyer FROM handoff_actors)
    AND vin = '1HGCM82633A004352';

  IF v_source.owner_id <> (SELECT seller FROM handoff_actors)
     OR v_source.ownership_state <> 'previously_owned' THEN
    RAISE EXCEPTION 'seller record was reassigned or changed';
  END IF;
  IF v_buyer.id IS NULL
     OR v_buyer.id = v_source.id
     OR v_buyer.visibility <> 'private'
     OR v_buyer.ownership_state <> 'owned'
     OR v_buyer.mileage IS NOT NULL
     OR v_buyer.mileage_status <> 'unknown'
     OR v_buyer.nickname IS NOT NULL THEN
    RAISE EXCEPTION 'buyer did not receive a separate privacy-safe Garage record';
  END IF;
  IF v_buyer.engine <> v_source.engine
     OR v_buyer.configuration_type <> v_source.configuration_type
     OR v_buyer.engine_original <> v_source.engine_original THEN
    RAISE EXCEPTION 'vehicle identity/configuration was not copied';
  END IF;
END
$$;

ROLLBACK;
