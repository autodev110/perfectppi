BEGIN;

-- Durable worker heartbeat and failure history for the launch observability
-- requirements in plan sections 33 and 39. This table intentionally stores
-- no content, user identifiers, request payloads, or raw exception text.
CREATE TABLE public.operational_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_code text NOT NULL CHECK (worker_code IN (
    'outputs',
    'deliveries',
    'storage_cleanup',
    'community_media_migration',
    'retention_purge',
    'moderation_outbox',
    'marketplace_saved_searches'
  )),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  CHECK (
    (status = 'running' AND completed_at IS NULL AND duration_ms IS NULL AND error_code IS NULL)
    OR (status = 'succeeded' AND completed_at IS NOT NULL AND duration_ms IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND completed_at IS NOT NULL AND duration_ms IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX operational_worker_runs_worker_started_idx
  ON public.operational_worker_runs(worker_code, started_at DESC);
CREATE INDEX operational_worker_runs_failures_idx
  ON public.operational_worker_runs(started_at DESC)
  WHERE status = 'failed';
CREATE INDEX operational_worker_runs_running_idx
  ON public.operational_worker_runs(started_at)
  WHERE status = 'running';

ALTER TABLE public.operational_worker_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operational_worker_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_worker_runs TO service_role;

COMMENT ON TABLE public.operational_worker_runs IS
  'Service-only worker heartbeat and failure history. Contains operational metadata only, never user content or raw errors.';

COMMIT;
