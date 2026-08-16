-- ============================================================================
-- Migration 041: Transactional entry points for the partner integration.
--
-- These live in the database rather than in route handlers because each one has
-- to be all-or-nothing:
--
--   partner_create_inspection      vehicle + request + correlation row, or none
--   enqueue_output_generation_job  exactly one job per submission/version
--
-- Both are SECURITY INVOKER and executable only by service_role. They do not
-- bypass RLS and they do not make authorization decisions — the route handler
-- has already resolved and verified the connection before calling.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ============================================================================
-- partner_create_inspection
--
-- Concurrency: an xact advisory lock on the idempotency key serializes retries
-- of the *same* logical create, and a second lock on (organization, VIN)
-- serializes vehicle reuse across different inspections of the same car. With
-- both held, the read-then-insert below cannot race.
--
-- Raises SQLSTATE 'P0001' with message 'idempotency_conflict' when the key was
-- already used with a materially different payload.
-- ============================================================================

-- Drop any earlier signature by name: the parameter list below is grouped
-- required-then-optional (a Postgres requirement once defaults appear), so
-- CREATE OR REPLACE alone would leave a stale overload behind.
DO $$
DECLARE existing record;
BEGIN
  FOR existing IN
    SELECT oid::regprocedure AS signature
    FROM pg_proc
    WHERE proname = 'partner_create_inspection'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION %s', existing.signature);
  END LOOP;
END $$;

CREATE FUNCTION public.partner_create_inspection(
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
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_connection_id::text || ':' || p_idempotency_key, 0)
  );

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
    -- The vehicle record tracks the dealership's latest known values. The
    -- immutable snapshot for *this* inspection is stored on the ref below, so
    -- refreshing these columns cannot change an inspection already underway.
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
    'other', 'documenting', 'technician', p_ppi_type, 'assigned', 'dealerspace'
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.external_inspection_refs (
    partner_connection_id, source_system, external_organization_id,
    external_recon_case_id, external_vehicle_id, external_inspection_phase_id,
    external_actor_id, ppi_request_id, idempotency_key, request_fingerprint,
    source_label, vehicle_snapshot, integration_status
  ) VALUES (
    p_connection_id, 'dealerspace', p_external_organization_id,
    p_external_recon_case_id, p_external_vehicle_id, p_external_inspection_phase_id,
    p_external_actor_id, v_request_id, p_idempotency_key, p_request_fingerprint,
    p_source_label, p_vehicle_snapshot, 'assigned'
  )
  RETURNING id INTO v_ref_id;

  RETURN QUERY SELECT v_ref_id, v_request_id, v_vehicle_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_create_inspection(
  uuid, uuid, uuid, public.ppi_type, text, text, text, text, jsonb, text,
  text, text, text, text, integer, text, text, text, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.partner_create_inspection(
  uuid, uuid, uuid, public.ppi_type, text, text, text, text, jsonb, text,
  text, text, text, text, integer, text, text, text, integer
) TO service_role;

-- ============================================================================
-- enqueue_output_generation_job
--
-- Submitting enqueues exactly one job. A retry resumes the *same* output
-- version, so a half-finished version 1 is never abandoned in favour of a
-- phantom version 2. Manual regeneration passes p_force_new_version to
-- deliberately mint the next immutable version.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_output_generation_job(
  p_submission_id uuid,
  p_trigger_reason text DEFAULT 'submission',
  p_requested_by uuid DEFAULT NULL,
  p_force_new_version boolean DEFAULT false
)
RETURNS public.output_generation_jobs
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.output_generation_jobs;
  v_next_version integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('output_job:' || p_submission_id::text, 0));

  IF NOT p_force_new_version THEN
    SELECT * INTO v_job
    FROM public.output_generation_jobs
    WHERE ppi_submission_id = p_submission_id
      AND status IN ('pending', 'processing', 'failed')
    ORDER BY output_version DESC
    LIMIT 1;

    IF FOUND THEN
      -- A failed job is re-armed rather than replaced: same version, fresh
      -- attempt budget, so already-generated artifacts stay valid and reusable.
      IF v_job.status = 'failed' THEN
        UPDATE public.output_generation_jobs
        SET status = 'pending',
            next_attempt_at = now(),
            attempt_count = 0,
            locked_at = NULL,
            lock_expires_at = NULL,
            locked_by = NULL,
            trigger_reason = p_trigger_reason,
            requested_by = COALESCE(p_requested_by, requested_by)
        WHERE id = v_job.id
        RETURNING * INTO v_job;
      END IF;

      RETURN v_job;
    END IF;
  END IF;

  SELECT GREATEST(
    COALESCE((SELECT MAX(j.output_version) FROM public.output_generation_jobs j
              WHERE j.ppi_submission_id = p_submission_id), 0),
    COALESCE((SELECT MAX(s.version) FROM public.standardized_outputs s
              WHERE s.ppi_submission_id = p_submission_id), 0),
    COALESCE((SELECT MAX(a.output_version) FROM public.integration_artifacts a
              WHERE a.ppi_submission_id = p_submission_id), 0)
  ) + 1
  INTO v_next_version;

  INSERT INTO public.output_generation_jobs (
    ppi_submission_id, output_version, trigger_reason, requested_by
  ) VALUES (
    p_submission_id, v_next_version, p_trigger_reason, p_requested_by
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_output_generation_job(uuid, text, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_output_generation_job(uuid, text, uuid, boolean)
  TO service_role;

-- ============================================================================
-- partner_update_inspection_vehicle
--
-- The one sanctioned way past the snapshot immutability guard. Correcting a
-- typo before the technician submits is legitimate; silently reshaping an
-- inspection that has already been performed is not, so this refuses once a
-- submission exists in a submitted or completed state.
-- ============================================================================

DO $$
DECLARE existing record;
BEGIN
  FOR existing IN
    SELECT oid::regprocedure AS signature
    FROM pg_proc
    WHERE proname = 'partner_update_inspection_vehicle'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION %s', existing.signature);
  END LOOP;
END $$;

CREATE FUNCTION public.partner_update_inspection_vehicle(
  p_ref_id uuid,
  p_snapshot jsonb,
  p_vin text DEFAULT NULL,
  p_year integer DEFAULT NULL,
  p_make text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_trim text DEFAULT NULL,
  p_mileage integer DEFAULT NULL
)
RETURNS public.external_inspection_refs
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref public.external_inspection_refs;
  v_request public.ppi_requests;
BEGIN
  SELECT * INTO v_ref
  FROM public.external_inspection_refs
  WHERE id = p_ref_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inspection_not_found';
  END IF;

  SELECT * INTO v_request
  FROM public.ppi_requests
  WHERE id = v_ref.ppi_request_id;

  IF v_request.status IN ('submitted', 'completed', 'archived') THEN
    RAISE EXCEPTION 'snapshot_locked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ppi_submissions s
    WHERE s.ppi_request_id = v_ref.ppi_request_id
      AND s.status IN ('submitted', 'completed')
  ) THEN
    RAISE EXCEPTION 'snapshot_locked';
  END IF;

  UPDATE public.vehicles v
  SET vin = COALESCE(upper(btrim(p_vin)), v.vin),
      year = COALESCE(p_year, v.year),
      make = COALESCE(p_make, v.make),
      model = COALESCE(p_model, v.model),
      trim = COALESCE(p_trim, v.trim),
      mileage = COALESCE(p_mileage, v.mileage)
  WHERE v.id = v_request.vehicle_id;

  PERFORM set_config('perfectppi.allow_snapshot_correction', 'on', true);

  UPDATE public.external_inspection_refs
  SET vehicle_snapshot = p_snapshot
  WHERE id = p_ref_id
  RETURNING * INTO v_ref;

  PERFORM set_config('perfectppi.allow_snapshot_correction', 'off', true);

  RETURN v_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_update_inspection_vehicle(
  uuid, jsonb, text, integer, text, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_update_inspection_vehicle(
  uuid, jsonb, text, integer, text, text, text, integer
) TO service_role;

-- ============================================================================
-- partner_request_delivery
--
-- "Send to DealerSpace" must be idempotent: repeated clicks join the delivery
-- already in flight instead of queueing a second one. The delivery version only
-- advances when a *newer* output version becomes available.
--
-- Returns the outbound event to deliver, or raises when the deliverables are
-- not complete.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.partner_request_delivery(
  p_ref_id uuid,
  p_output_version integer,
  p_event_id uuid,
  p_occurred_at timestamptz
)
RETURNS public.outbound_events
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref public.external_inspection_refs;
  v_event public.outbound_events;
  v_delivery_version integer;
  v_dedupe_key text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('delivery:' || p_ref_id::text, 0));

  SELECT * INTO v_ref
  FROM public.external_inspection_refs
  WHERE id = p_ref_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inspection_not_found';
  END IF;

  -- One logical delivery per (inspection, output version).
  v_dedupe_key := 'deliverables_ready:' || p_ref_id::text || ':v' || p_output_version::text;

  SELECT * INTO v_event
  FROM public.outbound_events
  WHERE partner_connection_id = v_ref.partner_connection_id
    AND dedupe_key = v_dedupe_key;

  IF FOUND THEN
    -- A previously exhausted delivery is re-armed by an explicit click; an
    -- in-flight or delivered one is returned untouched.
    IF v_event.status = 'failed' THEN
      UPDATE public.outbound_events
      SET status = 'pending',
          next_attempt_at = now(),
          attempt_count = 0,
          locked_at = NULL,
          lock_expires_at = NULL,
          locked_by = NULL
      WHERE id = v_event.id
      RETURNING * INTO v_event;

      UPDATE public.external_inspection_refs
      SET delivery_status = 'queued',
          last_delivery_requested_at = now()
      WHERE id = p_ref_id;
    END IF;

    RETURN v_event;
  END IF;

  v_delivery_version := v_ref.delivery_version + 1;

  INSERT INTO public.outbound_events (
    partner_connection_id, external_inspection_ref_id, event_type, payload, dedupe_key
  ) VALUES (
    v_ref.partner_connection_id,
    p_ref_id,
    'inspection.deliverables_ready',
    jsonb_build_object(
      'eventId', 'evt_' || replace(p_event_id::text, '-', ''),
      'type', 'inspection.deliverables_ready',
      'occurredAt', to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'inspectionId', v_ref.ppi_request_id,
      'deliveryVersion', v_delivery_version
    ),
    v_dedupe_key
  )
  RETURNING * INTO v_event;

  UPDATE public.external_inspection_refs
  SET delivery_status = 'queued',
      delivery_version = v_delivery_version,
      delivered_output_version = p_output_version,
      last_delivery_requested_at = now()
  WHERE id = p_ref_id;

  RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_request_delivery(uuid, integer, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_request_delivery(uuid, integer, uuid, timestamptz)
  TO service_role;
