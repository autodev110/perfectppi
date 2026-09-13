-- Plan 33: bounded, stable Marketplace browse pagination across every
-- supported filter and sort. Legacy array/offset responses remain available.

BEGIN;

CREATE INDEX IF NOT EXISTS marketplace_listings_public_created_cursor_idx
  ON public.marketplace_listings(created_at, id)
  WHERE status IN ('active', 'pending');
CREATE INDEX IF NOT EXISTS marketplace_listings_public_price_cursor_idx
  ON public.marketplace_listings(asking_price_cents, id)
  WHERE status IN ('active', 'pending');
CREATE INDEX IF NOT EXISTS vehicles_public_mileage_cursor_idx
  ON public.vehicles(mileage, id)
  WHERE visibility = 'public';

CREATE FUNCTION public.list_marketplace_listing_ids_cursor(
  p_viewer_id uuid,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_sort text DEFAULT 'newest',
  p_limit integer DEFAULT 24,
  p_before_numeric numeric DEFAULT NULL,
  p_before_timestamp timestamptz DEFAULT NULL,
  p_before_listing_id uuid DEFAULT NULL
)
RETURNS TABLE(
  listing_id uuid,
  sort_numeric numeric,
  sort_timestamp timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_filters IS NULL OR jsonb_typeof(p_filters) <> 'object'
     OR p_sort NOT IN ('newest', 'oldest', 'price_asc', 'price_desc', 'mileage_asc', 'recently_inspected')
     OR (
       p_before_listing_id IS NULL
       AND num_nonnulls(p_before_numeric, p_before_timestamp) <> 0
     )
     OR (
       p_before_listing_id IS NOT NULL
       AND (
         (p_sort IN ('price_asc', 'price_desc', 'mileage_asc')
           AND (p_before_numeric IS NULL OR p_before_timestamp IS NOT NULL))
         OR (p_sort IN ('newest', 'oldest', 'recently_inspected')
           AND (p_before_timestamp IS NULL OR p_before_numeric IS NOT NULL))
       )
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT listing.id,
           listing.created_at,
           listing.asking_price_cents::numeric AS price,
           COALESCE(vehicle.mileage, 2147483647)::numeric AS mileage,
           COALESCE(inspection.inspected_at, '0001-01-01 00:00:00+00'::timestamptz) AS inspected_at
    FROM public.marketplace_listings listing
    JOIN public.vehicles vehicle ON vehicle.id = listing.vehicle_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(submission.completed_at, submission.submitted_at) AS inspected_at
      FROM public.ppi_requests request
      JOIN public.ppi_submissions submission ON submission.ppi_request_id = request.id
      WHERE request.id = listing.attached_inspection_id
        AND request.vehicle_id = listing.vehicle_id
        AND request.requester_id = listing.seller_id
        AND request.status IN ('submitted', 'completed')
        AND submission.is_current
        AND submission.status IN ('submitted', 'completed')
      ORDER BY COALESCE(submission.completed_at, submission.submitted_at) DESC, submission.id DESC
      LIMIT 1
    ) inspection ON true
    WHERE public.marketplace_listing_is_public(listing.status)
      AND vehicle.visibility = 'public'
      AND vehicle.owner_id = listing.seller_id
      AND public.social_profile_is_available(listing.seller_id)
      AND (p_viewer_id IS NULL OR NOT public.social_profiles_are_blocked(p_viewer_id, listing.seller_id))
      AND (
        NULLIF(btrim(p_filters->>'q'), '') IS NULL
        OR strpos(
          lower(concat_ws(' ', listing.title, listing.location, vehicle.year::text, vehicle.make, vehicle.model, vehicle.trim)),
          lower(btrim(p_filters->>'q'))
        ) > 0
      )
      AND (NULLIF(btrim(p_filters->>'make'), '') IS NULL OR lower(vehicle.make) = lower(btrim(p_filters->>'make')))
      AND (NULLIF(btrim(p_filters->>'model'), '') IS NULL OR strpos(lower(vehicle.model), lower(btrim(p_filters->>'model'))) > 0)
      AND (COALESCE(jsonb_typeof(p_filters->'minYear'), 'null') <> 'number' OR vehicle.year >= (p_filters->>'minYear')::integer)
      AND (COALESCE(jsonb_typeof(p_filters->'maxYear'), 'null') <> 'number' OR vehicle.year <= (p_filters->>'maxYear')::integer)
      AND (COALESCE(jsonb_typeof(p_filters->'maxPrice'), 'null') <> 'number' OR listing.asking_price_cents <= (p_filters->>'maxPrice')::numeric * 100)
      AND (COALESCE(jsonb_typeof(p_filters->'maxMileage'), 'null') <> 'number' OR (vehicle.mileage IS NOT NULL AND vehicle.mileage <= (p_filters->>'maxMileage')::integer))
      AND (NULLIF(btrim(p_filters->>'transmission'), '') IS NULL OR strpos(lower(COALESCE(vehicle.transmission, '')), lower(btrim(p_filters->>'transmission'))) > 0)
      AND (NULLIF(btrim(p_filters->>'drivetrain'), '') IS NULL OR strpos(lower(COALESCE(vehicle.drivetrain, '')), lower(btrim(p_filters->>'drivetrain'))) > 0)
      AND (NULLIF(btrim(p_filters->>'bodyStyle'), '') IS NULL OR strpos(lower(COALESCE(vehicle.body_style, '')), lower(btrim(p_filters->>'bodyStyle'))) > 0)
      AND (NULLIF(btrim(p_filters->>'region'), '') IS NULL OR strpos(lower(COALESCE(listing.location, '')), lower(btrim(p_filters->>'region'))) > 0)
      AND (COALESCE((p_filters->>'inspected')::boolean, false) = false OR inspection.inspected_at IS NOT NULL)
      AND (
        NULLIF(btrim(p_filters->>'sellerType'), '') IS NULL
        OR (p_filters->>'sellerType' = 'technician') = EXISTS (
          SELECT 1 FROM public.technician_profiles technician
          WHERE technician.profile_id = listing.seller_id
        )
      )
  ), ranked AS (
    SELECT candidates.*,
           count(*) OVER ()::bigint AS candidate_count,
           CASE p_sort
             WHEN 'price_asc' THEN candidates.price
             WHEN 'price_desc' THEN candidates.price
             WHEN 'mileage_asc' THEN candidates.mileage
             ELSE NULL
           END AS numeric_value,
           CASE p_sort
             WHEN 'newest' THEN candidates.created_at
             WHEN 'oldest' THEN candidates.created_at
             WHEN 'recently_inspected' THEN candidates.inspected_at
             ELSE NULL
           END AS timestamp_value
    FROM candidates
  )
  SELECT ranked.id, ranked.numeric_value, ranked.timestamp_value, ranked.candidate_count
  FROM ranked
  WHERE p_before_listing_id IS NULL
     OR CASE p_sort
       WHEN 'newest' THEN (ranked.timestamp_value, ranked.id) < (p_before_timestamp, p_before_listing_id)
       WHEN 'oldest' THEN (ranked.timestamp_value, ranked.id) > (p_before_timestamp, p_before_listing_id)
       WHEN 'price_asc' THEN (ranked.numeric_value, ranked.id) > (p_before_numeric, p_before_listing_id)
       WHEN 'price_desc' THEN (ranked.numeric_value, ranked.id) < (p_before_numeric, p_before_listing_id)
       WHEN 'mileage_asc' THEN (ranked.numeric_value, ranked.id) > (p_before_numeric, p_before_listing_id)
       WHEN 'recently_inspected' THEN (ranked.timestamp_value, ranked.id) < (p_before_timestamp, p_before_listing_id)
       ELSE false
     END
  ORDER BY
    CASE WHEN p_sort IN ('newest', 'recently_inspected') THEN ranked.timestamp_value END DESC,
    CASE WHEN p_sort = 'oldest' THEN ranked.timestamp_value END,
    CASE WHEN p_sort IN ('price_asc', 'mileage_asc') THEN ranked.numeric_value END,
    CASE WHEN p_sort = 'price_desc' THEN ranked.numeric_value END DESC,
    CASE WHEN p_sort IN ('newest', 'price_desc', 'recently_inspected') THEN ranked.id END DESC,
    CASE WHEN p_sort IN ('oldest', 'price_asc', 'mileage_asc') THEN ranked.id END
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.list_marketplace_listing_ids_cursor(uuid, jsonb, text, integer, numeric, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_marketplace_listing_ids_cursor(uuid, jsonb, text, integer, numeric, timestamptz, uuid)
  TO service_role;

COMMENT ON FUNCTION public.list_marketplace_listing_ids_cursor(uuid, jsonb, text, integer, numeric, timestamptz, uuid) IS
  'Service-only stable keyset for visible Marketplace browse results; callers must bind cursors to filters and sort.';

COMMIT;
