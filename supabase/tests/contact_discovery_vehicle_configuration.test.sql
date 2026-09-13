\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('7d000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'contacts-viewer@example.test', '', '{}', '{"username":"ContactViewer"}', now(), now()),
  ('7d000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'contacts-friend@example.test', '', '{}', '{"username":"ContactFriend"}', now(), now()),
  ('7d000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'contacts-hidden@example.test', '', '{}', '{"username":"ContactHidden"}', now(), now());

UPDATE public.profiles SET discoverable = false
WHERE auth_user_id = '7d000000-0000-0000-0000-000000000003';

DO $$
DECLARE
  v_viewer uuid := (SELECT id FROM public.profiles WHERE auth_user_id = '7d000000-0000-0000-0000-000000000001');
  v_friend uuid := (SELECT id FROM public.profiles WHERE auth_user_id = '7d000000-0000-0000-0000-000000000002');
  v_friend_hash text := public.normalized_contact_digest('email', 'contacts-friend@example.test');
  v_hidden_hash text := public.normalized_contact_digest('email', 'contacts-hidden@example.test');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_contact_identifiers
    WHERE profile_id = v_friend AND identifier_digest = v_friend_hash
  ) THEN
    RAISE EXCEPTION 'auth contact identifier was not indexed';
  END IF;

  IF (SELECT count(*) FROM public.discover_contact_profiles(v_viewer, ARRAY[v_friend_hash, v_hidden_hash])) <> 1 THEN
    RAISE EXCEPTION 'contact discovery did not enforce discoverability';
  END IF;

  INSERT INTO public.profile_blocks(blocker_id, blocked_id) VALUES (v_friend, v_viewer);
  IF EXISTS (SELECT 1 FROM public.discover_contact_profiles(v_viewer, ARRAY[v_friend_hash])) THEN
    RAISE EXCEPTION 'contact discovery revealed a blocked profile';
  END IF;

  IF has_table_privilege('authenticated', 'public.profile_contact_identifiers', 'SELECT')
     OR has_function_privilege('authenticated', 'public.discover_contact_profiles(uuid,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'contact identifiers or discovery RPC leaked to clients';
  END IF;
END
$$;

INSERT INTO public.vehicles (id, owner_id, make, model)
SELECT '7e000000-0000-0000-0000-000000000001', id, 'Honda', 'Civic'
FROM public.profiles WHERE auth_user_id = '7d000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_vehicle public.vehicles;
BEGIN
  SELECT * INTO v_vehicle FROM public.vehicles WHERE id = '7e000000-0000-0000-0000-000000000001';
  IF v_vehicle.configuration_type <> 'stock' OR NOT v_vehicle.engine_original
     OR NOT v_vehicle.transmission_original OR NOT v_vehicle.drivetrain_original
     OR v_vehicle.mileage_status <> 'actual' THEN
    RAISE EXCEPTION 'vehicle configuration defaults are unsafe';
  END IF;

  UPDATE public.vehicles
  SET configuration_type = 'custom_build', engine_original = false,
      transmission_original = false, drivetrain_original = false,
      mileage_status = 'not_actual'
  WHERE id = v_vehicle.id;

  BEGIN
    UPDATE public.vehicles SET configuration_type = 'stock' WHERE id = v_vehicle.id;
    RAISE EXCEPTION 'stock accepted non-original equipment';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

ROLLBACK;
