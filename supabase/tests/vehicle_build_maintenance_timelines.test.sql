\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('79000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'timeline-owner@example.test', '', '{}', '{"username":"TimelineOwner"}', now(), now()),
  ('79000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'timeline-other@example.test', '', '{}', '{"username":"TimelineOther"}', now(), now());

UPDATE public.profiles
SET username_state = 'claimed', is_public = true
WHERE auth_user_id::text LIKE '79000000-0000-0000-0000-00000000000%';

CREATE TEMP TABLE timeline_actors AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '79000000-0000-0000-0000-000000000001') owner,
  (SELECT id FROM public.profiles WHERE auth_user_id = '79000000-0000-0000-0000-000000000002') other;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '79000000-0000-0000-0000-000000000010', owner, 2024, 'Honda', 'Civic', 'public'
FROM timeline_actors;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.vehicle_build_entries', 'SELECT')
     OR has_table_privilege('authenticated', 'public.vehicle_build_entries', 'INSERT')
     OR has_table_privilege('authenticated', 'public.vehicle_maintenance_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.vehicle_maintenance_events', 'INSERT') THEN
    RAISE EXCEPTION 'timeline tables are directly exposed to authenticated clients';
  END IF;
END
$$;

INSERT INTO public.vehicle_build_entries (
  id, vehicle_id, owner_id, category, title, cost_cents, private_notes,
  public_notes, is_public
)
SELECT '79000000-0000-0000-0000-000000000020',
       '79000000-0000-0000-0000-000000000010', owner,
       'Suspension', 'Coilovers', 120000, 'receipt in glovebox',
       'Street setup', true
FROM timeline_actors;

INSERT INTO public.vehicle_maintenance_events (
  id, vehicle_id, owner_id, service_type, serviced_on, mileage,
  cost_cents, private_notes, public_notes, is_public
)
SELECT '79000000-0000-0000-0000-000000000030',
       '79000000-0000-0000-0000-000000000010', owner,
       'Oil change', DATE '2026-09-12', 42000,
       8900, 'card ending 1234', 'Full synthetic', true
FROM timeline_actors;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.vehicle_build_entries (vehicle_id, owner_id, category, title)
    SELECT '79000000-0000-0000-0000-000000000010', other, 'Wheels', 'Wrong owner'
    FROM timeline_actors;
    RAISE EXCEPTION 'mismatched timeline owner was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.vehicle_build_entries
    SET owner_id = (SELECT other FROM timeline_actors)
    WHERE id = '79000000-0000-0000-0000-000000000020';
    RAISE EXCEPTION 'timeline ownership mutation was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF (SELECT fitment_confidence FROM public.vehicle_build_entries
      WHERE id = '79000000-0000-0000-0000-000000000020') <> 'owner_reported'
     OR (SELECT status FROM public.vehicle_build_entries
         WHERE id = '79000000-0000-0000-0000-000000000020') <> 'installed' THEN
    RAISE EXCEPTION 'safe build defaults were not applied';
  END IF;
END
$$;

ROLLBACK;
