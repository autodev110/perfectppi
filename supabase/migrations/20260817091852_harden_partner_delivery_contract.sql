-- Treat (submission_id, output_version) as the immutable deliverable identity.
-- Output versions restart for each submission, so output_version alone cannot
-- distinguish a revision from the original inspection report.

ALTER TABLE public.external_inspection_refs
  ADD COLUMN delivered_submission_id uuid
  REFERENCES public.ppi_submissions(id) ON DELETE SET NULL;

UPDATE public.external_inspection_refs
SET delivered_submission_id = current_submission_id
WHERE delivered_output_version IS NOT NULL
  AND delivered_submission_id IS NULL;

ALTER TABLE public.external_inspection_refs
  ADD CONSTRAINT external_inspection_refs_delivery_target_check
  CHECK (
    (delivery_version = 0
      AND delivered_submission_id IS NULL
      AND delivered_output_version IS NULL)
    OR
    (delivery_version > 0
      AND delivered_submission_id IS NOT NULL
      AND delivered_output_version IS NOT NULL
      AND delivered_output_version > 0)
  );

DROP FUNCTION IF EXISTS public.partner_request_delivery(
  uuid, integer, uuid, timestamptz
);

CREATE FUNCTION public.partner_request_delivery(
  p_ref_id uuid,
  p_submission_id uuid,
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
  IF p_output_version < 1 THEN
    RAISE EXCEPTION 'deliverables_not_ready';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('delivery:' || p_ref_id::text, 0));

  SELECT * INTO v_ref
  FROM public.external_inspection_refs
  WHERE id = p_ref_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inspection_not_found';
  END IF;

  IF v_ref.current_submission_id IS DISTINCT FROM p_submission_id THEN
    RAISE EXCEPTION 'submission_not_current';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.integration_artifacts AS artifact
    WHERE artifact.external_inspection_ref_id = p_ref_id
      AND artifact.ppi_submission_id = p_submission_id
      AND artifact.output_version = p_output_version
    GROUP BY artifact.ppi_submission_id, artifact.output_version
    HAVING COUNT(DISTINCT artifact.artifact_type) FILTER (
      WHERE artifact.artifact_type IN (
        'inspection_report_json',
        'inspection_report_pdf',
        'vsc_determination_json',
        'vsc_determination_pdf'
      )
    ) = 4
  ) THEN
    RAISE EXCEPTION 'deliverables_not_ready';
  END IF;

  v_dedupe_key := 'deliverables_ready:' || p_ref_id::text
    || ':submission:' || p_submission_id::text
    || ':v' || p_output_version::text;

  SELECT * INTO v_event
  FROM public.outbound_events
  WHERE partner_connection_id = v_ref.partner_connection_id
    AND dedupe_key = v_dedupe_key;

  IF FOUND THEN
    IF v_event.status = 'failed' THEN
      UPDATE public.outbound_events
      SET status = 'pending',
          next_attempt_at = now(),
          attempt_count = 0,
          locked_at = NULL,
          lock_expires_at = NULL,
          locked_by = NULL,
          last_error = NULL
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
    partner_connection_id,
    external_inspection_ref_id,
    event_type,
    payload,
    dedupe_key
  ) VALUES (
    v_ref.partner_connection_id,
    p_ref_id,
    'inspection.deliverables_ready',
    jsonb_build_object(
      'eventId', 'evt_' || replace(p_event_id::text, '-', ''),
      'type', 'inspection.deliverables_ready',
      'occurredAt', to_char(
        p_occurred_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"'
      ),
      'inspectionId', v_ref.ppi_request_id,
      'deliveryVersion', v_delivery_version,
      'submissionId', p_submission_id,
      'outputVersion', p_output_version
    ),
    v_dedupe_key
  )
  RETURNING * INTO v_event;

  UPDATE public.external_inspection_refs
  SET delivery_status = 'queued',
      delivery_version = v_delivery_version,
      delivered_submission_id = p_submission_id,
      delivered_output_version = p_output_version,
      last_delivery_requested_at = now(),
      last_error = NULL
  WHERE id = p_ref_id;

  RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_request_delivery(
  uuid, uuid, integer, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_request_delivery(
  uuid, uuid, integer, uuid, timestamptz
) TO service_role;

-- Compatibility overload for an in-flight application rollout. It resolves
-- the current submission, then delegates to the exact-target function above;
-- that function locks the ref and rejects the call if the submission changed.
CREATE FUNCTION public.partner_request_delivery(
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
  v_submission_id uuid;
BEGIN
  SELECT current_submission_id INTO v_submission_id
  FROM public.external_inspection_refs
  WHERE id = p_ref_id;

  IF v_submission_id IS NULL THEN
    RAISE EXCEPTION 'deliverables_not_ready';
  END IF;

  RETURN public.partner_request_delivery(
    p_ref_id,
    v_submission_id,
    p_output_version,
    p_event_id,
    p_occurred_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_request_delivery(
  uuid, integer, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_request_delivery(
  uuid, integer, uuid, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.partner_request_delivery(
  uuid, integer, uuid, timestamptz
) IS 'Deprecated rollout compatibility overload; resolves and validates the current submission.';

COMMENT ON COLUMN public.external_inspection_refs.delivered_submission_id IS
  'Submission explicitly selected by Send to DealerSpace; pairs with delivered_output_version.';
