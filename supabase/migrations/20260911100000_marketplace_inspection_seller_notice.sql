-- Audit follow-up to 20260911090000: a buyer-requested inspection needs the
-- seller's cooperation (the technician has to reach the car), so the seller is
-- told the moment a request is created (plan 22.1 "inspection/request
-- activity relevant to the user"). The notice is neutral: it names the listing
-- and not the buyer; the technician coordinates access.

-- New enum values must be visible before a function body runs; adding them
-- outside the transaction keeps this file safe under either runner.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'listing_inspection_requested';

BEGIN;

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

  -- One notice per created request; the idempotent branch above never
  -- reaches this point, so a retried tap cannot repeat it.
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_listing.seller_id,
    'listing_inspection_requested',
    'Inspection requested on your listing',
    'A buyer requested an independent ' ||
      CASE p_scope WHEN 'dents_tires' THEN 'Dents & Tires' ELSE 'complete' END ||
      ' inspection of "' || v_listing.title || '". A PerfectPPI technician will coordinate access with you.',
    jsonb_build_object(
      'listing_id', p_listing_id,
      'vehicle_id', v_listing.vehicle_id,
      'request_id', v_request.id,
      'scope', p_scope
    )
  );

  RETURN QUERY SELECT v_request.id, v_request.status, true;
END;
$$;

REVOKE ALL ON FUNCTION public.request_marketplace_inspection(uuid, uuid, public.inspection_scope)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_marketplace_inspection(uuid, uuid, public.inspection_scope)
  TO service_role;

COMMIT;
