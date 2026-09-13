BEGIN;

-- First-party, coarse product measurement for plan section 34. This is not a
-- general telemetry sink: event names and surfaces are closed allowlists, and
-- there is deliberately no arbitrary JSON payload or free-form text column.
-- Keep the preference off profiles: public-profile RLS permits column-level
-- reads, so an account preference stored there would leak with SELECT *.
CREATE TABLE IF NOT EXISTS public.product_analytics_preferences (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (event_name IN (
    'profile_completed', 'garage_vehicle_added', 'garage_vehicle_updated',
    'report_viewed', 'listing_viewed', 'listing_saved',
    'seller_message_started', 'inspection_requested', 'inspection_completed',
    'group_joined', 'community_post_published', 'question_published',
    'build_update_published', 'maintenance_update_published', 'answer_accepted'
  )),
  surface text NOT NULL CHECK (surface IN (
    'profile', 'garage', 'inspection', 'community', 'marketplace'
  )),
  dedupe_hash text CHECK (dedupe_hash IS NULL OR dedupe_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  CHECK (expires_at > occurred_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_analytics_events_dedupe_idx
  ON public.product_analytics_events(profile_id, event_name, dedupe_hash)
  WHERE dedupe_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_analytics_events_name_time_idx
  ON public.product_analytics_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS product_analytics_events_profile_time_idx
  ON public.product_analytics_events(profile_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS product_analytics_events_expiry_idx
  ON public.product_analytics_events(expires_at);

ALTER TABLE public.product_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_analytics_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_analytics_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_analytics_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.product_analytics_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_analytics_preferences TO service_role;

COMMENT ON TABLE public.product_analytics_events IS
  'Service-only, opt-out-aware first-party product events. Contains no content, VINs, locations, entity IDs, request text, or arbitrary properties; rows expire after 90 days.';
COMMENT ON TABLE public.product_analytics_preferences IS
  'Private account-level product analytics preference. No row means enabled; disabling atomically deletes the profile product events.';

CREATE OR REPLACE FUNCTION public.record_product_analytics_event(
  p_profile_id uuid,
  p_event_name text,
  p_surface text,
  p_dedupe_hash text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted_id bigint;
BEGIN
  INSERT INTO public.product_analytics_events (
    profile_id, event_name, surface, dedupe_hash
  )
  SELECT p.id, p_event_name, p_surface, p_dedupe_hash
  FROM public.profiles p
  WHERE p.id = p_profile_id
    AND COALESCE((
      SELECT preference.enabled
      FROM public.product_analytics_preferences preference
      WHERE preference.profile_id = p.id
    ), true)
  ON CONFLICT (profile_id, event_name, dedupe_hash)
    WHERE dedupe_hash IS NOT NULL
    DO NOTHING
  RETURNING id INTO v_inserted_id;

  RETURN v_inserted_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_analytics_preference(
  p_profile_id uuid,
  p_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.product_analytics_preferences (profile_id, enabled, updated_at)
  VALUES (p_profile_id, p_enabled, now())
  ON CONFLICT (profile_id) DO UPDATE
  SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at;

  IF NOT p_enabled THEN
    DELETE FROM public.product_analytics_events WHERE profile_id = p_profile_id;
  END IF;

  RETURN p_enabled;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_product_analytics_events()
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted bigint;
BEGIN
  DELETE FROM public.product_analytics_events WHERE expires_at <= now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_analytics_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT now() - make_interval(days => LEAST(GREATEST(p_days, 1), 90)) AS starts_at
  ),
  window_events AS (
    SELECT event_name, profile_id, occurred_at
    FROM public.product_analytics_events, bounds
    WHERE occurred_at >= bounds.starts_at
  ),
  meaningful_profiles AS (
    SELECT profile_id
    FROM public.product_analytics_events
    WHERE occurred_at >= now() - interval '7 days'
      AND event_name IN (
        'garage_vehicle_added', 'garage_vehicle_updated', 'report_viewed',
        'listing_saved', 'inspection_requested', 'group_joined',
        'community_post_published', 'question_published',
        'build_update_published', 'maintenance_update_published', 'answer_accepted'
      )
    GROUP BY profile_id
    HAVING count(*) >= 2
  ),
  recent_profiles AS (
    SELECT p.id, p.created_at
    FROM public.profiles p, bounds
    WHERE p.created_at >= bounds.starts_at
      AND p.username_state = 'claimed'
  ),
  activated_profiles AS (
    SELECT DISTINCT p.id
    FROM recent_profiles p
    JOIN public.product_analytics_events event ON event.profile_id = p.id
      AND event.occurred_at >= p.created_at
      AND event.occurred_at < p.created_at + interval '7 days'
      AND event.event_name IN (
        'garage_vehicle_added', 'garage_vehicle_updated', 'report_viewed',
        'listing_saved', 'inspection_requested', 'group_joined',
        'community_post_published', 'question_published',
        'build_update_published', 'maintenance_update_published', 'answer_accepted'
      )
  ),
  event_counts AS (
    SELECT event_name, count(*) AS event_count, count(DISTINCT profile_id) AS user_count
    FROM window_events
    GROUP BY event_name
  ),
  daily_users AS (
    SELECT occurred_at::date AS day, count(DISTINCT profile_id) AS user_count
    FROM window_events
    GROUP BY occurred_at::date
    ORDER BY day
  )
  SELECT jsonb_build_object(
    'windowDays', LEAST(GREATEST(p_days, 1), 90),
    'activeUsers', (SELECT count(DISTINCT profile_id) FROM window_events),
    'weeklyMeaningfulUsers', (SELECT count(*) FROM meaningful_profiles),
    'eligibleNewProfiles', (SELECT count(*) FROM recent_profiles),
    'activatedNewProfiles', (SELECT count(*) FROM activated_profiles),
    'optedInProfiles', (
      SELECT count(*) FROM public.profiles p
      LEFT JOIN public.product_analytics_preferences preference ON preference.profile_id = p.id
      WHERE COALESCE(preference.enabled, true)
    ),
    'optedOutProfiles', (
      SELECT count(*) FROM public.product_analytics_preferences WHERE NOT enabled
    ),
    'eventCounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'eventName', event_name, 'eventCount', event_count, 'userCount', user_count
      ) ORDER BY event_count DESC)
      FROM event_counts
    ), '[]'::jsonb),
    'dailyActiveUsers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', day, 'userCount', user_count) ORDER BY day)
      FROM daily_users
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.record_product_analytics_event(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_product_analytics_preference(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_product_analytics_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_product_analytics_summary(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_analytics_event(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_product_analytics_preference(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_product_analytics_events() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_product_analytics_summary(integer) TO service_role;

ALTER TABLE public.operational_worker_runs
  DROP CONSTRAINT IF EXISTS operational_worker_runs_worker_code_check;
ALTER TABLE public.operational_worker_runs
  ADD CONSTRAINT operational_worker_runs_worker_code_check CHECK (worker_code IN (
    'outputs', 'deliveries', 'storage_cleanup', 'community_media_migration',
    'retention_purge', 'moderation_outbox', 'marketplace_saved_searches',
    'product_analytics_retention'
  ));

COMMIT;
