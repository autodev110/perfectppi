-- Legal-hold deletions must remain in the worker queue so they resume after a
-- hold is released. Also reject NULL worker arguments rather than relying on
-- SQL's three-valued boolean behavior.

DROP INDEX IF EXISTS public.privacy_requests_fulfillment_queue_idx;
CREATE INDEX privacy_requests_fulfillment_queue_idx
  ON public.privacy_requests(next_attempt_at, submitted_at)
  WHERE request_type = 'deletion'
    AND status IN ('submitted', 'in_progress', 'on_hold');

CREATE OR REPLACE FUNCTION public.claim_privacy_deletion_requests(
  p_limit integer,
  p_worker_id text
)
RETURNS SETOF public.privacy_requests
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL
    OR p_limit < 1
    OR p_limit > 50
    OR p_worker_id IS NULL
    OR char_length(p_worker_id) NOT BETWEEN 1 AND 200
  THEN
    RAISE EXCEPTION 'invalid privacy worker claim';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT request.id
    FROM public.privacy_requests AS request
    WHERE request.request_type = 'deletion'
      AND request.status IN ('submitted', 'in_progress', 'on_hold')
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
