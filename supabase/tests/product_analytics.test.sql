\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '8f000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'analytics@example.test', '', '{}',
  '{"username":"AnalyticsTester"}', now(), now()
);

SELECT set_config('test.analytics_profile_id', id::text, true)
FROM public.profiles
WHERE auth_user_id = '8f000000-0000-0000-0000-000000000001'::uuid;

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_profile_id uuid := current_setting('test.analytics_profile_id')::uuid;
  v_summary jsonb;
BEGIN
  IF NOT public.record_product_analytics_event(
    v_profile_id, 'garage_vehicle_added', 'garage', repeat('a', 64)
  ) THEN
    RAISE EXCEPTION 'opted-in event was not recorded';
  END IF;

  IF public.record_product_analytics_event(
    v_profile_id, 'garage_vehicle_added', 'garage', repeat('a', 64)
  ) THEN
    RAISE EXCEPTION 'duplicate event was recorded twice';
  END IF;

  PERFORM public.record_product_analytics_event(
    v_profile_id, 'listing_saved', 'marketplace', repeat('b', 64)
  );
  v_summary := public.get_product_analytics_summary(30);
  IF (v_summary ->> 'weeklyMeaningfulUsers')::integer <> 1 THEN
    RAISE EXCEPTION 'north-star count did not require two meaningful actions';
  END IF;

  IF public.set_product_analytics_preference(v_profile_id, false) THEN
    RAISE EXCEPTION 'opt-out did not return disabled state';
  END IF;
  IF EXISTS (SELECT 1 FROM public.product_analytics_events WHERE profile_id = v_profile_id) THEN
    RAISE EXCEPTION 'opt-out did not delete existing product events';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.product_analytics_preferences
    WHERE profile_id = v_profile_id AND NOT enabled
  ) THEN
    RAISE EXCEPTION 'private opt-out preference was not persisted';
  END IF;
  IF public.record_product_analytics_event(
    v_profile_id, 'group_joined', 'community', repeat('c', 64)
  ) THEN
    RAISE EXCEPTION 'event was recorded after opt-out';
  END IF;

  PERFORM public.set_product_analytics_preference(v_profile_id, true);
  INSERT INTO public.product_analytics_events (
    profile_id, event_name, surface, occurred_at, expires_at
  ) VALUES (
    v_profile_id, 'report_viewed', 'inspection', now() - interval '100 days', now() - interval '10 days'
  );
  IF public.prune_product_analytics_events() <> 1 THEN
    RAISE EXCEPTION 'retention worker did not prune the expired event';
  END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.product_analytics_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.product_analytics_events', 'INSERT')
     OR has_table_privilege('anon', 'public.product_analytics_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.product_analytics_preferences', 'SELECT')
     OR has_table_privilege('anon', 'public.product_analytics_preferences', 'SELECT') THEN
    RAISE EXCEPTION 'raw product analytics leaked to application roles';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'usage_analytics_enabled'
  ) THEN
    RAISE EXCEPTION 'private analytics preference leaked onto public profile rows';
  END IF;
  IF has_function_privilege(
       'authenticated', 'public.record_product_analytics_event(uuid,text,text,text)', 'EXECUTE'
     ) OR has_function_privilege(
       'authenticated', 'public.get_product_analytics_summary(integer)', 'EXECUTE'
     ) OR has_function_privilege(
       'authenticated', 'public.set_product_analytics_preference(uuid,boolean)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service-only analytics function leaked to authenticated clients';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_analytics_events'
      AND column_name IN ('properties', 'content', 'location', 'vin', 'user_agent', 'ip_address')
  ) THEN
    RAISE EXCEPTION 'analytics table contains an unrestricted or sensitive payload column';
  END IF;
END
$$;

ROLLBACK;
