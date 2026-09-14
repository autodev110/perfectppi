BEGIN;

-- ============================================================================
-- Renditions doc KPIs: search, network activation, invite conversion,
-- vehicle-profile accuracy, custom-build adoption (retention already exists).
-- Same rules as the rest of product analytics: closed allowlist of event
-- names, no content or identifiers, 90-day expiry, opt-out aware.
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
    'factory_spec_recorded', 'factory_conflict_refused', 'custom_build_declared', 'build_stage_created'
  ));

CREATE OR REPLACE FUNCTION public.get_growth_accuracy_kpis(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH bounds AS (
    SELECT now() - make_interval(days => LEAST(GREATEST(p_days, 1), 90)) AS starts_at
  ),
  events AS (
    SELECT event_name, profile_id
    FROM public.product_analytics_events, bounds
    WHERE occurred_at >= bounds.starts_at
  ),
  counted AS (
    SELECT event_name, count(*)::integer AS event_count, count(DISTINCT profile_id)::integer AS user_count
    FROM events
    GROUP BY event_name
  ),
  c AS (
    SELECT
      COALESCE((SELECT event_count FROM counted WHERE event_name = 'search_performed'), 0) AS searches,
      COALESCE((SELECT user_count FROM counted WHERE event_name = 'search_performed'), 0) AS searchers,
      COALESCE((SELECT event_count FROM counted WHERE event_name = 'contact_match_found'), 0) AS contact_matches,
      COALESCE((SELECT user_count FROM counted WHERE event_name = 'contact_match_found'), 0) AS contact_matchers,
      COALESCE((SELECT event_count FROM counted WHERE event_name = 'invite_shared'), 0) AS invites_shared,
      COALESCE((SELECT user_count FROM counted WHERE event_name = 'invite_shared'), 0) AS inviters,
      COALESCE((SELECT event_count FROM counted WHERE event_name = 'signup_from_invite'), 0) AS invite_signups,
      COALESCE((SELECT event_count FROM counted WHERE event_name = 'factory_spec_recorded'), 0) AS factory_specs_recorded,
      COALESCE((SELECT event_count FROM counted WHERE event_name = 'factory_conflict_refused'), 0) AS factory_conflicts_refused,
      COALESCE((SELECT user_count FROM counted WHERE event_name = 'factory_conflict_refused'), 0) AS factory_conflict_members,
      COALESCE((SELECT event_count FROM counted WHERE event_name = 'custom_build_declared'), 0) AS custom_builds_declared,
      COALESCE((SELECT event_count FROM counted WHERE event_name = 'build_stage_created'), 0) AS build_stages_created,
      COALESCE((SELECT user_count FROM counted WHERE event_name = 'build_stage_created'), 0) AS build_stage_members
  ),
  -- Accuracy of the Garage as it stands (not windowed): how many vehicles
  -- with a VIN carry a factory record, and how many declare a modified or
  -- custom configuration.
  garage AS (
    SELECT
      count(*) FILTER (WHERE vin IS NOT NULL)::integer AS vehicles_with_vin,
      count(*) FILTER (WHERE factory_spec IS NOT NULL)::integer AS vehicles_with_factory_spec,
      count(*) FILTER (WHERE configuration_type = 'custom_build')::integer AS custom_build_vehicles,
      count(*) FILTER (WHERE configuration_type = 'modified')::integer AS modified_vehicles,
      count(*)::integer AS vehicles
    FROM public.vehicles
  ),
  staged AS (
    SELECT count(DISTINCT vehicle_id)::integer AS vehicles_with_stages FROM public.vehicle_build_stages
  ),
  friend_activation AS (
    -- Members who accepted a friend request within 7 days of a contact match.
    SELECT count(DISTINCT m.profile_id)::integer AS activated
    FROM public.product_analytics_events m
    JOIN bounds ON true
    WHERE m.event_name = 'contact_match_found'
      AND m.occurred_at >= bounds.starts_at
      AND EXISTS (
        SELECT 1 FROM public.friend_relationships fr
        WHERE fr.status = 'friends'
          AND (fr.profile_low_id = m.profile_id OR fr.profile_high_id = m.profile_id)
          AND fr.responded_at >= m.occurred_at
          AND fr.responded_at < m.occurred_at + interval '7 days'
      )
  )
  SELECT jsonb_build_object(
    'windowDays', LEAST(GREATEST(p_days, 1), 90),
    'search', jsonb_build_object('searches', c.searches, 'searchers', c.searchers),
    'network', jsonb_build_object(
      'contactMatches', c.contact_matches, 'membersWithContactMatches', c.contact_matchers,
      'activatedAfterContactMatch', friend_activation.activated,
      'activationRatePercent', CASE WHEN c.contact_matchers > 0 THEN round(friend_activation.activated * 100.0 / c.contact_matchers) ELSE 0 END
    ),
    'invites', jsonb_build_object(
      'shared', c.invites_shared, 'inviters', c.inviters, 'signups', c.invite_signups,
      'conversionRatePercent', CASE WHEN c.invites_shared > 0 THEN round(c.invite_signups * 100.0 / c.invites_shared) ELSE 0 END
    ),
    'accuracy', jsonb_build_object(
      'vehicles', garage.vehicles, 'vehiclesWithVin', garage.vehicles_with_vin, 'vehiclesWithFactorySpec', garage.vehicles_with_factory_spec,
      'factoryCoveragePercent', CASE WHEN garage.vehicles_with_vin > 0 THEN round(garage.vehicles_with_factory_spec * 100.0 / garage.vehicles_with_vin) ELSE 0 END,
      'factorySpecsRecorded', c.factory_specs_recorded, 'factoryConflictsRefused', c.factory_conflicts_refused, 'membersWithRefusedConflicts', c.factory_conflict_members
    ),
    'customBuilds', jsonb_build_object(
      'declared', c.custom_builds_declared, 'customBuildVehicles', garage.custom_build_vehicles, 'modifiedVehicles', garage.modified_vehicles,
      'stagesCreated', c.build_stages_created, 'membersCreatingStages', c.build_stage_members, 'vehiclesWithStages', staged.vehicles_with_stages
    )
  )
  FROM c, garage, staged, friend_activation;
$$;

REVOKE ALL ON FUNCTION public.get_growth_accuracy_kpis(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_growth_accuracy_kpis(integer) TO service_role;

COMMENT ON FUNCTION public.get_growth_accuracy_kpis(integer) IS
  'Service-only aggregate Renditions-doc KPIs (search, network activation, invite conversion, vehicle-profile accuracy, custom-build adoption). Counts and rates only.';

COMMIT;
