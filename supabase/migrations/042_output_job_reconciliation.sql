-- ============================================================================
-- Migration 042: Reconciliation for submissions that never got a job.
--
-- Enqueueing happens right after a submission lands. If that one call fails —
-- a transient database error, a serverless instance torn down between the two
-- statements — the submission is left with no job row, and the queue-driven
-- worker has nothing to find. Nothing would ever generate that report.
--
-- This sweep closes that hole: it looks for submitted inspections that have no
-- job and no complete artifact set, and enqueues one.
--
-- Deliberately narrow:
--   * at least two minutes old, so it never races the inline enqueue
--   * at most seven days old, so enabling it does not kick off a mass backfill
--     of historical submissions (use the Retry control for those)
--   * reuses the latest existing output version rather than minting a new one,
--     so an inspection that already has AI output only gets its missing
--     artifacts rendered instead of being regenerated from scratch
--
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_output_generation_jobs(
  p_limit integer DEFAULT 20
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_submission record;
  v_version integer;
  v_enqueued integer := 0;
BEGIN
  FOR v_submission IN
    SELECT s.id
    FROM public.ppi_submissions s
    WHERE s.status = 'submitted'
      AND s.submitted_at IS NOT NULL
      AND s.submitted_at < now() - interval '2 minutes'
      AND s.submitted_at > now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.output_generation_jobs j
        WHERE j.ppi_submission_id = s.id
      )
      AND public.ready_output_version(s.id) IS NULL
    ORDER BY s.submitted_at ASC
    LIMIT GREATEST(p_limit, 0)
  LOOP
    -- Attach to the newest existing output version when there is one, so
    -- previously generated AI content is reused rather than paid for twice.
    SELECT COALESCE(MAX(o.version), 0)
    INTO v_version
    FROM public.standardized_outputs o
    WHERE o.ppi_submission_id = v_submission.id;

    INSERT INTO public.output_generation_jobs (
      ppi_submission_id, output_version, trigger_reason
    ) VALUES (
      v_submission.id, GREATEST(v_version, 1), 'submission'
    )
    ON CONFLICT (ppi_submission_id, output_version) DO NOTHING;

    v_enqueued := v_enqueued + 1;
  END LOOP;

  RETURN v_enqueued;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_output_generation_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_output_generation_jobs(integer)
  TO service_role;
