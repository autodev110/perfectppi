\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '6b000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'garage-owner@example.test', '', '{}',
  '{"username":"GarageOwner"}', now(), now()
);

INSERT INTO public.vehicles (id, owner_id, make, model, mileage, nickname)
SELECT
  '6c000000-0000-0000-0000-000000000001', id,
  'Acura', 'TLX', 52000, '  Blue Daily  '
FROM public.profiles
WHERE auth_user_id = '6b000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_vehicle public.vehicles;
  v_original_mileage_date timestamptz;
BEGIN
  SELECT * INTO v_vehicle
  FROM public.vehicles
  WHERE id = '6c000000-0000-0000-0000-000000000001';

  IF v_vehicle.nickname <> 'Blue Daily'
     OR v_vehicle.ownership_state <> 'owned'
     OR v_vehicle.mileage_updated_at IS NULL THEN
    RAISE EXCEPTION 'Garage metadata defaults or normalization were not applied';
  END IF;

  v_original_mileage_date := v_vehicle.mileage_updated_at;
  UPDATE public.vehicles
  SET nickname = 'Weekend Car', mileage_updated_at = now() - interval '10 years'
  WHERE id = v_vehicle.id;

  SELECT * INTO v_vehicle FROM public.vehicles WHERE id = v_vehicle.id;
  IF v_vehicle.mileage_updated_at IS DISTINCT FROM v_original_mileage_date THEN
    RAISE EXCEPTION 'an unrelated update changed or forged mileage freshness';
  END IF;

  UPDATE public.vehicles
  SET mileage = 52100, ownership_state = 'project'
  WHERE id = v_vehicle.id;

  SELECT * INTO v_vehicle FROM public.vehicles WHERE id = v_vehicle.id;
  IF v_vehicle.mileage_updated_at < v_original_mileage_date
     OR v_vehicle.ownership_state <> 'project' THEN
    RAISE EXCEPTION 'mileage update date or ownership state was not persisted';
  END IF;

  BEGIN
    UPDATE public.vehicles SET nickname = repeat('x', 61) WHERE id = v_vehicle.id;
    RAISE EXCEPTION 'oversized nickname was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

ROLLBACK;
