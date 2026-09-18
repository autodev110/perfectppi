BEGIN;

-- ============================================================================
-- Plan section 34: source data for the measures that had none.
--
--   group discovery-to-join  → group_detail_viewed (non-member opened a group)
--   upload completion rate   → media_upload_reserved / media_upload_attached
--   unwanted contact         → unwanted_contact_reported (message / profile
--                              report) and blocked_contact_attempt (a message
--                              or friend request refused because of a block)
--   crash-free sessions      → app_session_started / app_crash_detected
--                              (client-observed, closed names, nothing else)
--   intent segmentation      → derived from role + first-week events, no new
--                              data collection
--
-- Same rules as the rest of product analytics: closed allowlist, no content
-- or identifiers, 90-day expiry, opt-out aware, aggregate-only output with
-- small cohorts suppressed.
-- ============================================================================

ALTER TABLE public.product_analytics_events
  DROP CONSTRAINT IF EXISTS product_analytics_events_event_name_check;
ALTER TABLE public.product_analytics_events
  ADD CONSTRAINT product_analytics_events_event_name_check CHECK (event_name IN (
    'profile_completed', 'garage_vehicle_added', 'garage_vehicle_updated',
    'report_viewed', 'listing_viewed', 'listing_saved',
    'seller_message_started', 'inspection_requested', 'inspection_completed',
    'group_joined', 'community_post_published', 'question_published',
    'build_update_published', 'maintenance_update_published', 'answer_accepted',
    -- Renditions KPIs
    'search_performed', 'contact_match_found', 'invite_shared', 'signup_from_invite',
    'factory_spec_recorded', 'factory_conflict_refused', 'custom_build_declared', 'build_stage_created',
    -- Engagement / reliability signals (this migration)
    'group_detail_viewed', 'media_upload_reserved', 'media_upload_attached',
    'unwanted_contact_reported', 'blocked_contact_attempt',
    'app_session_started', 'app_crash_detected'
  ));

-- Session and crash events arrive per foreground / per crash report and are
-- not deduplicated; the expiry index keeps the 90-day sweep cheap.
CREATE INDEX IF NOT EXISTS product_analytics_events_name_profile_time_idx
  ON public.product_analytics_events(event_name, profile_id, occurred_at);

CREATE OR REPLACE FUNCTION public.get_product_engagement_signals(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH bounds AS (
    SELECT
      now() - make_interval(days => LEAST(GREATEST(p_days, 1), 90)) AS starts_at,
      LEAST(GREATEST(p_days, 1), 90) AS window_days
  ),
  window_events AS (
    SELECT event.event_name, event.profile_id, event.occurred_at
    FROM public.product_analytics_events event, bounds
    WHERE event.occurred_at >= bounds.starts_at
  ),
  -- ── Group discovery → join ──────────────────────────────────────────────
  discovery AS (
    SELECT profile_id, min(occurred_at) AS first_view
    FROM window_events
    WHERE event_name = 'group_detail_viewed'
    GROUP BY profile_id
  ),
  discovery_joins AS (
    SELECT count(*) AS viewers,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM window_events joined
          WHERE joined.event_name = 'group_joined'
            AND joined.profile_id = discovery.profile_id
            AND joined.occurred_at >= discovery.first_view
        )
      ) AS joiners
    FROM discovery
  ),
  -- ── Upload completion ───────────────────────────────────────────────────
  uploads AS (
    SELECT
      count(*) FILTER (WHERE event_name = 'media_upload_reserved') AS reserved,
      count(*) FILTER (WHERE event_name = 'media_upload_attached') AS attached
    FROM window_events
  ),
  -- ── Unwanted contact ────────────────────────────────────────────────────
  contact AS (
    SELECT
      count(*) FILTER (WHERE event_name = 'unwanted_contact_reported') AS reports,
      count(DISTINCT profile_id) FILTER (WHERE event_name = 'unwanted_contact_reported') AS reporting_users,
      count(*) FILTER (WHERE event_name = 'blocked_contact_attempt') AS blocked_attempts,
      count(DISTINCT profile_id) FILTER (WHERE event_name = 'blocked_contact_attempt') AS blocked_attempt_users
    FROM window_events
  ),
  messages_sent AS (
    SELECT count(*) AS message_count
    FROM public.messages message, bounds
    WHERE message.created_at >= bounds.starts_at
  ),
  -- ── Sessions and crashes (client-observed) ──────────────────────────────
  sessions AS (
    SELECT
      count(*) FILTER (WHERE event_name = 'app_session_started') AS session_count,
      count(*) FILTER (WHERE event_name = 'app_crash_detected') AS crash_count,
      count(DISTINCT profile_id) FILTER (WHERE event_name = 'app_session_started') AS session_users
    FROM window_events
  ),
  -- ── Observed intent (plan 34.1: shopper / owner / enthusiast / technician) ─
  -- Decided from the account role and the first seven days of events, in
  -- priority order, so every profile lands in exactly one segment.
  cohort AS (
    SELECT profile.id, profile.created_at, profile.role
    FROM public.profiles profile
    LEFT JOIN public.product_analytics_preferences preference ON preference.profile_id = profile.id
    WHERE profile.username_state = 'claimed'
      AND profile.created_at >= now() - interval '90 days'
      AND COALESCE(preference.enabled, true)
  ),
  first_week AS (
    SELECT cohort.id,
      bool_or(event.event_name IN ('garage_vehicle_added', 'garage_vehicle_updated', 'factory_spec_recorded',
                                   'build_update_published', 'maintenance_update_published', 'build_stage_created')) AS owner_signal,
      bool_or(event.event_name IN ('listing_viewed', 'listing_saved', 'seller_message_started',
                                   'inspection_requested', 'search_performed')) AS shopper_signal,
      bool_or(event.event_name IN ('group_joined', 'community_post_published', 'question_published',
                                   'answer_accepted', 'group_detail_viewed')) AS enthusiast_signal
    FROM cohort
    LEFT JOIN public.product_analytics_events event
      ON event.profile_id = cohort.id
      AND event.occurred_at >= cohort.created_at
      AND event.occurred_at < cohort.created_at + interval '7 days'
    GROUP BY cohort.id
  ),
  segmented AS (
    SELECT cohort.id, cohort.created_at,
      CASE
        WHEN cohort.role = 'technician' THEN 'technician'
        WHEN COALESCE(first_week.owner_signal, false) THEN 'owner'
        WHEN COALESCE(first_week.shopper_signal, false) THEN 'shopper'
        WHEN COALESCE(first_week.enthusiast_signal, false) THEN 'enthusiast'
        ELSE 'undetermined'
      END AS segment
    FROM cohort
    LEFT JOIN first_week ON first_week.id = cohort.id
  ),
  meaningful_events AS (
    SELECT event.profile_id, event.occurred_at
    FROM public.product_analytics_events event
    WHERE event.event_name IN (
      'garage_vehicle_added', 'garage_vehicle_updated', 'report_viewed',
      'listing_saved', 'inspection_requested', 'group_joined',
      'community_post_published', 'question_published',
      'build_update_published', 'maintenance_update_published', 'answer_accepted'
    )
  ),
  intent_retention AS (
    SELECT segment,
      count(*) FILTER (WHERE created_at <= now() - interval '14 days') AS d7_eligible,
      count(*) FILTER (
        WHERE created_at <= now() - interval '14 days'
          AND EXISTS (
            SELECT 1 FROM meaningful_events event
            WHERE event.profile_id = segmented.id
              AND event.occurred_at >= segmented.created_at + interval '7 days'
              AND event.occurred_at < segmented.created_at + interval '14 days'
          )
      ) AS d7_retained,
      count(*) FILTER (WHERE created_at <= now() - interval '37 days') AS d30_eligible,
      count(*) FILTER (
        WHERE created_at <= now() - interval '37 days'
          AND EXISTS (
            SELECT 1 FROM meaningful_events event
            WHERE event.profile_id = segmented.id
              AND event.occurred_at >= segmented.created_at + interval '30 days'
              AND event.occurred_at < segmented.created_at + interval '37 days'
          )
      ) AS d30_retained
    FROM segmented
    GROUP BY segment
  ),
  segments AS (
    SELECT segment FROM (VALUES ('shopper'), ('owner'), ('enthusiast'), ('technician'), ('undetermined')) AS s(segment)
  )
  SELECT jsonb_build_object(
    'windowDays', (SELECT window_days FROM bounds),
    'groupDiscovery', (
      SELECT jsonb_build_object(
        'viewers', viewers,
        'joiners', joiners,
        'ratePercent', CASE WHEN viewers = 0 THEN NULL ELSE round(100.0 * joiners / viewers, 1) END
      ) FROM discovery_joins
    ),
    'uploadCompletion', (
      SELECT jsonb_build_object(
        'reserved', reserved,
        'attached', attached,
        'ratePercent', CASE WHEN reserved = 0 THEN NULL ELSE round(100.0 * LEAST(attached, reserved) / reserved, 1) END
      ) FROM uploads
    ),
    'unwantedContact', (
      SELECT jsonb_build_object(
        'reports', contact.reports,
        'reportingUsers', contact.reporting_users,
        'blockedAttempts', contact.blocked_attempts,
        'blockedAttemptUsers', contact.blocked_attempt_users,
        'messagesSent', messages_sent.message_count,
        'reportsPerThousandMessages', CASE WHEN messages_sent.message_count = 0 THEN NULL
          ELSE round(1000.0 * contact.reports / messages_sent.message_count, 2) END
      ) FROM contact, messages_sent
    ),
    'sessions', (
      SELECT jsonb_build_object(
        'sessions', session_count,
        'sessionUsers', session_users,
        'crashes', crash_count,
        'crashFreePercent', CASE WHEN session_count = 0 THEN NULL
          ELSE round(100.0 * GREATEST(session_count - crash_count, 0) / session_count, 2) END
      ) FROM sessions
    ),
    -- Segments with fewer than five eligible accounts report counts but no
    -- rate, so a tiny cohort cannot identify anyone.
    'intentRetention', (
      SELECT jsonb_agg(jsonb_build_object(
        'segment', segments.segment,
        'd7Eligible', COALESCE(r.d7_eligible, 0),
        'd7Retained', COALESCE(r.d7_retained, 0),
        'd7RatePercent', CASE WHEN COALESCE(r.d7_eligible, 0) < 5 THEN NULL
          ELSE round(100.0 * r.d7_retained / r.d7_eligible, 1) END,
        'd30Eligible', COALESCE(r.d30_eligible, 0),
        'd30Retained', COALESCE(r.d30_retained, 0),
        'd30RatePercent', CASE WHEN COALESCE(r.d30_eligible, 0) < 5 THEN NULL
          ELSE round(100.0 * r.d30_retained / r.d30_eligible, 1) END
      ) ORDER BY segments.segment)
      FROM segments
      LEFT JOIN intent_retention r ON r.segment = segments.segment
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_product_engagement_signals(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_engagement_signals(integer)
  TO service_role;

COMMENT ON FUNCTION public.get_product_engagement_signals(integer) IS
  'Service-only plan-34 signals: group discovery-to-join, upload completion, unwanted-contact attribution, crash-free sessions, and D7/D30 retention by observed intent. Aggregate counts only; segments under five accounts report no rate.';

COMMIT;
