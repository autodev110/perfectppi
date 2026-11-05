-- ============================================================================
-- Migration: ShopOwl as a second partner system, and the browser connect path.
--
-- 1. Widens every source_system CHECK so a connection, its codes, its references
--    and the requests it creates can belong to ShopOwl as well as DealerSpace.
-- 2. Adds code_challenge to installation codes. A manual code is typed by a
--    person and has no challenge. A browser-connect code travels through a URL,
--    so it is bound (PKCE S256) to the backend that started the flow and cannot
--    be redeemed by anything that merely observes it.
-- 3. partner_create_inspection reads the source system from the connection, so
--    the value cannot disagree with the credential that authorized the call.
--
-- Additive and safe to apply before the application that uses it: the function
-- keeps its signature, and DealerSpace behaviour is unchanged.
-- ============================================================================

ALTER TABLE public.partner_installation_codes
  DROP CONSTRAINT IF EXISTS partner_installation_codes_source_check;
ALTER TABLE public.partner_installation_codes
  ADD CONSTRAINT partner_installation_codes_source_check
  CHECK (source_system IN ('dealerspace', 'shopowl'));

ALTER TABLE public.partner_connections
  DROP CONSTRAINT IF EXISTS partner_connections_source_check;
ALTER TABLE public.partner_connections
  ADD CONSTRAINT partner_connections_source_check
  CHECK (source_system IN ('dealerspace', 'shopowl'));

ALTER TABLE public.external_inspection_refs
  DROP CONSTRAINT IF EXISTS external_inspection_refs_source_check;
ALTER TABLE public.external_inspection_refs
  ADD CONSTRAINT external_inspection_refs_source_check
  CHECK (source_system IN ('dealerspace', 'shopowl'));

ALTER TABLE public.ppi_requests
  DROP CONSTRAINT IF EXISTS ppi_requests_source_system_check;
ALTER TABLE public.ppi_requests
  ADD CONSTRAINT ppi_requests_source_system_check
  CHECK (source_system IN ('perfectppi', 'dealerspace', 'shopowl'));

ALTER TABLE public.partner_installation_codes
  ADD COLUMN IF NOT EXISTS code_challenge text;
ALTER TABLE public.partner_installation_codes
  DROP CONSTRAINT IF EXISTS partner_installation_codes_challenge_check;
ALTER TABLE public.partner_installation_codes
  ADD CONSTRAINT partner_installation_codes_challenge_check
  CHECK (code_challenge IS NULL OR code_challenge ~ '^[A-Za-z0-9_-]{43}$');

COMMENT ON COLUMN public.partner_installation_codes.code_challenge IS
  'base64url(sha256(verifier)) for a browser-delivered code; NULL for a manually typed code.';

-- Same signature and behaviour as migration 041, except for where the source
-- system comes from.
CREATE OR REPLACE FUNCTION public.partner_create_inspection(
  p_connection_id uuid,
  p_organization_id uuid,
  p_assigned_profile_id uuid,
  p_ppi_type public.ppi_type,
  p_external_organization_id text,
  p_external_actor_id text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_vehicle_snapshot jsonb,
  p_vin text,
  p_external_recon_case_id text DEFAULT NULL,
  p_external_vehicle_id text DEFAULT NULL,
  p_external_inspection_phase_id text DEFAULT NULL,
  p_source_label text DEFAULT NULL,
  p_year integer DEFAULT NULL,
  p_make text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_trim text DEFAULT NULL,
  p_mileage integer DEFAULT NULL
)
RETURNS TABLE (
  ref_id uuid,
  request_id uuid,
  vehicle_id uuid,
  was_created boolean
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.external_inspection_refs;
  v_vehicle_id uuid;
  v_request_id uuid;
  v_ref_id uuid;
  v_norm_vin text := upper(btrim(p_vin));
  v_source_system text;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_connection_id::text || ':' || p_idempotency_key, 0)
  );

  SELECT c.source_system INTO v_source_system
  FROM public.partner_connections c
  WHERE c.id = p_connection_id;

  IF v_source_system IS NULL THEN
    RAISE EXCEPTION 'partner_connection_not_found';
  END IF;

  SELECT * INTO v_existing
  FROM public.external_inspection_refs
  WHERE partner_connection_id = p_connection_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;

    RETURN QUERY
      SELECT v_existing.id,
             v_existing.ppi_request_id,
             (SELECT r.vehicle_id FROM public.ppi_requests r WHERE r.id = v_existing.ppi_request_id),
             false;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':vin:' || v_norm_vin, 0)
  );

  SELECT v.id INTO v_vehicle_id
  FROM public.vehicles v
  WHERE v.organization_id = p_organization_id
    AND upper(btrim(v.vin)) = v_norm_vin
  LIMIT 1;

  IF v_vehicle_id IS NULL THEN
    INSERT INTO public.vehicles (
      organization_id, vin, year, make, model, trim, mileage, visibility
    ) VALUES (
      p_organization_id, v_norm_vin, p_year, p_make, p_model, p_trim, p_mileage, 'private'
    )
    RETURNING id INTO v_vehicle_id;
  ELSE
    -- The vehicle record tracks the shop's latest known values. The immutable
    -- snapshot for *this* inspection is stored on the ref below, so refreshing
    -- these columns cannot change an inspection already underway.
    UPDATE public.vehicles v
    SET year = COALESCE(p_year, v.year),
        make = COALESCE(p_make, v.make),
        model = COALESCE(p_model, v.model),
        trim = COALESCE(p_trim, v.trim),
        mileage = COALESCE(p_mileage, v.mileage)
    WHERE v.id = v_vehicle_id;
  END IF;

  INSERT INTO public.ppi_requests (
    vehicle_id, requesting_organization_id, assigned_tech_id,
    whose_car, requester_role, performer_type, ppi_type, status, source_system
  ) VALUES (
    v_vehicle_id, p_organization_id, p_assigned_profile_id,
    'other', 'documenting', 'technician', p_ppi_type, 'assigned', v_source_system
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.external_inspection_refs (
    partner_connection_id, source_system, external_organization_id,
    external_recon_case_id, external_vehicle_id, external_inspection_phase_id,
    external_actor_id, ppi_request_id, idempotency_key, request_fingerprint,
    source_label, vehicle_snapshot, integration_status
  ) VALUES (
    p_connection_id, v_source_system, p_external_organization_id,
    p_external_recon_case_id, p_external_vehicle_id, p_external_inspection_phase_id,
    p_external_actor_id, v_request_id, p_idempotency_key, p_request_fingerprint,
    p_source_label, p_vehicle_snapshot, 'assigned'
  )
  RETURNING id INTO v_ref_id;

  RETURN QUERY SELECT v_ref_id, v_request_id, v_vehicle_id, true;
END;
$$;
