BEGIN;

-- The VIN-decoded factory layer is a fact about the vehicle, not about the
-- seller, so a handoff claim carries it to the buyer's Garage record (the
-- trigger accepts it because the function runs as the definer). Build
-- entries, documents, notes, and costs still never transfer.
CREATE OR REPLACE FUNCTION public.claim_vehicle_handoff(
  p_buyer_profile_id uuid,
  p_claim_code_hash text,
  p_vin text
)
RETURNS TABLE(outcome text, vehicle_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.vehicle_handoff_claims%ROWTYPE;
  v_source public.vehicles%ROWTYPE;
  v_vehicle public.vehicles%ROWTYPE;
  v_vin text := upper(btrim(p_vin));
BEGIN
  IF NOT COALESCE(public.social_profile_is_available(p_buyer_profile_id), false) THEN
    RETURN QUERY SELECT 'profile_unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.vehicle_handoff_claim_attempts(profile_id)
  VALUES (p_buyer_profile_id);

  IF (
    SELECT count(*)
    FROM public.vehicle_handoff_claim_attempts attempt
    WHERE attempt.profile_id = p_buyer_profile_id
      AND attempt.attempted_at > now() - interval '1 hour'
  ) > 10 THEN
    RETURN QUERY SELECT 'rate_limited'::text, NULL::uuid;
    RETURN;
  END IF;

  IF p_claim_code_hash !~ '^[0-9a-f]{64}$' OR v_vin !~ '^[A-HJ-NPR-Z0-9]{17}$' THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_claim
  FROM public.vehicle_handoff_claims claim
  WHERE claim.claim_code_hash = p_claim_code_hash
    AND claim.claimed_at IS NULL
    AND claim.revoked_at IS NULL
    AND claim.expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_claim.seller_profile_id = p_buyer_profile_id THEN
    RETURN QUERY SELECT 'same_owner'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_source
  FROM public.vehicles vehicle
  WHERE vehicle.id = v_claim.source_vehicle_id
    AND vehicle.owner_id = v_claim.seller_profile_id
    AND vehicle.ownership_state = 'previously_owned'
    AND vehicle.sold_at IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND OR v_source.vin IS NULL OR upper(btrim(v_source.vin)) <> v_vin THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vehicles vehicle
    WHERE vehicle.owner_id = p_buyer_profile_id
      AND upper(btrim(vehicle.vin)) = v_vin
  ) THEN
    RETURN QUERY SELECT 'duplicate_vin'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.vehicles (
    owner_id,
    vin,
    year,
    make,
    model,
    trim,
    engine,
    drivetrain,
    transmission,
    body_style,
    configuration_type,
    engine_original,
    transmission_original,
    drivetrain_original,
    ownership_state,
    visibility,
    mileage,
    mileage_status,
    mileage_updated_at,
    nickname,
    factory_spec,
    factory_spec_decoded_at
  ) VALUES (
    p_buyer_profile_id,
    v_vin,
    v_source.year,
    v_source.make,
    v_source.model,
    v_source.trim,
    v_source.engine,
    v_source.drivetrain,
    v_source.transmission,
    v_source.body_style,
    v_source.configuration_type,
    v_source.engine_original,
    v_source.transmission_original,
    v_source.drivetrain_original,
    'owned',
    'private',
    NULL,
    'unknown',
    NULL,
    NULL,
    v_source.factory_spec,
    v_source.factory_spec_decoded_at
  )
  RETURNING * INTO v_vehicle;

  UPDATE public.vehicle_handoff_claims claim
  SET claimed_by_profile_id = p_buyer_profile_id,
      claimed_vehicle_id = v_vehicle.id,
      claimed_at = now(),
      claim_code_hash = NULL
  WHERE claim.id = v_claim.id;

  RETURN QUERY SELECT 'success'::text, v_vehicle.id;
END;
$$;

COMMIT;
