\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '52000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'username-admin@example.test', '',
    '{}', '{"username":"RoadPilot"}', now(), now()
  ),
  (
    '52000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'username-pending@example.test', '',
    '{}', '{}', now(), now()
  );

UPDATE public.profiles
SET role = 'admin'
WHERE auth_user_id = '52000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  claimed_count integer;
  pending_count integer;
BEGIN
  SELECT count(*) INTO claimed_count
  FROM public.profiles
  WHERE auth_user_id = '52000000-0000-0000-0000-000000000001'
    AND username = 'RoadPilot'
    AND username_normalized = 'roadpilot'
    AND username_state = 'claimed';
  IF claimed_count <> 1 THEN
    RAISE EXCEPTION 'email signup username was not claimed';
  END IF;

  SELECT count(*) INTO pending_count
  FROM public.profiles
  WHERE auth_user_id = '52000000-0000-0000-0000-000000000002'
    AND username IS NULL
    AND username_state = 'pending';
  IF pending_count <> 1 THEN
    RAISE EXCEPTION 'OAuth-style profile was not left pending';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"52000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF public.get_my_profile_id() IS NOT NULL THEN
    RAISE EXCEPTION 'pending profile received an ordinary product identity';
  END IF;
END;
$$;

SELECT public.claim_own_username('Second_Driver');

DO $$
BEGIN
  IF public.get_my_profile_id() IS NULL THEN
    RAISE EXCEPTION 'claimed profile did not receive its product identity';
  END IF;

  BEGIN
    UPDATE public.profiles
    SET username = 'ChangedDirectly', username_normalized = 'changeddirectly'
    WHERE auth_user_id = '52000000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'claimed username changed through generic profile update';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.claim_own_username('Another_Name');
    RAISE EXCEPTION 'username was claimed more than once';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"52000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

SELECT public.admin_correct_username(
  (SELECT id FROM public.profiles
   WHERE auth_user_id = '52000000-0000-0000-0000-000000000002'),
  'Corrected_Name',
  'Support-approved migration correction'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.username_correction_events
    WHERE previous_username = 'Second_Driver'
      AND new_username = 'Corrected_Name'
  ) THEN
    RAISE EXCEPTION 'admin correction was not audited';
  END IF;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  BEGIN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '52000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'username-duplicate@example.test', '',
      '{}', '{"username":"roadpilot"}', now(), now()
    );
    RAISE EXCEPTION 'case-insensitive duplicate username was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$$;

DELETE FROM auth.users
WHERE id = '52000000-0000-0000-0000-000000000002';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.username_reservations
    WHERE normalized_username IN ('second_driver', 'corrected_name')
      AND profile_id IS NULL
  ) THEN
    RAISE EXCEPTION 'deleted account usernames were recycled';
  END IF;
END;
$$;

ROLLBACK;
