\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.operational_worker_runs'::regclass) THEN
    RAISE EXCEPTION 'operational worker runs must have RLS enabled';
  END IF;
  IF has_table_privilege('anon', 'public.operational_worker_runs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.operational_worker_runs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.operational_worker_runs', 'INSERT') THEN
    RAISE EXCEPTION 'operational worker history must be service-only';
  END IF;
END
$$;

SET LOCAL ROLE service_role;
INSERT INTO public.operational_worker_runs (id, worker_code)
VALUES ('d9000000-0000-4000-8000-000000000001', 'moderation_outbox');
UPDATE public.operational_worker_runs
SET status = 'succeeded', completed_at = now(), duration_ms = 125
WHERE id = 'd9000000-0000-4000-8000-000000000001';
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.operational_worker_runs
    WHERE id = 'd9000000-0000-4000-8000-000000000001'
      AND status = 'succeeded'
      AND completed_at IS NOT NULL
      AND duration_ms = 125
      AND error_code IS NULL
  ) THEN
    RAISE EXCEPTION 'successful worker completion was not recorded';
  END IF;

  BEGIN
    INSERT INTO public.operational_worker_runs (worker_code) VALUES ('unknown_worker');
    RAISE EXCEPTION 'invalid worker code was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.operational_worker_runs (
      worker_code, status, completed_at, duration_ms, error_code
    ) VALUES (
      'storage_cleanup', 'failed', now(), 10, NULL
    );
    RAISE EXCEPTION 'failed run without an error code was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.operational_worker_runs (
      worker_code, status, completed_at, duration_ms, error_code
    ) VALUES (
      'retention_purge', 'succeeded', now(), 10, 'unexpected_error'
    );
    RAISE EXCEPTION 'successful run with an error code was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

ROLLBACK;
