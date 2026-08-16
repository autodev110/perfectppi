-- ============================================================================
-- Migration 039: Durable output generation, immutable artifacts, and the
-- outbound webhook outbox.
--
-- Replaces the fire-and-forget `void triggerOutputGeneration(...)` call in the
-- submit route: a serverless request may terminate before background work
-- finishes, which is not good enough to gate a partner's Recon phase.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ============================================================================
-- OUTPUT GENERATION JOBS
-- Exactly one job per (submission, output version). Retries resume the same
-- intended version instead of racing ahead and minting a new one.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.output_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_submission_id uuid NOT NULL
    REFERENCES public.ppi_submissions(id) ON DELETE CASCADE,
  output_version integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  trigger_reason text NOT NULL DEFAULT 'submission',
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),

  locked_at timestamptz,
  lock_expires_at timestamptz,
  locked_by text,

  last_error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT output_generation_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT output_generation_jobs_trigger_check
    CHECK (trigger_reason IN ('submission', 'manual_retry', 'manual_regeneration')),
  CONSTRAINT output_generation_jobs_version_check
    CHECK (output_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS output_generation_jobs_submission_version_unique
  ON public.output_generation_jobs(ppi_submission_id, output_version);

CREATE INDEX IF NOT EXISTS output_generation_jobs_claimable_idx
  ON public.output_generation_jobs(next_attempt_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS output_generation_jobs_submission_idx
  ON public.output_generation_jobs(ppi_submission_id, created_at DESC);

DROP TRIGGER IF EXISTS output_generation_jobs_updated_at ON public.output_generation_jobs;
CREATE TRIGGER output_generation_jobs_updated_at
  BEFORE UPDATE ON public.output_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- INTEGRATION ARTIFACTS
-- Immutable, checksummed bytes in R2. The sha256 is computed over exactly the
-- bytes stored, so a partner can verify what it downloads.
--
-- Written for every submission, not only partner ones, so the pipeline has a
-- single code path and consumer inspections gain the same durable record.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.integration_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_inspection_ref_id uuid
    REFERENCES public.external_inspection_refs(id) ON DELETE SET NULL,
  ppi_submission_id uuid NOT NULL
    REFERENCES public.ppi_submissions(id) ON DELETE CASCADE,
  output_version integer NOT NULL,
  artifact_type text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  storage_key text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT integration_artifacts_type_check
    CHECK (artifact_type IN (
      'inspection_report_json',
      'inspection_report_pdf',
      'vsc_determination_json',
      'vsc_determination_pdf'
    )),
  CONSTRAINT integration_artifacts_sha256_check
    CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT integration_artifacts_size_check
    CHECK (size_bytes > 0),
  CONSTRAINT integration_artifacts_version_check
    CHECK (output_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_artifacts_unique
  ON public.integration_artifacts(ppi_submission_id, output_version, artifact_type);

CREATE INDEX IF NOT EXISTS integration_artifacts_ref_idx
  ON public.integration_artifacts(external_inspection_ref_id, output_version)
  WHERE external_inspection_ref_id IS NOT NULL;

-- Append-only: no UPDATE path is ever granted, and the guard makes an
-- accidental service-role update fail loudly rather than silently rewriting a
-- checksum a partner has already recorded.
CREATE OR REPLACE FUNCTION public.guard_integration_artifact_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'integration_artifacts rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS integration_artifacts_immutable ON public.integration_artifacts;
CREATE TRIGGER integration_artifacts_immutable
  BEFORE UPDATE ON public.integration_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_integration_artifact_immutable();

-- ============================================================================
-- OUTBOUND EVENTS (webhook outbox)
-- At-least-once delivery of small signed notifications. Payloads never carry
-- artifact bytes — DealerSpace pulls those over the authenticated partner API.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_connection_id uuid NOT NULL
    REFERENCES public.partner_connections(id) ON DELETE CASCADE,
  external_inspection_ref_id uuid
    REFERENCES public.external_inspection_refs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,

  -- Makes a repeated "Send to DealerSpace" click collapse onto one logical
  -- delivery instead of queueing a second one.
  dedupe_key text NOT NULL,

  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),

  locked_at timestamptz,
  lock_expires_at timestamptz,
  locked_by text,

  last_response_status integer,
  last_error jsonb,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT outbound_events_status_check
    CHECK (status IN ('pending', 'delivering', 'delivered', 'failed')),
  CONSTRAINT outbound_events_type_check
    CHECK (event_type IN (
      'inspection.created',
      'inspection.assigned',
      'inspection.accepted',
      'inspection.started',
      'inspection.submitted',
      'inspection.outputs_generating',
      'inspection.deliverables_ready',
      'inspection.delivery_requested',
      'inspection.delivered',
      'inspection.needs_revision',
      'inspection.cancelled',
      'inspection.delivery_failed'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_events_dedupe_unique
  ON public.outbound_events(partner_connection_id, dedupe_key);

CREATE INDEX IF NOT EXISTS outbound_events_claimable_idx
  ON public.outbound_events(next_attempt_at)
  WHERE status IN ('pending', 'delivering');

CREATE INDEX IF NOT EXISTS outbound_events_ref_idx
  ON public.outbound_events(external_inspection_ref_id, created_at DESC)
  WHERE external_inspection_ref_id IS NOT NULL;

DROP TRIGGER IF EXISTS outbound_events_updated_at ON public.outbound_events;
CREATE TRIGGER outbound_events_updated_at
  BEFORE UPDATE ON public.outbound_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- WEBHOOK DELIVERY ATTEMPTS
-- One append-only row per HTTP attempt, for support and replay forensics.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_event_id uuid NOT NULL
    REFERENCES public.outbound_events(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  request_url text NOT NULL,
  response_status integer,
  error_category text,
  error_message text,
  duration_ms integer,
  attempted_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT webhook_delivery_attempts_category_check
    CHECK (error_category IS NULL OR error_category IN (
      'timeout', 'network', 'http_4xx', 'http_5xx', 'configuration', 'unknown'
    ))
);

CREATE INDEX IF NOT EXISTS webhook_delivery_attempts_event_idx
  ON public.webhook_delivery_attempts(outbound_event_id, attempt_number);

-- ============================================================================
-- ATOMIC JOB CLAIMING
--
-- FOR UPDATE SKIP LOCKED lets several workers run concurrently without
-- double-processing. Rows whose lease expired are re-claimable, which is how
-- a worker that died mid-flight is recovered.
--
-- Both functions are invoker-rights and granted only to service_role: they are
-- worker plumbing and must never be reachable from a browser session.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_output_generation_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.output_generation_jobs
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE public.output_generation_jobs j
  SET status = 'processing',
      attempt_count = j.attempt_count + 1,
      locked_at = now(),
      lock_expires_at = now() + make_interval(secs => p_lease_seconds),
      locked_by = p_worker_id,
      started_at = COALESCE(j.started_at, now())
  WHERE j.id IN (
    SELECT c.id
    FROM public.output_generation_jobs c
    WHERE (c.status = 'pending' AND c.next_attempt_at <= now())
       OR (c.status = 'processing' AND c.lock_expires_at < now())
    ORDER BY c.next_attempt_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 0)
  )
  RETURNING j.*;
$$;

CREATE OR REPLACE FUNCTION public.claim_outbound_events(
  p_worker_id text,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.outbound_events
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE public.outbound_events e
  SET status = 'delivering',
      attempt_count = e.attempt_count + 1,
      locked_at = now(),
      lock_expires_at = now() + make_interval(secs => p_lease_seconds),
      locked_by = p_worker_id
  WHERE e.id IN (
    SELECT c.id
    FROM public.outbound_events c
    WHERE (c.status = 'pending' AND c.next_attempt_at <= now())
       OR (c.status = 'delivering' AND c.lock_expires_at < now())
    ORDER BY c.next_attempt_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 0)
  )
  RETURNING e.*;
$$;

REVOKE ALL ON FUNCTION public.claim_output_generation_jobs(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_output_generation_jobs(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_output_generation_jobs(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.claim_outbound_events(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_outbound_events(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_events(text, integer, integer) TO service_role;

-- ============================================================================
-- DELIVERABILITY HELPER
-- A DealerSpace inspection is only deliverable once all four required
-- artifacts exist for one output version.
--
-- Used by SQL callers and by the acceptance tests. The application also
-- evaluates the same rule in TypeScript (features/partner/queries.ts for the
-- batched queue view, features/partner/inspections.ts when building a
-- manifest); REQUIRED_ARTIFACT_TYPES is the shared list those derive from, and
-- the tests assert all three agree.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ready_output_version(p_submission_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT a.output_version
  FROM public.integration_artifacts a
  WHERE a.ppi_submission_id = p_submission_id
  GROUP BY a.output_version
  HAVING COUNT(DISTINCT a.artifact_type) FILTER (
    WHERE a.artifact_type IN (
      'inspection_report_json',
      'inspection_report_pdf',
      'vsc_determination_json',
      'vsc_determination_pdf'
    )
  ) = 4
  ORDER BY a.output_version DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.ready_output_version(uuid) TO authenticated, service_role;
