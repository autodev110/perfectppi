\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('78000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'passport-owner@example.test', '', '{}', '{"username":"PassportOwner"}', now(), now()),
  ('78000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'passport-friend@example.test', '', '{}', '{"username":"PassportFriend"}', now(), now()),
  ('78000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'passport-stranger@example.test', '', '{}', '{"username":"PassportStranger"}', now(), now());

UPDATE public.profiles
SET is_public = true, username_state = 'claimed'
WHERE auth_user_id::text LIKE '78000000-0000-0000-0000-00000000000%';

DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.social_can_view_vehicle(uuid, uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated role can execute arbitrary-viewer vehicle authorization';
  END IF;
  IF has_table_privilege(
    'authenticated',
    'public.vehicle_ownership_events',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'authenticated role can directly read private ownership events';
  END IF;
END
$$;

CREATE TEMP TABLE passport_actors AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '78000000-0000-0000-0000-000000000001') owner,
  (SELECT id FROM public.profiles WHERE auth_user_id = '78000000-0000-0000-0000-000000000002') friend,
  (SELECT id FROM public.profiles WHERE auth_user_id = '78000000-0000-0000-0000-000000000003') stranger;

INSERT INTO public.friend_relationships (
  profile_low_id, profile_high_id, requested_by, status, responded_at
)
SELECT LEAST(owner, friend), GREATEST(owner, friend), owner, 'friends', now()
FROM passport_actors;

INSERT INTO public.vehicles (
  id, owner_id, year, make, model, visibility, engine, drivetrain, transmission, body_style
)
SELECT '78000000-0000-0000-0000-000000000010', owner, 2020, 'Acura', 'TLX',
       'friends', ' 2.0L Turbo ', ' AWD ', ' 10-speed automatic ', ' Sedan '
FROM passport_actors;

DO $$
DECLARE
  vehicle public.vehicles;
BEGIN
  SELECT * INTO vehicle FROM public.vehicles
  WHERE id = '78000000-0000-0000-0000-000000000010';
  IF vehicle.engine <> '2.0L Turbo'
     OR vehicle.drivetrain <> 'AWD'
     OR vehicle.transmission <> '10-speed automatic'
     OR vehicle.body_style <> 'Sedan' THEN
    RAISE EXCEPTION 'vehicle specification normalization failed';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"78000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '78000000-0000-0000-0000-000000000002', true);
DO $$
BEGIN
  IF NOT public.social_can_current_user_view_vehicle(
    '78000000-0000-0000-0000-000000000010'
  ) OR EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = '78000000-0000-0000-0000-000000000010'
  ) THEN
    RAISE EXCEPTION 'friend authorization or redacted-DTO boundary failed';
  END IF;
END
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"78000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '78000000-0000-0000-0000-000000000003', true);
DO $$
BEGIN
  IF public.social_can_current_user_view_vehicle(
    '78000000-0000-0000-0000-000000000010'
  ) OR EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = '78000000-0000-0000-0000-000000000010'
  ) THEN
    RAISE EXCEPTION 'stranger could view friends-only vehicle';
  END IF;
END
$$;
RESET ROLE;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '78000000-0000-0000-0000-000000000020', owner, 2021, 'Honda', 'Accord', 'public'
FROM passport_actors;
INSERT INTO public.marketplace_listings (
  id, vehicle_id, seller_id, title, asking_price_cents, status
)
SELECT '78000000-0000-0000-0000-000000000021',
       '78000000-0000-0000-0000-000000000020', owner,
       '2021 Honda Accord', 2400000, 'active'
FROM passport_actors;
INSERT INTO public.vehicles (
  id, owner_id, year, make, model, visibility, ownership_state
)
SELECT '78000000-0000-0000-0000-000000000030', owner,
       2022, 'Toyota', 'Supra', 'private', 'considering'
FROM passport_actors;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"78000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '78000000-0000-0000-0000-000000000001', true);
SELECT public.mark_vehicle_previously_owned(
  '78000000-0000-0000-0000-000000000020', false
);
-- A retried request must return the existing state without another event.
SELECT public.mark_vehicle_previously_owned(
  '78000000-0000-0000-0000-000000000020', true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.mark_vehicle_previously_owned(
      '78000000-0000-0000-0000-000000000030', false
    );
    RAISE EXCEPTION 'shopping vehicle was accepted as sold';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
END
$$;
DO $$
BEGIN
  BEGIN
    UPDATE public.vehicles SET ownership_state = 'previously_owned'
    WHERE id = '78000000-0000-0000-0000-000000000010';
    RAISE EXCEPTION 'direct sold transition was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;
RESET ROLE;

DO $$
DECLARE
  vehicle public.vehicles;
BEGIN
  SELECT * INTO vehicle FROM public.vehicles
  WHERE id = '78000000-0000-0000-0000-000000000020';
  IF vehicle.ownership_state <> 'previously_owned'
     OR vehicle.visibility <> 'private'
     OR vehicle.sold_at IS NULL THEN
    RAISE EXCEPTION 'atomic sold transition did not retain the private choice';
  END IF;
  IF (SELECT status FROM public.marketplace_listings
      WHERE id = '78000000-0000-0000-0000-000000000021') <> 'sold' THEN
    RAISE EXCEPTION 'atomic sold transition did not close the active listing';
  END IF;
  IF (SELECT count(*) FROM public.vehicle_ownership_events
      WHERE vehicle_id = vehicle.id) <> 1 THEN
    RAISE EXCEPTION 'sold transition retry created duplicate history events';
  END IF;
  IF vehicle.owner_id <> (SELECT owner FROM passport_actors) THEN
    RAISE EXCEPTION 'sold transition changed vehicle ownership';
  END IF;
END
$$;

ROLLBACK;
