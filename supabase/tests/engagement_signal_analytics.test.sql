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

-- Funnel hashes correlate the same resource without exposing its identifier.
UPDATE public.product_analytics_events SET dedupe_hash = repeat('a', 64)
WHERE profile_id = (SELECT shopper_id FROM signal_ids)
  AND event_name IN ('group_detail_viewed', 'group_joined');
UPDATE public.product_analytics_events SET dedupe_hash = repeat('b', 64)
WHERE profile_id = (SELECT owner_id FROM signal_ids)
  AND event_name IN ('group_detail_viewed', 'group_joined');
WITH reservations AS (
  SELECT id, row_number() OVER (ORDER BY id) AS ordinal
  FROM public.product_analytics_events WHERE event_name = 'media_upload_reserved'
) UPDATE public.product_analytics_events event
SET dedupe_hash = CASE reservations.ordinal WHEN 1 THEN repeat('c', 64) ELSE repeat('d', 64) END
FROM reservations WHERE event.id = reservations.id;
UPDATE public.product_analytics_events SET dedupe_hash = repeat('c', 64)
WHERE event_name = 'media_upload_attached';
-- Joining a different group and attaching an unrelated upload are not conversions.
INSERT INTO public.product_analytics_events (profile_id, event_name, surface, dedupe_hash)
SELECT owner_id, 'group_joined', 'community', repeat('e', 64) FROM signal_ids
UNION ALL SELECT owner_id, 'media_upload_attached', 'community', repeat('f', 64) FROM signal_ids;

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
     OR v->'sessions'->'crashFreePercent' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'reliability observations wrong: %', v->'sessions';
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

-- Client observations have a closed allowlist and serialized rate limits.
DO $$ BEGIN
  IF has_function_privilege('authenticated', 'public.record_client_product_event(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'client telemetry RPC leaked directly to clients';
  END IF;
  BEGIN
    PERFORM public.record_client_product_event(current_setting('test.signal_tech_id')::uuid, 'arbitrary_event');
    RAISE EXCEPTION 'arbitrary client event accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  -- The allowlist loop already recorded this account's session.
  BEGIN
    PERFORM public.record_client_product_event(current_setting('test.signal_tech_id')::uuid, 'app_session_started');
    RAISE EXCEPTION 'unlimited client observations accepted';
  EXCEPTION WHEN program_limit_exceeded THEN NULL;
  END;
END $$;

-- Opt-out applies to the message denominator, not just event collection.
RESET ROLE;
INSERT INTO public.friend_relationships (profile_low_id, profile_high_id, requested_by, status, responded_at)
SELECT LEAST(shopper_id, owner_id), GREATEST(shopper_id, owner_id), shopper_id, 'friends', now() FROM signal_ids;
DO $$
DECLARE v_conversation record; v jsonb;
BEGIN
  SELECT * INTO v_conversation FROM public.create_direct_conversation_internal(
    (SELECT shopper_id FROM signal_ids), (SELECT owner_id FROM signal_ids), NULL, 'accepted', NULL);
  INSERT INTO public.messages (conversation_id, sender_id, content, status)
  SELECT v_conversation.conversation_id, shopper_id, 'Opted in message', 'unread'::public.message_status FROM signal_ids
  UNION ALL SELECT v_conversation.conversation_id, owner_id, 'Opted out message', 'unread'::public.message_status FROM signal_ids;
  PERFORM public.set_product_analytics_preference((SELECT owner_id FROM signal_ids), false);
  v := public.get_product_engagement_signals(30);
  IF (v->'unwantedContact'->>'messagesSent')::integer <> 1 THEN
    RAISE EXCEPTION 'opted-out messages entered the analytics denominator';
  END IF;
  IF public.record_client_product_event((SELECT owner_id FROM signal_ids), 'invite_shared') THEN
    RAISE EXCEPTION 'client event recorded after opt-out';
  END IF;
END $$;

ROLLBACK;
