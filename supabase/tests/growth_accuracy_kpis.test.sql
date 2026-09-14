\set ON_ERROR_STOP on
BEGIN;

-- Renditions-doc KPIs: allowlisted events roll up into counts and rates only.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'kpi-a@example.test', '', '{}', '{"username":"KpiA"}', now(), now()),
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'kpi-b@example.test', '', '{}', '{"username":"KpiB"}', now(), now());

CREATE TEMP TABLE kpi AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = 'c0000000-0000-0000-0000-000000000001') AS a,
  (SELECT id FROM public.profiles WHERE auth_user_id = 'c0000000-0000-0000-0000-000000000002') AS b;

INSERT INTO public.vehicles (owner_id, vin, make, model, configuration_type, factory_spec)
SELECT a, '1G1YY22G115113112', 'Chevrolet', 'Corvette', 'custom_build', '{"source":"nhtsa_vpic","vin":"1G1YY22G115113112"}'::jsonb FROM kpi;
INSERT INTO public.vehicles (owner_id, vin, make, model) SELECT b, '1HGCM82633A004352', 'Honda', 'Accord' FROM kpi;
INSERT INTO public.vehicle_build_stages (vehicle_id, owner_id, title)
SELECT v.id, v.owner_id, 'Stage 1' FROM public.vehicles v WHERE v.owner_id = (SELECT a FROM kpi);

DO $$
DECLARE
  v_a uuid := (SELECT a FROM kpi);
  v_b uuid := (SELECT b FROM kpi);
  k jsonb;
  hit boolean := false;
BEGIN
  PERFORM public.record_product_analytics_event(v_a, 'search_performed', 'community', NULL);
  PERFORM public.record_product_analytics_event(v_a, 'search_performed', 'community', NULL);
  PERFORM public.record_product_analytics_event(v_b, 'search_performed', 'community', NULL);
  PERFORM public.record_product_analytics_event(v_a, 'contact_match_found', 'profile', repeat('a', 64));
  PERFORM public.record_product_analytics_event(v_a, 'contact_match_found', 'profile', repeat('a', 64)); -- deduped
  PERFORM public.record_product_analytics_event(v_a, 'invite_shared', 'profile', NULL);
  PERFORM public.record_product_analytics_event(v_a, 'invite_shared', 'profile', NULL);
  PERFORM public.record_product_analytics_event(v_b, 'signup_from_invite', 'profile', repeat('b', 64));
  PERFORM public.record_product_analytics_event(v_a, 'factory_spec_recorded', 'garage', repeat('c', 64));
  PERFORM public.record_product_analytics_event(v_a, 'factory_conflict_refused', 'garage', NULL);
  PERFORM public.record_product_analytics_event(v_a, 'custom_build_declared', 'garage', repeat('d', 64));
  PERFORM public.record_product_analytics_event(v_a, 'build_stage_created', 'garage', NULL);

  -- The contact match "activates" when a friendship is accepted within 7 days.
  INSERT INTO public.friend_relationships (profile_low_id, profile_high_id, requested_by, status, responded_at)
  VALUES (LEAST(v_a, v_b), GREATEST(v_a, v_b), v_a, 'friends', now());

  BEGIN
    PERFORM public.record_product_analytics_event(v_a, 'anything_else', 'garage', NULL);
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'event allowlist is open'; END IF;

  k := public.get_growth_accuracy_kpis(30);
  IF (k->'search'->>'searches')::integer <> 3 OR (k->'search'->>'searchers')::integer <> 2 THEN RAISE EXCEPTION 'search: %', k->'search'; END IF;
  IF (k->'network'->>'contactMatches')::integer <> 1 OR (k->'network'->>'activatedAfterContactMatch')::integer <> 1
     OR (k->'network'->>'activationRatePercent')::integer <> 100 THEN RAISE EXCEPTION 'network: %', k->'network'; END IF;
  IF (k->'invites'->>'shared')::integer <> 2 OR (k->'invites'->>'signups')::integer <> 1 OR (k->'invites'->>'conversionRatePercent')::integer <> 50 THEN
    RAISE EXCEPTION 'invites: %', k->'invites';
  END IF;
  IF (k->'accuracy'->>'vehiclesWithVin')::integer <> 2 OR (k->'accuracy'->>'vehiclesWithFactorySpec')::integer <> 1
     OR (k->'accuracy'->>'factoryCoveragePercent')::integer <> 50 OR (k->'accuracy'->>'factoryConflictsRefused')::integer <> 1 THEN
    RAISE EXCEPTION 'accuracy: %', k->'accuracy';
  END IF;
  IF (k->'customBuilds'->>'customBuildVehicles')::integer <> 1 OR (k->'customBuilds'->>'stagesCreated')::integer <> 1
     OR (k->'customBuilds'->>'vehiclesWithStages')::integer <> 1 THEN
    RAISE EXCEPTION 'custom builds: %', k->'customBuilds';
  END IF;
  -- Counts only: no identifiers or content in the payload.
  IF k::text LIKE '%' || v_a::text || '%' OR k::text ILIKE '%1G1YY22G%' THEN RAISE EXCEPTION 'kpi payload leaks identifiers'; END IF;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.get_growth_accuracy_kpis(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'kpi summary leaked to clients';
  END IF;
END
$$;

ROLLBACK;
