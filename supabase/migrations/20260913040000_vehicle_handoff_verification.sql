-- Verified Garage handoff. A sale never reassigns the seller's vehicle row:
-- the buyer receives a new private record after proving possession of both a
-- short-lived seller code and the complete VIN.

BEGIN;

CREATE TABLE public.vehicle_handoff_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  seller_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claim_code_hash text UNIQUE
    CHECK (claim_code_hash IS NULL OR claim_code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  claimed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (
    (claimed_at IS NULL AND claimed_by_profile_id IS NULL AND claimed_vehicle_id IS NULL)
    OR
    (claimed_at IS NOT NULL AND claimed_by_profile_id IS NOT NULL AND claimed_vehicle_id IS NOT NULL)
  ),
  CHECK (
    (claimed_at IS NULL AND revoked_at IS NULL AND claim_code_hash IS NOT NULL)
    OR
    ((claimed_at IS NOT NULL OR revoked_at IS NOT NULL) AND claim_code_hash IS NULL)
  )
);

CREATE UNIQUE INDEX vehicle_handoff_claims_one_open_per_vehicle_idx
  ON public.vehicle_handoff_claims(source_vehicle_id)
  WHERE claimed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX vehicle_handoff_claims_seller_created_idx
  ON public.vehicle_handoff_claims(seller_profile_id, created_at DESC);
CREATE INDEX vehicle_handoff_claims_buyer_created_idx
  ON public.vehicle_handoff_claims(claimed_by_profile_id, created_at DESC)
  WHERE claimed_by_profile_id IS NOT NULL;

CREATE TABLE public.vehicle_handoff_claim_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_handoff_claim_attempts_profile_time_idx
  ON public.vehicle_handoff_claim_attempts(profile_id, attempted_at DESC);

ALTER TABLE public.vehicle_handoff_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_handoff_claim_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_handoff_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vehicle_handoff_claim_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_handoff_claims TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_handoff_claim_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vehicle_handoff_claim_attempts_id_seq TO service_role;

CREATE FUNCTION public.issue_vehicle_handoff_claim(
  p_vehicle_id uuid,
  p_seller_profile_id uuid,
  p_claim_code_hash text
)
RETURNS TABLE(claim_id uuid, claim_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.vehicle_handoff_claims%ROWTYPE;
BEGIN
  IF p_claim_code_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid claim code hash' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT COALESCE(public.social_profile_is_available(p_seller_profile_id), false) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1
  FROM public.vehicles vehicle
  WHERE vehicle.id = p_vehicle_id
    AND vehicle.owner_id = p_seller_profile_id
    AND vehicle.ownership_state = 'previously_owned'
    AND vehicle.sold_at IS NOT NULL
    AND vehicle.vin IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vehicle handoff unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.vehicle_handoff_claims claim
  SET revoked_at = now(),
      claim_code_hash = NULL
  WHERE claim.source_vehicle_id = p_vehicle_id
    AND claim.claimed_at IS NULL
    AND claim.revoked_at IS NULL;

  INSERT INTO public.vehicle_handoff_claims (
    source_vehicle_id,
    seller_profile_id,
    claim_code_hash,
    expires_at
  ) VALUES (
    p_vehicle_id,
    p_seller_profile_id,
    p_claim_code_hash,
    now() + interval '7 days'
  )
  RETURNING * INTO v_claim;

  RETURN QUERY SELECT v_claim.id, v_claim.expires_at;
END;
$$;

CREATE FUNCTION public.claim_vehicle_handoff(
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
    nickname
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
    NULL
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

REVOKE ALL ON FUNCTION public.issue_vehicle_handoff_claim(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_vehicle_handoff(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_vehicle_handoff_claim(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_vehicle_handoff(uuid, text, text)
  TO service_role;

COMMENT ON TABLE public.vehicle_handoff_claims IS
  'Short-lived, seller-authorized Garage claim codes. A claim creates a separate private buyer vehicle and never transfers seller-private records.';
COMMENT ON TABLE public.vehicle_handoff_claim_attempts IS
  'Service-only abuse controls for Garage handoff verification attempts; retain for no more than 30 days.';

COMMIT;
