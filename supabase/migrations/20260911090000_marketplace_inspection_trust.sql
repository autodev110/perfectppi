BEGIN;

-- Tie buyer-requested inspections to the listing that prompted them. The
-- listing may later be deleted, but the inspection itself remains intact.
ALTER TABLE public.ppi_requests
  ADD COLUMN IF NOT EXISTS marketplace_listing_id uuid
    REFERENCES public.marketplace_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ppi_requests_marketplace_listing_id_idx
  ON public.ppi_requests(marketplace_listing_id)
  WHERE marketplace_listing_id IS NOT NULL;

-- Repeated taps and concurrent app retries must resolve to the same active
-- request rather than creating multiple technician jobs.
CREATE UNIQUE INDEX IF NOT EXISTS ppi_requests_one_open_per_requester_listing_idx
  ON public.ppi_requests(requester_id, marketplace_listing_id)
  WHERE marketplace_listing_id IS NOT NULL
    AND status NOT IN ('completed'::public.ppi_request_status, 'archived'::public.ppi_request_status);

-- Public vehicle/listing reads must go through the narrow application DTO.
-- RLS cannot redact a VIN column from an otherwise-readable vehicle row.
DROP POLICY IF EXISTS vehicles_select_public ON public.vehicles;
DROP POLICY IF EXISTS listings_select_active ON public.marketplace_listings;

DROP POLICY IF EXISTS vehicles_select_inspection_requester ON public.vehicles;
CREATE POLICY vehicles_select_inspection_requester
  ON public.vehicles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ppi_requests request_row
      WHERE request_row.vehicle_id = vehicles.id
        AND request_row.requester_id = public.get_my_profile_id()
    )
  );

CREATE OR REPLACE FUNCTION public.marketplace_visible_listing_ids(
  p_viewer_id uuid,
  p_listing_ids uuid[]
)
RETURNS TABLE (listing_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT listing_row.id
  FROM public.marketplace_listings listing_row
  JOIN public.vehicles vehicle_row ON vehicle_row.id = listing_row.vehicle_id
  WHERE listing_row.id = ANY(COALESCE(p_listing_ids, ARRAY[]::uuid[]))
    AND listing_row.status = 'active'::public.listing_status
    AND vehicle_row.visibility = 'public'::public.vehicle_visibility
    AND vehicle_row.owner_id = listing_row.seller_id
    AND public.social_profile_is_available(listing_row.seller_id)
    AND (
      p_viewer_id IS NULL
      OR NOT public.social_profiles_are_blocked(p_viewer_id, listing_row.seller_id)
    );
$$;

REVOKE ALL ON FUNCTION public.marketplace_visible_listing_ids(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_visible_listing_ids(uuid, uuid[])
  TO service_role;

-- The listing link is tenancy data just like requester and vehicle. Ordinary
-- clients may advance request status, but may not repoint the request.
CREATE OR REPLACE FUNCTION public.guard_ppi_request_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.requesting_organization_id IS DISTINCT FROM OLD.requesting_organization_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.source_system IS DISTINCT FROM OLD.source_system
     OR (
       NEW.marketplace_listing_id IS DISTINCT FROM OLD.marketplace_listing_id
       AND NOT (
         OLD.marketplace_listing_id IS NOT NULL
         AND NEW.marketplace_listing_id IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.marketplace_listings listing_row
           WHERE listing_row.id = OLD.marketplace_listing_id
         )
       )
     )
  THEN
    RAISE EXCEPTION 'ppi_requests ownership columns are immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_marketplace_inspection(
  p_requester_id uuid,
  p_listing_id uuid,
  p_scope public.inspection_scope DEFAULT 'complete'
)
RETURNS TABLE (
  request_id uuid,
  request_status public.ppi_request_status,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_listing public.marketplace_listings%ROWTYPE;
  v_vehicle public.vehicles%ROWTYPE;
  v_request public.ppi_requests%ROWTYPE;
BEGIN
  IF p_requester_id IS NULL OR NOT public.social_profile_is_available(p_requester_id) THEN
    RAISE EXCEPTION 'Requester is not eligible to request an inspection'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT listing_row.*
  INTO v_listing
  FROM public.marketplace_listings listing_row
  WHERE listing_row.id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND OR v_listing.status <> 'active'::public.listing_status THEN
    RAISE EXCEPTION 'Listing is not available'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT vehicle_row.*
  INTO v_vehicle
  FROM public.vehicles vehicle_row
  WHERE vehicle_row.id = v_listing.vehicle_id;

  IF NOT FOUND
     OR v_vehicle.visibility <> 'public'::public.vehicle_visibility
     OR v_vehicle.owner_id <> v_listing.seller_id THEN
    RAISE EXCEPTION 'Listing is not available'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.social_profile_is_available(v_listing.seller_id) THEN
    RAISE EXCEPTION 'Listing is not available'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_listing.seller_id = p_requester_id THEN
    RAISE EXCEPTION 'You cannot request an inspection on your own listing'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.social_profiles_are_blocked(p_requester_id, v_listing.seller_id) THEN
    RAISE EXCEPTION 'Listing is not available'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT request_row.*
  INTO v_request
  FROM public.ppi_requests request_row
  WHERE request_row.requester_id = p_requester_id
    AND request_row.marketplace_listing_id = p_listing_id
    AND request_row.status NOT IN (
      'completed'::public.ppi_request_status,
      'archived'::public.ppi_request_status
    )
  ORDER BY request_row.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_request.id, v_request.status, false;
    RETURN;
  END IF;

  INSERT INTO public.ppi_requests (
    vehicle_id,
    requester_id,
    marketplace_listing_id,
    whose_car,
    requester_role,
    performer_type,
    ppi_type,
    status,
    inspection_scope,
    source_system
  ) VALUES (
    v_listing.vehicle_id,
    p_requester_id,
    p_listing_id,
    'other',
    'buying',
    'technician',
    'general_tech',
    'pending_assignment',
    p_scope,
    'perfectppi'
  )
  RETURNING * INTO v_request;

  RETURN QUERY SELECT v_request.id, v_request.status, true;
END;
$$;

REVOKE ALL ON FUNCTION public.request_marketplace_inspection(uuid, uuid, public.inspection_scope)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_marketplace_inspection(uuid, uuid, public.inspection_scope)
  TO service_role;

COMMIT;
