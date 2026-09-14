\set ON_ERROR_STOP on
BEGIN;

-- Factory Spec vs Current Build: the VIN-decoded layer is server-written and
-- follows the VIN; owners can only edit the current-build columns.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('af000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fs-owner@example.test', '', '{}', '{"username":"FsOwner"}', now(), now());

CREATE TEMP TABLE fs AS
SELECT (SELECT id FROM public.profiles WHERE auth_user_id = 'af000000-0000-0000-0000-000000000001') AS owner;
GRANT SELECT ON fs TO PUBLIC;

INSERT INTO public.vehicles (id, owner_id, vin, year, make, model, drivetrain, visibility)
SELECT 'af000000-0000-0000-0000-000000000100', owner, '1G1YY22G115113112', 2001, 'Chevrolet', 'Corvette', 'RWD', 'private' FROM fs;

-- Server (postgres here) records the factory layer.
UPDATE public.vehicles
SET factory_spec = '{"source":"nhtsa_vpic","vin":"1G1YY22G115113112","drive_type":"RWD/Rear-Wheel Drive","engine_model":"LS6"}'::jsonb,
    factory_spec_decoded_at = now()
WHERE id = 'af000000-0000-0000-0000-000000000100';

DO $$
BEGIN
  IF (SELECT factory_spec->>'engine_model' FROM public.vehicles WHERE id = 'af000000-0000-0000-0000-000000000100') <> 'LS6' THEN
    RAISE EXCEPTION 'server write of factory_spec failed';
  END IF;
  -- Shape is enforced.
  BEGIN
    UPDATE public.vehicles SET factory_spec = '{"source":"guess"}'::jsonb WHERE id = 'af000000-0000-0000-0000-000000000100';
    RAISE EXCEPTION 'malformed factory_spec accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

-- Owners edit the current build but cannot touch the factory layer.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
DECLARE hit boolean := false;
BEGIN
  UPDATE public.vehicles SET drivetrain = 'AWD', drivetrain_original = false, configuration_type = 'modified'
  WHERE id = 'af000000-0000-0000-0000-000000000100';
  IF (SELECT drivetrain FROM public.vehicles WHERE id = 'af000000-0000-0000-0000-000000000100') <> 'AWD' THEN
    RAISE EXCEPTION 'owner could not edit the current build';
  END IF;
  IF (SELECT factory_spec->>'drive_type' FROM public.vehicles WHERE id = 'af000000-0000-0000-0000-000000000100') <> 'RWD/Rear-Wheel Drive' THEN
    RAISE EXCEPTION 'current-build edit must not touch the factory layer';
  END IF;

  BEGIN
    UPDATE public.vehicles SET factory_spec = jsonb_set(factory_spec, '{drive_type}', '"AWD"') WHERE id = 'af000000-0000-0000-0000-000000000100';
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'factory_spec_server_managed';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'owners must not edit factory_spec'; END IF;

  hit := false;
  BEGIN
    INSERT INTO public.vehicles (owner_id, make, model, factory_spec)
    SELECT owner, 'Mazda', 'MX-5', '{"source":"nhtsa_vpic","vin":"JM1NC2MF0A0000000"}'::jsonb FROM fs;
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'factory_spec_server_managed';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'owners must not insert a factory_spec'; END IF;

  -- Changing the VIN drops the stale factory record.
  UPDATE public.vehicles SET vin = '1G1YY22G115113113' WHERE id = 'af000000-0000-0000-0000-000000000100';
  IF (SELECT factory_spec FROM public.vehicles WHERE id = 'af000000-0000-0000-0000-000000000100') IS NOT NULL
     OR (SELECT factory_spec_decoded_at FROM public.vehicles WHERE id = 'af000000-0000-0000-0000-000000000100') IS NOT NULL THEN
    RAISE EXCEPTION 'a changed VIN must clear the factory layer';
  END IF;
END
$$;
RESET ROLE;

ROLLBACK;
