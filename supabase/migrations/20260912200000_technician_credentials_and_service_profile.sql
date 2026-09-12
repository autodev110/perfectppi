BEGIN;

-- Plan 26.1: factual technician identity and scoped credentials.
-- Legacy certification_level/is_verified values were self-selected or toggled
-- without a proof record. Preserve the claim for review, but derive public
-- trust fields only from approved, unexpired credential records.

ALTER TABLE public.technician_profiles
  ADD COLUMN IF NOT EXISTS claimed_certification_level public.certification_level NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS supported_makes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS offers_mobile_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offers_shop_service boolean NOT NULL DEFAULT false;

UPDATE public.technician_profiles
SET claimed_certification_level = certification_level
WHERE claimed_certification_level = 'none'::public.certification_level
  AND certification_level <> 'none'::public.certification_level;

CREATE TABLE public.technician_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_profile_id uuid NOT NULL REFERENCES public.technician_profiles(id) ON DELETE CASCADE,
  credential_type text NOT NULL CHECK (credential_type IN (
    'ase', 'ase_master', 'oem_training', 'state_license',
    'business_registration', 'other'
  )),
  credential_name text NOT NULL CHECK (char_length(btrim(credential_name)) BETWEEN 2 AND 120),
  issuer text NOT NULL CHECK (char_length(btrim(issuer)) BETWEEN 2 AND 120),
  scope text CHECK (scope IS NULL OR char_length(btrim(scope)) BETWEEN 2 AND 240),
  credential_identifier_last4 text CHECK (
    credential_identifier_last4 IS NULL
    OR credential_identifier_last4 ~ '^[A-Za-z0-9-]{2,8}$'
  ),
  issued_on date,
  expires_on date,
  evidence_reference text NOT NULL CHECK (char_length(btrim(evidence_reference)) BETWEEN 4 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  verification_method text CHECK (
    verification_method IS NULL
    OR verification_method IN ('issuer_registry', 'document_review', 'issuer_confirmation', 'government_registry')
  ),
  review_reason text CHECK (review_reason IS NULL OR char_length(btrim(review_reason)) BETWEEN 10 AND 500),
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IS NULL OR char_length(btrim(revoke_reason)) BETWEEN 10 AND 500),
  supersedes_credential_id uuid REFERENCES public.technician_credentials(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on),
  CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL AND verification_method IS NULL AND review_reason IS NULL AND revoked_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND verification_method IS NOT NULL AND review_reason IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND verification_method IS NOT NULL AND review_reason IS NOT NULL AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL)
  )
);

CREATE INDEX technician_credentials_technician_idx
  ON public.technician_credentials(technician_profile_id, submitted_at DESC);
CREATE INDEX technician_credentials_review_queue_idx
  ON public.technician_credentials(status, submitted_at)
  WHERE status = 'pending';
CREATE UNIQUE INDEX technician_credentials_pending_claim_idx
  ON public.technician_credentials(
    technician_profile_id,
    credential_type,
    lower(issuer),
    COALESCE(credential_identifier_last4, '')
  )
  WHERE status = 'pending';

CREATE TABLE public.technician_credential_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid REFERENCES public.technician_credentials(id) ON DELETE SET NULL,
  technician_profile_id uuid REFERENCES public.technician_profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'revoked', 'legacy_claim_imported', 'evidence_viewed')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 4 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX technician_credential_events_technician_idx
  ON public.technician_credential_events(technician_profile_id, created_at DESC);

CREATE TRIGGER technician_credentials_updated_at
  BEFORE UPDATE ON public.technician_credentials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_technician_credential_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Account deletion may anonymize references, but no audit fact can change.
  IF TG_OP = 'UPDATE'
    AND NEW.id = OLD.id
    AND NEW.action = OLD.action
    AND NEW.reason = OLD.reason
    AND NEW.created_at = OLD.created_at
    AND (
      NEW.credential_id IS NOT DISTINCT FROM OLD.credential_id
      OR (OLD.credential_id IS NOT NULL AND NEW.credential_id IS NULL)
    )
    AND (
      NEW.technician_profile_id IS NOT DISTINCT FROM OLD.technician_profile_id
      OR (OLD.technician_profile_id IS NOT NULL AND NEW.technician_profile_id IS NULL)
    )
    AND (
      NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
      OR (OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL)
    )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'technician credential events are immutable';
END;
$$;

CREATE TRIGGER technician_credential_events_immutable
  BEFORE UPDATE OR DELETE ON public.technician_credential_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_technician_credential_event_mutation();

CREATE OR REPLACE FUNCTION public.refresh_technician_credential_summary(p_technician_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_level public.certification_level := 'none';
BEGIN
  SELECT CASE
    WHEN bool_or(credential_type = 'ase_master') THEN 'master'::public.certification_level
    WHEN bool_or(credential_type = 'oem_training') THEN 'oem_qualified'::public.certification_level
    WHEN bool_or(credential_type = 'ase') THEN 'ase'::public.certification_level
    ELSE 'none'::public.certification_level
  END
  INTO v_level
  FROM public.technician_credentials
  WHERE technician_profile_id = p_technician_profile_id
    AND status = 'approved'
    AND (expires_on IS NULL OR expires_on >= current_date);

  UPDATE public.technician_profiles
  SET certification_level = COALESCE(v_level, 'none'::public.certification_level),
      is_verified = COALESCE(v_level, 'none'::public.certification_level) <> 'none'::public.certification_level
  WHERE id = p_technician_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_technician_credential_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_technician_credential_summary(OLD.technician_profile_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.technician_profile_id <> NEW.technician_profile_id THEN
    PERFORM public.refresh_technician_credential_summary(OLD.technician_profile_id);
  END IF;
  PERFORM public.refresh_technician_credential_summary(NEW.technician_profile_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER technician_credentials_refresh_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.technician_credentials
  FOR EACH ROW EXECUTE FUNCTION public.on_technician_credential_change();

CREATE OR REPLACE FUNCTION public.guard_technician_profile_trust_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    (TG_OP = 'INSERT' AND (
      NEW.certification_level <> 'none'::public.certification_level
      OR NEW.claimed_certification_level <> 'none'::public.certification_level
      OR NEW.is_verified
      OR NEW.is_featured
      OR NEW.total_inspections <> 0
      OR NEW.avg_rating <> 0
      OR NEW.total_reviews <> 0
      OR NEW.reputation_score <> 0
    ))
    OR (TG_OP = 'UPDATE' AND (
      NEW.certification_level IS DISTINCT FROM OLD.certification_level
      OR NEW.claimed_certification_level IS DISTINCT FROM OLD.claimed_certification_level
      OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
      OR NEW.is_featured IS DISTINCT FROM OLD.is_featured
      OR NEW.total_inspections IS DISTINCT FROM OLD.total_inspections
      OR NEW.avg_rating IS DISTINCT FROM OLD.avg_rating
      OR NEW.total_reviews IS DISTINCT FROM OLD.total_reviews
      OR NEW.reputation_score IS DISTINCT FROM OLD.reputation_score
    ))
  ) THEN
    RAISE EXCEPTION 'technician trust fields are server managed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER technician_profiles_guard_trust_fields
  BEFORE INSERT OR UPDATE ON public.technician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_technician_profile_trust_fields();

CREATE OR REPLACE FUNCTION public.submit_technician_credential(
  p_actor_profile_id uuid,
  p_credential_type text,
  p_credential_name text,
  p_issuer text,
  p_scope text,
  p_identifier_last4 text,
  p_issued_on date,
  p_expires_on date,
  p_evidence_reference text,
  p_supersedes_id uuid DEFAULT NULL
)
RETURNS public.technician_credentials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_technician_id uuid;
  v_row public.technician_credentials;
BEGIN
  SELECT id INTO v_technician_id
  FROM public.technician_profiles
  WHERE profile_id = p_actor_profile_id;
  IF v_technician_id IS NULL THEN
    RAISE EXCEPTION 'technician_profile_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_expires_on IS NOT NULL AND p_expires_on < current_date THEN
    RAISE EXCEPTION 'credential_already_expired' USING ERRCODE = 'check_violation';
  END IF;
  IF (
    SELECT count(*)
    FROM public.technician_credentials recent
    WHERE recent.submitted_by = p_actor_profile_id
      AND recent.submitted_at >= now() - interval '24 hours'
  ) >= 10 THEN
    RAISE EXCEPTION 'credential_submission_rate_limited' USING ERRCODE = 'program_limit_exceeded';
  END IF;
  IF p_supersedes_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.technician_credentials old
    WHERE old.id = p_supersedes_id
      AND old.technician_profile_id = v_technician_id
      AND old.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'invalid_superseded_credential' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.technician_credentials (
    technician_profile_id, credential_type, credential_name, issuer, scope,
    credential_identifier_last4, issued_on, expires_on, evidence_reference,
    submitted_by, supersedes_credential_id
  ) VALUES (
    v_technician_id, p_credential_type, btrim(p_credential_name), btrim(p_issuer),
    NULLIF(btrim(p_scope), ''), NULLIF(btrim(p_identifier_last4), ''),
    p_issued_on, p_expires_on, btrim(p_evidence_reference), p_actor_profile_id,
    p_supersedes_id
  ) RETURNING * INTO v_row;

  INSERT INTO public.technician_credential_events (
    credential_id, technician_profile_id, action, actor_id, reason
  ) VALUES (v_row.id, v_technician_id, 'submitted', p_actor_profile_id, 'Credential submitted for review.');
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_technician_credential(
  p_actor_profile_id uuid,
  p_credential_id uuid,
  p_decision text,
  p_verification_method text,
  p_reason text
)
RETURNS public.technician_credentials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.technician_credentials;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_actor_profile_id AND role = 'admin'::public.user_role
  ) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_credential_decision' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.technician_credentials
  WHERE id = p_credential_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credential_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'credential_already_reviewed' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.technician_credential_events event
    WHERE event.credential_id = p_credential_id
      AND event.actor_id = p_actor_profile_id
      AND event.action = 'evidence_viewed'
      AND event.created_at >= now() - interval '30 minutes'
  ) THEN
    RAISE EXCEPTION 'credential_evidence_review_required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_decision = 'approved' AND v_row.expires_on IS NOT NULL AND v_row.expires_on < current_date THEN
    RAISE EXCEPTION 'credential_already_expired' USING ERRCODE = 'check_violation';
  END IF;
  IF p_decision = 'approved' AND EXISTS (
    SELECT 1
    FROM public.technician_credentials existing
    WHERE existing.technician_profile_id = v_row.technician_profile_id
      AND existing.status = 'approved'
      AND existing.credential_type = v_row.credential_type
      AND lower(existing.issuer) = lower(v_row.issuer)
      AND COALESCE(existing.credential_identifier_last4, '') = COALESCE(v_row.credential_identifier_last4, '')
      AND existing.id <> v_row.id
      AND existing.id IS DISTINCT FROM v_row.supersedes_credential_id
  ) THEN
    RAISE EXCEPTION 'active_credential_already_exists' USING ERRCODE = 'unique_violation';
  END IF;

  IF p_decision = 'approved' AND v_row.supersedes_credential_id IS NOT NULL THEN
    UPDATE public.technician_credentials
    SET status = 'revoked',
        revoked_by = p_actor_profile_id,
        revoked_at = now(),
        revoke_reason = 'Replaced by an approved renewal.'
    WHERE id = v_row.supersedes_credential_id
      AND technician_profile_id = v_row.technician_profile_id
      AND status = 'approved';

    INSERT INTO public.technician_credential_events (
      credential_id, technician_profile_id, action, actor_id, reason
    )
    SELECT id, technician_profile_id, 'revoked', p_actor_profile_id,
      'Replaced by an approved renewal.'
    FROM public.technician_credentials
    WHERE id = v_row.supersedes_credential_id
      AND status = 'revoked';
  END IF;

  UPDATE public.technician_credentials
  SET status = p_decision,
      reviewed_by = p_actor_profile_id,
      reviewed_at = now(),
      verification_method = p_verification_method,
      review_reason = btrim(p_reason)
  WHERE id = p_credential_id
  RETURNING * INTO v_row;

  INSERT INTO public.technician_credential_events (
    credential_id, technician_profile_id, action, actor_id, reason
  ) VALUES (v_row.id, v_row.technician_profile_id, p_decision, p_actor_profile_id, btrim(p_reason));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_technician_credential(
  p_actor_profile_id uuid,
  p_credential_id uuid,
  p_reason text
)
RETURNS public.technician_credentials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.technician_credentials;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_actor_profile_id AND role = 'admin'::public.user_role
  ) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_row FROM public.technician_credentials
  WHERE id = p_credential_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credential_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status <> 'approved' THEN
    RAISE EXCEPTION 'only_approved_credentials_can_be_revoked' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.technician_credentials
  SET status = 'revoked', revoked_by = p_actor_profile_id, revoked_at = now(), revoke_reason = btrim(p_reason)
  WHERE id = p_credential_id
  RETURNING * INTO v_row;

  INSERT INTO public.technician_credential_events (
    credential_id, technician_profile_id, action, actor_id, reason
  ) VALUES (v_row.id, v_row.technician_profile_id, 'revoked', p_actor_profile_id, btrim(p_reason));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_technician_credential_evidence(
  p_actor_profile_id uuid,
  p_credential_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_evidence text;
  v_technician_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_actor_profile_id AND role = 'admin'::public.user_role
  ) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT evidence_reference, technician_profile_id
  INTO v_evidence, v_technician_id
  FROM public.technician_credentials
  WHERE id = p_credential_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credential_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.technician_credential_events (
    credential_id, technician_profile_id, action, actor_id, reason
  ) VALUES (
    p_credential_id, v_technician_id, 'evidence_viewed', p_actor_profile_id,
    'Private credential evidence viewed for credential review.'
  );

  RETURN v_evidence;
END;
$$;

-- Existing claims become reviewable records, not public proof.
INSERT INTO public.technician_credentials (
  technician_profile_id, credential_type, credential_name, issuer,
  evidence_reference, submitted_by, status
)
SELECT
  technician.id,
  CASE technician.claimed_certification_level
    WHEN 'master' THEN 'ase_master'
    WHEN 'oem_qualified' THEN 'oem_training'
    ELSE 'ase'
  END,
  CASE technician.claimed_certification_level
    WHEN 'master' THEN 'Legacy ASE Master claim'
    WHEN 'oem_qualified' THEN 'Legacy OEM qualification claim'
    ELSE 'Legacy ASE claim'
  END,
  CASE WHEN technician.claimed_certification_level = 'oem_qualified' THEN 'OEM not specified' ELSE 'ASE' END,
  'Imported self-reported claim; proof must be requested before review.',
  technician.profile_id,
  'pending'
FROM public.technician_profiles technician
WHERE technician.claimed_certification_level <> 'none'::public.certification_level
ON CONFLICT DO NOTHING;

INSERT INTO public.technician_credential_events (
  credential_id, technician_profile_id, action, actor_id, reason
)
SELECT credential.id, credential.technician_profile_id, 'legacy_claim_imported', credential.submitted_by,
  'Imported from the legacy self-reported certification field; not approved.'
FROM public.technician_credentials credential
WHERE credential.evidence_reference = 'Imported self-reported claim; proof must be requested before review.';

UPDATE public.technician_profiles
SET certification_level = 'none'::public.certification_level,
    is_verified = false;

ALTER TABLE public.technician_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_credential_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.technician_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.technician_credential_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.technician_credentials TO service_role;
GRANT ALL ON TABLE public.technician_credential_events TO service_role;

REVOKE ALL ON FUNCTION public.prevent_technician_credential_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_technician_credential_summary(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_technician_credential_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_technician_profile_trust_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_technician_credential(uuid, text, text, text, text, text, date, date, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_technician_credential(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_technician_credential(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_technician_credential_evidence(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_technician_credential_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_technician_credential(uuid, text, text, text, text, text, date, date, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_technician_credential(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_technician_credential(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_technician_credential_evidence(uuid, uuid) TO service_role;

COMMIT;
