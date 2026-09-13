-- Plan 26.1 / Phase 3: transaction-linked technician reviews may ship only
-- with a defined dispute path and database-authoritative anti-retaliation
-- controls. Disputes are support records, not public Community content.
BEGIN;

CREATE TABLE public.ppi_service_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_request_id uuid NOT NULL REFERENCES public.ppi_requests(id) ON DELETE CASCADE,
  requester_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  technician_profile_id uuid REFERENCES public.technician_profiles(id) ON DELETE SET NULL,
  reason_code text NOT NULL CHECK (reason_code IN (
    'quality_concern', 'incomplete_inspection', 'incorrect_information',
    'professional_conduct', 'billing_or_scope', 'other'
  )),
  details text NOT NULL CHECK (char_length(btrim(details)) BETWEEN 20 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed', 'withdrawn')),
  outcome text CHECK (outcome IS NULL OR outcome IN (
    'customer_supported', 'technician_supported', 'partial_resolution', 'no_finding', 'withdrawn'
  )),
  resolution_note text CHECK (
    resolution_note IS NULL OR char_length(btrim(resolution_note)) BETWEEN 10 AND 2000
  ),
  review_action text CHECK (review_action IS NULL OR review_action IN ('restored', 'kept_hidden', 'not_applicable')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'open' AND outcome IS NULL AND resolution_note IS NULL AND review_action IS NULL AND resolved_at IS NULL AND resolved_by IS NULL)
    OR
    (status IN ('resolved', 'dismissed') AND outcome IS NOT NULL AND resolution_note IS NOT NULL AND review_action IS NOT NULL AND resolved_at IS NOT NULL)
    OR
    (status = 'withdrawn' AND outcome = 'withdrawn' AND resolution_note IS NULL AND review_action IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NULL)
  )
);

CREATE UNIQUE INDEX ppi_service_disputes_one_per_request_idx
  ON public.ppi_service_disputes(ppi_request_id);
CREATE INDEX ppi_service_disputes_queue_idx
  ON public.ppi_service_disputes(status, opened_at, id);
CREATE INDEX ppi_service_disputes_requester_idx
  ON public.ppi_service_disputes(requester_id, opened_at DESC);

CREATE TABLE public.ppi_service_dispute_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid REFERENCES public.ppi_service_disputes(id) ON DELETE SET NULL,
  ppi_request_id uuid REFERENCES public.ppi_requests(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('opened', 'resolved', 'dismissed', 'withdrawn')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  outcome text,
  review_action text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ppi_service_dispute_events_dispute_idx
  ON public.ppi_service_dispute_events(dispute_id, created_at, id);

ALTER TABLE public.technician_reviews
  ADD COLUMN dispute_hold_id uuid REFERENCES public.ppi_service_disputes(id) ON DELETE SET NULL;

CREATE INDEX technician_reviews_dispute_hold_idx
  ON public.technician_reviews(dispute_hold_id)
  WHERE dispute_hold_id IS NOT NULL;

CREATE TRIGGER ppi_service_disputes_updated_at
  BEFORE UPDATE ON public.ppi_service_disputes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE FUNCTION public.prevent_ppi_service_dispute_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Profile/request deletion may invoke ON DELETE SET NULL. Preserve the
  -- event while allowing only those identifying foreign keys to be erased.
  IF TG_OP = 'UPDATE'
    AND NEW.id = OLD.id
    AND NEW.action = OLD.action
    AND NEW.outcome IS NOT DISTINCT FROM OLD.outcome
    AND NEW.review_action IS NOT DISTINCT FROM OLD.review_action
    AND NEW.created_at = OLD.created_at
    AND (NEW.dispute_id IS NOT DISTINCT FROM OLD.dispute_id OR (OLD.dispute_id IS NOT NULL AND NEW.dispute_id IS NULL))
    AND (NEW.ppi_request_id IS NOT DISTINCT FROM OLD.ppi_request_id OR (OLD.ppi_request_id IS NOT NULL AND NEW.ppi_request_id IS NULL))
    AND (NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id OR (OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL)) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'service dispute events are immutable';
END;
$$;

CREATE TRIGGER ppi_service_dispute_events_immutable
  BEFORE UPDATE OR DELETE ON public.ppi_service_dispute_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ppi_service_dispute_event_mutation();

ALTER TABLE public.ppi_service_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppi_service_dispute_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ppi_service_disputes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ppi_service_dispute_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.technician_reviews FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ppi_service_disputes TO service_role;
GRANT SELECT, INSERT ON public.ppi_service_dispute_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_reviews TO service_role;

CREATE FUNCTION public.open_ppi_service_dispute(
  p_actor_profile_id uuid,
  p_ppi_request_id uuid,
  p_reason_code text,
  p_details text
)
RETURNS public.ppi_service_disputes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.ppi_requests%ROWTYPE;
  v_technician_profile_id uuid;
  v_completed_at timestamptz;
  v_dispute public.ppi_service_disputes%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.ppi_requests request
  WHERE request.id = p_ppi_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.requester_id IS DISTINCT FROM p_actor_profile_id THEN
    RAISE EXCEPTION 'dispute_request_unavailable' USING ERRCODE = '42501';
  END IF;
  IF v_request.status <> 'completed' OR v_request.assigned_tech_id IS NULL THEN
    RAISE EXCEPTION 'dispute_requires_completed_technician_inspection';
  END IF;

  SELECT profile.id INTO v_technician_profile_id
  FROM public.technician_profiles profile
  WHERE profile.profile_id = v_request.assigned_tech_id;
  IF v_technician_profile_id IS NULL THEN
    RAISE EXCEPTION 'dispute_technician_unavailable';
  END IF;

  SELECT max(submission.completed_at) INTO v_completed_at
  FROM public.ppi_submissions submission
  WHERE submission.ppi_request_id = p_ppi_request_id
    AND submission.status = 'completed';
  v_completed_at := COALESCE(v_completed_at, v_request.updated_at);
  IF v_completed_at < now() - interval '30 days' THEN
    RAISE EXCEPTION 'dispute_window_closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ppi_service_disputes dispute
    WHERE dispute.ppi_request_id = p_ppi_request_id
  ) THEN
    RAISE EXCEPTION 'dispute_already_open';
  END IF;

  INSERT INTO public.ppi_service_disputes (
    ppi_request_id, requester_id, technician_profile_id, reason_code, details
  ) VALUES (
    p_ppi_request_id, p_actor_profile_id, v_technician_profile_id, p_reason_code, btrim(p_details)
  )
  RETURNING * INTO v_dispute;

  -- Only mark a review as dispute-held when this operation changed it from
  -- public to hidden. An independently moderated review is never auto-restored.
  UPDATE public.technician_reviews review
  SET status = 'hidden', dispute_hold_id = v_dispute.id
  WHERE review.ppi_request_id = p_ppi_request_id
    AND review.status = 'active';

  INSERT INTO public.ppi_service_dispute_events (
    dispute_id, ppi_request_id, action, actor_id
  ) VALUES (v_dispute.id, p_ppi_request_id, 'opened', p_actor_profile_id);

  RETURN v_dispute;
END;
$$;

CREATE FUNCTION public.withdraw_ppi_service_dispute(
  p_actor_profile_id uuid,
  p_dispute_id uuid
)
RETURNS public.ppi_service_disputes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dispute public.ppi_service_disputes%ROWTYPE;
  v_review_action text;
BEGIN
  SELECT * INTO v_dispute
  FROM public.ppi_service_disputes dispute
  WHERE dispute.id = p_dispute_id
  FOR UPDATE;

  IF NOT FOUND OR v_dispute.requester_id IS DISTINCT FROM p_actor_profile_id OR v_dispute.status <> 'open' THEN
    RAISE EXCEPTION 'dispute_unavailable' USING ERRCODE = '42501';
  END IF;

  UPDATE public.technician_reviews review
  SET status = 'active', dispute_hold_id = NULL
  WHERE review.dispute_hold_id = v_dispute.id
    AND review.status = 'hidden';
  v_review_action := CASE WHEN FOUND THEN 'restored' ELSE 'not_applicable' END;

  UPDATE public.ppi_service_disputes
  SET status = 'withdrawn', outcome = 'withdrawn', review_action = v_review_action,
      resolved_at = now()
  WHERE id = v_dispute.id
  RETURNING * INTO v_dispute;

  INSERT INTO public.ppi_service_dispute_events (
    dispute_id, ppi_request_id, action, actor_id, outcome, review_action
  ) VALUES (
    v_dispute.id, v_dispute.ppi_request_id, 'withdrawn', p_actor_profile_id,
    'withdrawn', v_review_action
  );

  RETURN v_dispute;
END;
$$;

CREATE FUNCTION public.resolve_ppi_service_dispute(
  p_actor_profile_id uuid,
  p_dispute_id uuid,
  p_status text,
  p_outcome text,
  p_resolution_note text,
  p_restore_review boolean
)
RETURNS public.ppi_service_disputes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dispute public.ppi_service_disputes%ROWTYPE;
  v_review_action text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = p_actor_profile_id AND profile.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'dispute_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('resolved', 'dismissed')
    OR p_outcome NOT IN ('customer_supported', 'technician_supported', 'partial_resolution', 'no_finding')
    OR char_length(btrim(p_resolution_note)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'dispute_resolution_invalid';
  END IF;

  SELECT * INTO v_dispute
  FROM public.ppi_service_disputes dispute
  WHERE dispute.id = p_dispute_id AND dispute.status = 'open'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispute_unavailable';
  END IF;

  IF p_restore_review THEN
    UPDATE public.technician_reviews review
    SET status = 'active', dispute_hold_id = NULL
    WHERE review.dispute_hold_id = v_dispute.id AND review.status = 'hidden';
    v_review_action := CASE WHEN FOUND THEN 'restored' ELSE 'not_applicable' END;
  ELSE
    UPDATE public.technician_reviews review
    SET dispute_hold_id = NULL
    WHERE review.dispute_hold_id = v_dispute.id;
    v_review_action := CASE WHEN FOUND THEN 'kept_hidden' ELSE 'not_applicable' END;
  END IF;

  UPDATE public.ppi_service_disputes
  SET status = p_status, outcome = p_outcome, resolution_note = btrim(p_resolution_note),
      review_action = v_review_action, resolved_at = now(), resolved_by = p_actor_profile_id
  WHERE id = v_dispute.id
  RETURNING * INTO v_dispute;

  INSERT INTO public.ppi_service_dispute_events (
    dispute_id, ppi_request_id, action, actor_id, outcome, review_action
  ) VALUES (
    v_dispute.id, v_dispute.ppi_request_id, p_status, p_actor_profile_id,
    p_outcome, v_review_action
  );

  RETURN v_dispute;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_technician_review_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_request public.ppi_requests%ROWTYPE;
  v_expected_technician_profile_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.ppi_request_id IS DISTINCT FROM OLD.ppi_request_id
    OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
    OR NEW.technician_profile_id IS DISTINCT FROM OLD.technician_profile_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'review_identity_is_immutable' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'hidden'
    AND OLD.dispute_hold_id IS NULL
    AND (
      NEW.rating IS DISTINCT FROM OLD.rating
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.content IS DISTINCT FROM OLD.content
    ) THEN
    RAISE EXCEPTION 'review_under_moderation' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.ppi_requests request
  WHERE request.id = NEW.ppi_request_id
  FOR UPDATE;
  SELECT profile.id INTO v_expected_technician_profile_id
  FROM public.technician_profiles profile
  WHERE profile.profile_id = v_request.assigned_tech_id;

  IF v_request.id IS NULL
    OR v_request.status <> 'completed'
    OR v_request.requester_id IS DISTINCT FROM NEW.reviewer_id
    OR v_expected_technician_profile_id IS DISTINCT FROM NEW.technician_profile_id THEN
    RAISE EXCEPTION 'review_not_eligible' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND (NEW.status <> 'active' OR NEW.dispute_hold_id IS NOT NULL) THEN
    RAISE EXCEPTION 'review_initial_state_invalid' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' OR (
    NEW.rating IS DISTINCT FROM OLD.rating
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.content IS DISTINCT FROM OLD.content
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.ppi_service_disputes dispute
      WHERE dispute.ppi_request_id = NEW.ppi_request_id AND dispute.status = 'open'
    ) THEN
      RAISE EXCEPTION 'review_blocked_by_active_dispute';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.created_at < now() - interval '30 days' THEN
      RAISE EXCEPTION 'review_edit_window_closed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER technician_reviews_policy_guard
  BEFORE INSERT OR UPDATE ON public.technician_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_technician_review_policy();

DROP POLICY IF EXISTS technician_reviews_insert_own ON public.technician_reviews;
DROP POLICY IF EXISTS technician_reviews_update_own ON public.technician_reviews;
DROP POLICY IF EXISTS technician_reviews_delete_own ON public.technician_reviews;

REVOKE ALL ON FUNCTION public.open_ppi_service_dispute(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.withdraw_ppi_service_dispute(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_ppi_service_dispute(uuid, uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_ppi_service_dispute_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_technician_review_policy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_ppi_service_dispute(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_ppi_service_dispute(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_ppi_service_dispute(uuid, uuid, text, text, text, boolean) TO service_role;

COMMENT ON TABLE public.ppi_service_disputes IS
  'Private support disputes for completed technician inspections; active records hold linked public reviews.';
COMMENT ON TABLE public.ppi_service_dispute_events IS
  'Append-only audit history for inspection dispute lifecycle decisions.';

COMMIT;
