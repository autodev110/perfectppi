-- Durable privacy-request fulfillment. Authenticated clients can continue to
-- read only the public request columns exposed by the API; all processing
-- metadata remains service-role only.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.privacy_requests
  ADD COLUMN auth_user_id uuid,
  ADD COLUMN subject_reference_hash text,
  ADD COLUMN processing_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN lock_expires_at timestamptz,
  ADD COLUMN locked_by text,
  ADD COLUMN account_deleted_at timestamptz,
  ADD COLUMN last_error text,
  ADD COLUMN result_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN retention_expires_at timestamptz;

UPDATE public.privacy_requests
SET subject_reference_hash = encode(
  extensions.digest(COALESCE(profile_id::text, id::text), 'sha256'),
  'hex'
)
WHERE subject_reference_hash IS NULL;

ALTER TABLE public.privacy_requests
  ALTER COLUMN subject_reference_hash SET NOT NULL,
  ADD CONSTRAINT privacy_requests_subject_hash_check
    CHECK (subject_reference_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT privacy_requests_attempts_check
    CHECK (processing_attempts >= 0),
  ADD CONSTRAINT privacy_requests_result_metadata_check
    CHECK (jsonb_typeof(result_metadata) = 'object');

ALTER TABLE public.privacy_requests
  DROP CONSTRAINT privacy_requests_status_check;
ALTER TABLE public.privacy_requests
  ADD CONSTRAINT privacy_requests_status_check CHECK (status IN (
    'submitted', 'identity_verification', 'in_progress', 'on_hold', 'completed',
    'partially_completed', 'denied', 'cancelled'
  ));

DROP INDEX public.privacy_requests_one_open_deletion_idx;
CREATE UNIQUE INDEX privacy_requests_one_open_deletion_idx
  ON public.privacy_requests(profile_id)
  WHERE request_type = 'deletion'
    AND status IN ('submitted', 'identity_verification', 'in_progress', 'on_hold');

CREATE INDEX privacy_requests_fulfillment_queue_idx
  ON public.privacy_requests(next_attempt_at, submitted_at)
  WHERE request_type = 'deletion'
    AND status IN ('submitted', 'in_progress');

CREATE INDEX privacy_requests_retention_idx
  ON public.privacy_requests(retention_expires_at)
  WHERE retention_expires_at IS NOT NULL;

COMMENT ON COLUMN public.privacy_requests.auth_user_id IS
  'Server-recorded Auth subject used by the deletion worker; never accepted from a client payload.';
COMMENT ON COLUMN public.privacy_requests.subject_reference_hash IS
  'Pseudonymous request-log subject retained after profile deletion.';
COMMENT ON COLUMN public.privacy_requests.result_metadata IS
  'Service-only retry metadata. Do not return this column from user APIs.';

CREATE OR REPLACE FUNCTION public.claim_privacy_deletion_requests(
  p_limit integer,
  p_worker_id text
)
RETURNS SETOF public.privacy_requests
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 50 OR char_length(p_worker_id) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid privacy worker claim';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT request.id
    FROM public.privacy_requests AS request
    WHERE request.request_type = 'deletion'
      AND request.status IN ('submitted', 'in_progress')
      AND request.next_attempt_at <= now()
      AND (request.lock_expires_at IS NULL OR request.lock_expires_at <= now())
    ORDER BY request.submitted_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.privacy_requests AS request
  SET status = 'in_progress',
      processing_attempts = request.processing_attempts + 1,
      locked_at = now(),
      lock_expires_at = now() + interval '15 minutes',
      locked_by = p_worker_id,
      acknowledged_at = COALESCE(request.acknowledged_at, now()),
      last_error = NULL
  FROM candidates
  WHERE request.id = candidates.id
  RETURNING request.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_privacy_deletion_requests(integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_privacy_deletion_requests(integer, text)
  TO service_role;
