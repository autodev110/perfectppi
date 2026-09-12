-- Plan 25.1: marketplace discovery — saved searches with a sensible
-- notification frequency (one aggregated notice per saved search per day),
-- and a single SQL definition of what a listing filter means so the daily
-- matcher and the browse page agree.
--
-- Filter shape (jsonb, camelCase, mirrored by src/lib/marketplace/filters.ts):
--   q, make, model, minYear, maxYear, maxPrice (dollars), maxMileage,
--   transmission, drivetrain, bodyStyle, region, inspected (bool),
--   sellerType ('member' | 'technician'), sort.

BEGIN;

CREATE TABLE public.marketplace_saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  notify boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Listings created after this instant are "new" for the next notice.
  last_matched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_saved_searches_profile_idx
  ON public.marketplace_saved_searches(profile_id, created_at DESC);
ALTER TABLE public.marketplace_saved_searches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_saved_searches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_saved_searches TO service_role;

CREATE TRIGGER marketplace_saved_searches_updated_at
  BEFORE UPDATE ON public.marketplace_saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Does an active listing satisfy a filter object? Text filters are
-- case-insensitive "contains"; make is exact; region matches the listing's
-- city/region text; inspected requires the seller's own submitted/completed
-- inspection of the listed vehicle.
CREATE FUNCTION public.marketplace_listing_matches_filters(p_listing_id uuid, p_filters jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.marketplace_listings listing
    JOIN public.vehicles vehicle ON vehicle.id = listing.vehicle_id
    WHERE listing.id = p_listing_id
      AND listing.status = 'active'
      AND (
        NULLIF(btrim(p_filters->>'q'), '') IS NULL
        OR concat_ws(' ', listing.title, listing.location, vehicle.year::text, vehicle.make, vehicle.model, vehicle.trim)
           ILIKE '%' || replace(replace(replace(btrim(p_filters->>'q'), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
      AND (NULLIF(btrim(p_filters->>'make'), '') IS NULL OR lower(vehicle.make) = lower(btrim(p_filters->>'make')))
      AND (NULLIF(btrim(p_filters->>'model'), '') IS NULL OR vehicle.model ILIKE '%' || btrim(p_filters->>'model') || '%')
      AND (COALESCE(jsonb_typeof(p_filters->'minYear'), 'null') <> 'number' OR vehicle.year >= (p_filters->>'minYear')::integer)
      AND (COALESCE(jsonb_typeof(p_filters->'maxYear'), 'null') <> 'number' OR vehicle.year <= (p_filters->>'maxYear')::integer)
      AND (COALESCE(jsonb_typeof(p_filters->'maxPrice'), 'null') <> 'number' OR listing.asking_price_cents <= (p_filters->>'maxPrice')::numeric * 100)
      AND (COALESCE(jsonb_typeof(p_filters->'maxMileage'), 'null') <> 'number' OR (vehicle.mileage IS NOT NULL AND vehicle.mileage <= (p_filters->>'maxMileage')::integer))
      AND (NULLIF(btrim(p_filters->>'transmission'), '') IS NULL OR vehicle.transmission ILIKE '%' || btrim(p_filters->>'transmission') || '%')
      AND (NULLIF(btrim(p_filters->>'drivetrain'), '') IS NULL OR vehicle.drivetrain ILIKE '%' || btrim(p_filters->>'drivetrain') || '%')
      AND (NULLIF(btrim(p_filters->>'bodyStyle'), '') IS NULL OR vehicle.body_style ILIKE '%' || btrim(p_filters->>'bodyStyle') || '%')
      AND (NULLIF(btrim(p_filters->>'region'), '') IS NULL OR listing.location ILIKE '%' || btrim(p_filters->>'region') || '%')
      AND (
        COALESCE((p_filters->>'inspected')::boolean, false) = false
        OR EXISTS (
          SELECT 1 FROM public.ppi_requests request
          WHERE request.vehicle_id = vehicle.id
            AND request.requester_id = listing.seller_id
            AND request.status IN ('submitted', 'completed')
        )
      )
      AND (
        NULLIF(btrim(p_filters->>'sellerType'), '') IS NULL
        OR (p_filters->>'sellerType' = 'technician') = EXISTS (
          SELECT 1 FROM public.technician_profiles technician WHERE technician.profile_id = listing.seller_id
        )
      )
  );
$$;

CREATE FUNCTION public.list_marketplace_saved_searches(p_actor_profile_id uuid)
RETURNS SETOF public.marketplace_saved_searches
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM public.marketplace_saved_searches
  WHERE profile_id = p_actor_profile_id
  ORDER BY created_at DESC;
$$;

-- Create or rename/retune one saved search; ten per member.
CREATE FUNCTION public.upsert_marketplace_saved_search(
  p_actor_profile_id uuid,
  p_search_id uuid,
  p_name text,
  p_filters jsonb,
  p_notify boolean DEFAULT true
)
RETURNS public.marketplace_saved_searches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.marketplace_saved_searches;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_filters IS NULL OR jsonb_typeof(p_filters) <> 'object' OR p_filters = '{}'::jsonb THEN
    RAISE EXCEPTION 'saved searches need at least one filter' USING ERRCODE = 'check_violation';
  END IF;
  IF p_search_id IS NULL THEN
    IF (SELECT count(*) FROM public.marketplace_saved_searches WHERE profile_id = p_actor_profile_id) >= 10 THEN
      RAISE EXCEPTION 'saved_search_limit' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.marketplace_saved_searches (profile_id, name, filters, notify)
    VALUES (p_actor_profile_id, btrim(p_name), p_filters, COALESCE(p_notify, true))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.marketplace_saved_searches
    SET name = btrim(p_name), filters = p_filters, notify = COALESCE(p_notify, true)
    WHERE id = p_search_id AND profile_id = p_actor_profile_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'saved search unavailable' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN v_row;
END;
$$;

CREATE FUNCTION public.delete_marketplace_saved_search(p_actor_profile_id uuid, p_search_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.marketplace_saved_searches
  WHERE id = p_search_id AND profile_id = p_actor_profile_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- Daily matcher: new listings since the last check that the member may see
-- (public vehicle, available seller, no block either way) become one notice
-- per saved search; the notice links to the search, not to a seller.
CREATE FUNCTION public.notify_marketplace_saved_search_matches(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_search public.marketplace_saved_searches;
  v_count integer;
  v_first uuid;
  v_notices integer := 0;
  v_now timestamptz := now();
BEGIN
  FOR v_search IN
    SELECT * FROM public.marketplace_saved_searches
    WHERE notify
      AND last_matched_at < v_now - interval '20 hours'
    ORDER BY last_matched_at
    LIMIT GREATEST(COALESCE(p_limit, 500), 1)
  LOOP
    IF NOT public.social_profile_is_available(v_search.profile_id) THEN
      UPDATE public.marketplace_saved_searches SET last_matched_at = v_now WHERE id = v_search.id;
      CONTINUE;
    END IF;
    SELECT count(*), (array_agg(listing.id ORDER BY listing.created_at DESC))[1] INTO v_count, v_first
    FROM public.marketplace_listings listing
    JOIN public.vehicles vehicle ON vehicle.id = listing.vehicle_id
    WHERE listing.status = 'active'
      AND listing.created_at > v_search.last_matched_at
      AND listing.seller_id <> v_search.profile_id
      AND vehicle.visibility = 'public'
      AND vehicle.owner_id = listing.seller_id
      AND public.social_profile_is_available(listing.seller_id)
      AND NOT public.social_profiles_are_blocked(v_search.profile_id, listing.seller_id)
      AND public.marketplace_listing_matches_filters(listing.id, v_search.filters);
    IF v_count > 0 THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_search.profile_id,
        'saved_search_match',
        v_count || ' new listing' || CASE WHEN v_count = 1 THEN '' ELSE 's' END || ' for "' || v_search.name || '"',
        'New Marketplace listings match your saved search. Open it to see them.',
        jsonb_build_object('saved_search_id', v_search.id, 'count', v_count, 'listing_id', v_first)
      );
      v_notices := v_notices + 1;
    END IF;
    UPDATE public.marketplace_saved_searches SET last_matched_at = v_now WHERE id = v_search.id;
  END LOOP;
  RETURN v_notices;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_category(p_type public.notification_type)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_type::text
    WHEN 'friend_request' THEN 'social'
    WHEN 'friend_request_accepted' THEN 'social'
    WHEN 'post_comment' THEN 'social'
    WHEN 'post_likes' THEN 'social'
    WHEN 'post_mention' THEN 'social'
    WHEN 'answer_accepted' THEN 'social'
    WHEN 'accepted_answer_unavailable' THEN 'social'
    WHEN 'answer_helpful' THEN 'social'
    WHEN 'group_post_removed' THEN 'groups'
    WHEN 'group_role_changed' THEN 'groups'
    WHEN 'group_invitation' THEN 'groups'
    WHEN 'group_join_request' THEN 'groups'
    WHEN 'group_join_decision' THEN 'groups'
    WHEN 'message_received' THEN 'messages'
    WHEN 'listing_inspection_requested' THEN 'marketplace'
    WHEN 'saved_listing_updated' THEN 'marketplace'
    WHEN 'saved_search_match' THEN 'marketplace'
    WHEN 'tech_request_new' THEN 'inspections'
    WHEN 'tech_request_accepted' THEN 'inspections'
    WHEN 'inspection_submitted' THEN 'inspections'
    WHEN 'inspection_updated' THEN 'inspections'
    WHEN 'warranty_available' THEN 'inspections'
    WHEN 'payment_completed' THEN 'account'
    WHEN 'moderation_decision' THEN 'safety'
    WHEN 'moderation_case' THEN 'safety'
    WHEN 'report_received' THEN 'safety'
    ELSE 'account'
  END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_listing_matches_filters(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_marketplace_saved_searches(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_marketplace_saved_search(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_marketplace_saved_search(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_marketplace_saved_search_matches(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_listing_matches_filters(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_marketplace_saved_searches(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_marketplace_saved_search(uuid, uuid, text, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_marketplace_saved_search(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_marketplace_saved_search_matches(integer) TO service_role;

COMMIT;
