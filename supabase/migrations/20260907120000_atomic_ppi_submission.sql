CREATE OR REPLACE FUNCTION public.submit_ppi_atomic(
  p_submission_id uuid,
  p_submitted_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_request_id uuid;
BEGIN
  UPDATE public.ppi_submissions
  SET status = 'submitted', submitted_at = p_submitted_at
  WHERE id = p_submission_id
  RETURNING ppi_request_id INTO v_request_id;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'submission_not_found';
  END IF;

  UPDATE public.ppi_requests
  SET status = 'submitted'
  WHERE id = v_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;
  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_ppi_atomic(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ppi_atomic(uuid, timestamptz) TO authenticated;
