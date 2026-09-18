\set ON_ERROR_STOP on
BEGIN;

-- Plan 34: discovery-to-join, upload completion, unwanted contact, sessions,
-- and observed-intent retention are computed from the closed event list and
-- never expose identifiers or under-threshold rates.

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('8e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'signal-shopper@example.test', '', '{}', '{"username":"SignalShopper"}', now(), now()),
  ('8e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'signal-owner@example.test', '', '{}', '{"username":"SignalOwner"}', now(), now()),
  ('8e000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'signal-tech@example.test', '', '{}', '{"username":"SignalTech","role":"technician"}', now(), now());

-- Old enough accounts to be D7-eligible; the technician role is explicit.
UPDATE public.profiles SET created_at = now() - interval '20 days'
WHERE auth_user_id IN (
  '8e000000-0000-0000-0000-000000000001',
  '8e000000-0000-0000-0000-000000000002',
  '8e000000-0000-0000-0000-000000000003'
);
UPDATE public.profiles SET role = 'technician'
WHERE auth_user_id = '8e000000-0000-0000-0000-000000000003';

CREATE TEMP TABLE signal_ids AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '8e000000-0000-0000-0000-000000000001') shopper_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '8e000000-0000-0000-0000-000000000002') owner_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '8e000000-0000-0000-0000-000000000003') tech_id;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.get_product_engagement_signals(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'engagement signals leaked to authenticated clients';
  END IF;
END
$$;

-- Events: the RPC stamps occurred_at = now(), so back-date directly for the
-- first-week / retention windows.
INSERT INTO public.product_analytics_events (profile_id, event_name, surface, occurred_at)
SELECT shopper_id, 'listing_viewed', 'marketplace', now() - interval '19 days' FROM signal_ids
UNION ALL SELECT shopper_id, 'group_detail_viewed', 'community', now() - interval '10 days' FROM signal_ids
UNION ALL SELECT shopper_id, 'group_joined', 'community', now() - interval '9 days' FROM signal_ids
UNION ALL SELECT shopper_id, 'listing_saved', 'marketplace', now() - interval '11 days' FROM signal_ids  -- D7 window (day 9)
UNION ALL SELECT owner_id, 'garage_vehicle_added', 'garage', now() - interval '19 days' FROM signal_ids
UNION ALL SELECT owner_id, 'group_joined', 'community', now() - interval '18 days' FROM signal_ids       -- before any view: not a conversion
UNION ALL SELECT owner_id, 'group_detail_viewed', 'community', now() - interval '3 days' FROM signal_ids
UNION ALL SELECT owner_id, 'media_upload_reserved', 'community', now() - interval '2 days' FROM signal_ids
UNION ALL SELECT owner_id, 'media_upload_reserved', 'community', now() - interval '2 days' FROM signal_ids
UNION ALL SELECT owner_id, 'media_upload_attached', 'community', now() - interval '2 days' FROM signal_ids
UNION ALL SELECT owner_id, 'app_session_started', 'profile', now() - interval '1 day' FROM signal_ids
UNION ALL SELECT owner_id, 'app_session_started', 'profile', now() - interval '1 day' FROM signal_ids
UNION ALL SELECT owner_id, 'app_session_started', 'profile', now() - interval '1 day' FROM signal_ids
UNION ALL SELECT owner_id, 'app_session_started', 'profile', now() - interval '1 day' FROM signal_ids
UNION ALL SELECT owner_id, 'app_crash_detected', 'profile', now() - interval '1 day' FROM signal_ids
UNION ALL SELECT tech_id, 'unwanted_contact_reported', 'profile', now() - interval '1 day' FROM signal_ids
UNION ALL SELECT tech_id, 'blocked_contact_attempt', 'profile', now() - interval '1 day' FROM signal_ids
UNION ALL SELECT tech_id, 'blocked_contact_attempt', 'profile', now() - interval '1 day' FROM signal_ids;

SELECT set_config('test.signal_tech_id', tech_id::text, true) FROM signal_ids;

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v jsonb := public.get_product_engagement_signals(30);
  v_seg jsonb;
BEGIN
  -- Discovery → join: two viewers, only the shopper joined after viewing.
  IF (v->'groupDiscovery'->>'viewers')::int <> 2 OR (v->'groupDiscovery'->>'joiners')::int <> 1
     OR (v->'groupDiscovery'->>'ratePercent')::numeric <> 50.0 THEN
    RAISE EXCEPTION 'group discovery conversion wrong: %', v->'groupDiscovery';
  END IF;

  IF (v->'uploadCompletion'->>'reserved')::int <> 2 OR (v->'uploadCompletion'->>'attached')::int <> 1
     OR (v->'uploadCompletion'->>'ratePercent')::numeric <> 50.0 THEN
    RAISE EXCEPTION 'upload completion wrong: %', v->'uploadCompletion';
  END IF;

  IF (v->'unwantedContact'->>'reports')::int <> 1 OR (v->'unwantedContact'->>'blockedAttempts')::int <> 2
     OR (v->'unwantedContact'->>'blockedAttemptUsers')::int <> 1 THEN
    RAISE EXCEPTION 'unwanted contact wrong: %', v->'unwantedContact';
  END IF;

  IF (v->'sessions'->>'sessions')::int <> 4 OR (v->'sessions'->>'crashes')::int <> 1
     OR (v->'sessions'->>'crashFreePercent')::numeric <> 75.00 THEN
    RAISE EXCEPTION 'crash-free sessions wrong: %', v->'sessions';
  END IF;

  -- Intent: technician by role; owner by garage signal; shopper by listing
  -- signal (the later group join does not reclassify them). Each segment has
  -- one eligible account, so rates are suppressed while counts are exact.
  SELECT seg INTO v_seg FROM jsonb_array_elements(v->'intentRetention') seg WHERE seg->>'segment' = 'technician';
  IF (v_seg->>'d7Eligible')::int <> 1 THEN RAISE EXCEPTION 'technician segment missing: %', v_seg; END IF;
  SELECT seg INTO v_seg FROM jsonb_array_elements(v->'intentRetention') seg WHERE seg->>'segment' = 'owner';
  IF (v_seg->>'d7Eligible')::int <> 1 THEN RAISE EXCEPTION 'owner segment missing: %', v_seg; END IF;
  SELECT seg INTO v_seg FROM jsonb_array_elements(v->'intentRetention') seg WHERE seg->>'segment' = 'shopper';
  IF (v_seg->>'d7Eligible')::int <> 1 OR (v_seg->>'d7Retained')::int <> 1 THEN
    RAISE EXCEPTION 'shopper segment or retention wrong: %', v_seg;
  END IF;
  IF v_seg->'d7RatePercent' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'rate published for a cohort under five accounts';
  END IF;

  -- Nothing identifying leaves the function.
  IF v::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN
    RAISE EXCEPTION 'engagement signals contain an identifier';
  END IF;
END
$$;

-- Every new event name is accepted by the recording RPC and dedupes like the rest.
DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'group_detail_viewed', 'media_upload_reserved', 'media_upload_attached',
    'unwanted_contact_reported', 'blocked_contact_attempt', 'app_session_started', 'app_crash_detected'
  ] LOOP
    IF NOT public.record_product_analytics_event(current_setting('test.signal_tech_id')::uuid, v_name, 'profile', NULL) THEN
      RAISE EXCEPTION 'event % refused', v_name;
    END IF;
  END LOOP;
END
$$;

ROLLBACK;
