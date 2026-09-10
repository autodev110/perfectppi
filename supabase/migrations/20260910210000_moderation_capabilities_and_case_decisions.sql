BEGIN;

-- ---------------------------------------------------------------------------
-- Moderator capability grants (plan 18.1).
--
-- The admin role alone grants no moderation authority. Each capability is an
-- explicit, audited, revocable grant on a profile. Route guards, server
-- actions, and the SQL functions below each check the grant independently.
-- Developer role switching never touches this table, so switching roles
-- cannot confer moderation or evidence access.
-- ---------------------------------------------------------------------------
CREATE TABLE public.moderation_role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability IN (
    'queue_read', 'reporter_identity_read', 'content_decide',
    'account_enforce', 'evidence_export', 'legal_hold_review'
  )),
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoke_reason text CHECK (revoke_reason IS NULL OR char_length(revoke_reason) BETWEEN 10 AND 500),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);
CREATE UNIQUE INDEX moderation_role_grants_active_idx
  ON public.moderation_role_grants(profile_id, capability)
  WHERE revoked_at IS NULL;
CREATE INDEX moderation_role_grants_profile_idx
  ON public.moderation_role_grants(profile_id, granted_at DESC);

CREATE TABLE public.moderation_role_grant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  capability text NOT NULL,
  action text NOT NULL CHECK (action IN ('granted', 'revoked', 'bootstrapped')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.prevent_moderation_admin_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'moderation administrative history is immutable';
END;
$$;
CREATE TRIGGER moderation_role_grant_events_immutable
  BEFORE UPDATE OR DELETE ON public.moderation_role_grant_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_moderation_admin_history_mutation();

-- Legal-hold review already exists as a designated list; carry it over as an
-- explicit grant so one capability model governs every check. No other
-- capability is bootstrapped: production admins must be granted each one.
INSERT INTO public.moderation_role_grants (profile_id, capability, granted_by, reason)
SELECT profile_id, 'legal_hold_review', granted_by,
  'bootstrapped from moderation_legal_hold_reviewers'
FROM public.moderation_legal_hold_reviewers;
INSERT INTO public.moderation_role_grant_events (profile_id, capability, action, actor_id, reason)
SELECT profile_id, 'legal_hold_review', 'bootstrapped', granted_by,
  'bootstrapped from moderation_legal_hold_reviewers'
FROM public.moderation_legal_hold_reviewers;

CREATE OR REPLACE FUNCTION public.moderation_has_capability(
  p_profile_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.moderation_role_grants grant_row
      JOIN public.profiles profile ON profile.id = grant_row.profile_id
      WHERE grant_row.profile_id = p_profile_id
        AND grant_row.capability = p_capability
        AND grant_row.revoked_at IS NULL
        AND profile.username_state = 'claimed'
    );
$$;

CREATE OR REPLACE FUNCTION public.moderation_current_user_has_capability(p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.moderation_has_capability(public.get_my_profile_id(), p_capability);
$$;

-- Grant administration. Any claimed admin may grant, but only explicitly and
-- with a recorded reason; nothing here is implied by the role itself.
CREATE OR REPLACE FUNCTION public.grant_moderation_capability(
  p_profile_id uuid,
  p_capability text,
  p_reason text
)
RETURNS public.moderation_role_grants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_row public.moderation_role_grants%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_profile_id AND username_state = 'claimed'
  ) THEN
    RAISE EXCEPTION 'Profile is not eligible for moderation grants' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_row
  FROM public.moderation_role_grants
  WHERE profile_id = p_profile_id AND capability = p_capability AND revoked_at IS NULL;
  IF FOUND THEN RETURN v_row; END IF;

  INSERT INTO public.moderation_role_grants (profile_id, capability, granted_by, reason)
  VALUES (p_profile_id, p_capability, v_actor, trim(p_reason))
  RETURNING * INTO v_row;
  INSERT INTO public.moderation_role_grant_events (profile_id, capability, action, actor_id, reason)
  VALUES (p_profile_id, p_capability, 'granted', v_actor, trim(p_reason));

  IF p_capability = 'legal_hold_review' THEN
    INSERT INTO public.moderation_legal_hold_reviewers (profile_id, granted_by)
    VALUES (p_profile_id, v_actor)
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_moderation_capability(
  p_profile_id uuid,
  p_capability text,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_updated integer;
BEGIN
  IF v_actor IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.moderation_role_grants
  SET revoked_at = now(), revoked_by = v_actor, revoke_reason = trim(p_reason)
  WHERE profile_id = p_profile_id AND capability = p_capability AND revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RETURN false; END IF;

  INSERT INTO public.moderation_role_grant_events (profile_id, capability, action, actor_id, reason)
  VALUES (p_profile_id, p_capability, 'revoked', v_actor, trim(p_reason));
  IF p_capability = 'legal_hold_review' THEN
    DELETE FROM public.moderation_legal_hold_reviewers WHERE profile_id = p_profile_id;
  END IF;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Internal case notes (plan 18.3): append-only, attributed.
-- ---------------------------------------------------------------------------
CREATE TABLE public.moderation_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.moderation_cases(id) ON DELETE RESTRICT,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_case_notes_case_idx ON public.moderation_case_notes(case_id, created_at);
CREATE TRIGGER moderation_case_notes_immutable
  BEFORE UPDATE OR DELETE ON public.moderation_case_notes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_moderation_admin_history_mutation();

CREATE OR REPLACE FUNCTION public.add_moderation_case_note(p_case_id uuid, p_note text)
RETURNS public.moderation_case_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_row public.moderation_case_notes%ROWTYPE;
BEGIN
  IF NOT public.moderation_has_capability(v_actor, 'queue_read') THEN
    RAISE EXCEPTION 'moderation capability required: queue_read' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_cases WHERE id = p_case_id) THEN
    RAISE EXCEPTION 'case not found' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.moderation_case_notes (case_id, author_id, note)
  VALUES (p_case_id, v_actor, trim(p_note))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Claims (plan 20.2): a renewable 15-minute soft claim. Another moderator may
-- view a claimed case but cannot decide it until the claim expires.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_moderation_case(p_case_id uuid)
RETURNS public.moderation_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_case public.moderation_cases%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF NOT public.moderation_has_capability(v_actor, 'queue_read')
     OR NOT public.moderation_has_capability(v_actor, 'content_decide') THEN
    RAISE EXCEPTION 'moderation capability required: content_decide' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_case FROM public.moderation_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_case.state = 'closed' THEN
    RAISE EXCEPTION 'case is closed' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_case.state = 'escalated' AND NOT public.moderation_has_capability(v_actor, 'legal_hold_review') THEN
    RAISE EXCEPTION 'moderation capability required: legal_hold_review' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_case.assigned_moderator_id IS NOT NULL
     AND v_case.assigned_moderator_id <> v_actor
     AND v_case.claim_expires_at IS NOT NULL
     AND v_case.claim_expires_at > v_now THEN
    RAISE EXCEPTION 'case_claimed_by_other' USING ERRCODE = 'lock_not_available';
  END IF;

  IF v_case.assigned_moderator_id IS NOT NULL AND v_case.assigned_moderator_id <> v_actor THEN
    INSERT INTO public.moderation_events (
      moderation_item_id, case_id, revision_id, actor_type, actor_id, event_type,
      previous_status, next_status, metadata
    ) VALUES (
      v_case.moderation_item_id, v_case.id, v_case.revision_id, 'system', NULL,
      'case_claim_expired', v_case.state, v_case.state,
      jsonb_build_object('previousModerator', v_case.assigned_moderator_id, 'takenOverBy', v_actor)
    );
  END IF;

  UPDATE public.moderation_cases
  SET state = CASE WHEN state = 'open' THEN 'claimed' ELSE state END,
      assigned_moderator_id = v_actor,
      claimed_at = v_now,
      claim_expires_at = v_now + interval '15 minutes',
      updated_at = v_now
  WHERE id = v_case.id
  RETURNING * INTO v_case;

  INSERT INTO public.moderation_events (
    moderation_item_id, case_id, revision_id, actor_type, actor_id, event_type,
    previous_status, next_status, metadata
  ) VALUES (
    v_case.moderation_item_id, v_case.id, v_case.revision_id, 'admin', v_actor,
    'case_claimed', v_case.state, v_case.state,
    jsonb_build_object('claimExpiresAt', v_case.claim_expires_at)
  );
  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_moderation_case(p_case_id uuid)
RETURNS public.moderation_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_case public.moderation_cases%ROWTYPE;
BEGIN
  IF NOT public.moderation_has_capability(v_actor, 'content_decide') THEN
    RAISE EXCEPTION 'moderation capability required: content_decide' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_case FROM public.moderation_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_case.assigned_moderator_id IS DISTINCT FROM v_actor THEN RETURN v_case; END IF;

  UPDATE public.moderation_cases
  SET state = CASE WHEN state = 'claimed' THEN 'open' ELSE state END,
      assigned_moderator_id = NULL, claimed_at = NULL, claim_expires_at = NULL, updated_at = now()
  WHERE id = v_case.id
  RETURNING * INTO v_case;

  INSERT INTO public.moderation_events (
    moderation_item_id, case_id, revision_id, actor_type, actor_id, event_type,
    previous_status, next_status, metadata
  ) VALUES (
    v_case.moderation_item_id, v_case.id, v_case.revision_id, 'admin', v_actor,
    'case_claim_expired', v_case.state, v_case.state, jsonb_build_object('released', true)
  );
  RETURN v_case;
END;
$$;

-- ---------------------------------------------------------------------------
-- Decisions (plan 18.4 / 18.6 / 20.2). One transaction: compare-and-swap on
-- decision_version, claim check, content + compatibility item + case + appeal
-- updates, enforcement, immutable events, and the author outbox event.
-- The legacy item->case sync trigger is bypassed for the duration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_active_moderation_case()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_case_id uuid;
BEGIN
  IF current_setting('app.moderation_case_sync', true) = 'skip' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.entity_type NOT IN ('community_post', 'community_comment') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_case_id
  FROM public.moderation_cases
  WHERE moderation_item_id = NEW.id
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_case_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'active' THEN
    UPDATE public.moderation_cases
    SET state = 'closed', resolution = CASE
          WHEN state = 'appeal_open' THEN 'appeal_overturned'
          ELSE 'no_violation_restored' END,
        closed_at = now(), decision_version = decision_version + 1, updated_at = now()
    WHERE id = v_case_id;
  ELSIF NEW.status = 'rejected' THEN
    UPDATE public.moderation_cases
    SET state = 'closed', resolution = CASE
          WHEN state = 'appeal_open' THEN 'appeal_upheld'
          ELSE 'violation_removed' END,
        closed_at = now(), decision_version = decision_version + 1, updated_at = now()
    WHERE id = v_case_id;
  ELSIF NEW.status = 'legal_hold' THEN
    UPDATE public.moderation_cases
    SET state = 'escalated', resolution = NULL, closed_at = NULL,
        legal_hold = true, decision_version = decision_version + 1, updated_at = now()
    WHERE id = v_case_id;
  ELSIF NEW.status = 'pending_review' AND OLD.status = 'rejected' THEN
    UPDATE public.moderation_cases
    SET state = 'appeal_open', resolution = NULL, closed_at = NULL,
        decision_version = decision_version + 1, updated_at = now()
    WHERE id = v_case_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_moderation_case(
  p_case_id uuid,
  p_expected_version integer,
  p_decision text,
  p_policy_category text,
  p_rationale text,
  p_enforcement text DEFAULT 'none',
  p_enforcement_days integer DEFAULT 7
)
RETURNS public.moderation_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_case public.moderation_cases%ROWTYPE;
  v_item public.moderation_items%ROWTYPE;
  v_now timestamptz := now();
  v_next_status text;
  v_next_decision text;
  v_resolution text;
  v_event text;
  v_action text;
  v_ends_at timestamptz;
  v_previous_setting text := current_setting('app.moderation_case_sync', true);
BEGIN
  IF p_decision NOT IN ('restore', 'remove', 'escalate') THEN
    RAISE EXCEPTION 'invalid decision' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_enforcement NOT IN ('none', 'warning', 'posting_hold', 'media_hold', 'reporting_hold', 'suspension', 'ban') THEN
    RAISE EXCEPTION 'invalid enforcement' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_decision IN ('restore', 'remove') AND NOT public.moderation_has_capability(v_actor, 'content_decide') THEN
    RAISE EXCEPTION 'moderation capability required: content_decide' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision = 'escalate' AND NOT public.moderation_has_capability(v_actor, 'legal_hold_review') THEN
    RAISE EXCEPTION 'moderation capability required: legal_hold_review' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_enforcement <> 'none' AND NOT public.moderation_has_capability(v_actor, 'account_enforce') THEN
    RAISE EXCEPTION 'moderation capability required: account_enforce' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision = 'remove' AND (
    p_policy_category IS NULL OR p_policy_category NOT IN (
      'spam', 'harassment', 'hate', 'violence', 'sexual_content',
      'personal_information', 'fraud', 'illegal_content',
      'dangerous_vehicle_advice', 'intellectual_property', 'other'
    )
  ) THEN
    RAISE EXCEPTION 'removal requires a policy category' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_decision <> 'restore' AND char_length(trim(COALESCE(p_rationale, ''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_enforcement IN ('posting_hold', 'media_hold', 'reporting_hold', 'suspension')
     AND (p_enforcement_days IS NULL OR p_enforcement_days NOT BETWEEN 1 AND 365) THEN
    RAISE EXCEPTION 'enforcement duration must be 1-365 days' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_case FROM public.moderation_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'case not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_case.state = 'closed' THEN
    RAISE EXCEPTION 'case_already_closed' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_case.state = 'escalated' AND NOT public.moderation_has_capability(v_actor, 'legal_hold_review') THEN
    RAISE EXCEPTION 'moderation capability required: legal_hold_review' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_case.decision_version <> p_expected_version THEN
    RAISE EXCEPTION 'case_version_conflict' USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_case.assigned_moderator_id IS NOT NULL
     AND v_case.assigned_moderator_id <> v_actor
     AND v_case.claim_expires_at IS NOT NULL
     AND v_case.claim_expires_at > v_now THEN
    RAISE EXCEPTION 'case_claimed_by_other' USING ERRCODE = 'lock_not_available';
  END IF;

  SELECT * INTO v_item FROM public.moderation_items WHERE id = v_case.moderation_item_id FOR UPDATE;

  v_next_status := CASE p_decision WHEN 'restore' THEN 'active' WHEN 'remove' THEN 'rejected' ELSE 'legal_hold' END;
  v_next_decision := CASE p_decision WHEN 'restore' THEN 'allow' WHEN 'remove' THEN 'block' ELSE 'legal_hold' END;
  v_event := CASE p_decision WHEN 'restore' THEN 'content_restored' WHEN 'remove' THEN 'content_removed' ELSE 'legal_hold_applied' END;
  v_resolution := CASE
    WHEN p_decision = 'escalate' THEN NULL
    WHEN p_decision = 'restore' AND v_case.state = 'appeal_open' THEN 'appeal_overturned'
    WHEN p_decision = 'restore' THEN 'no_violation_restored'
    WHEN v_case.state = 'appeal_open' THEN 'appeal_upheld'
    ELSE 'violation_removed' END;

  -- Content row: the visibility source of truth (plan 17.1).
  IF v_case.entity_type = 'community_post' THEN
    UPDATE public.community_posts
    SET moderation_status = v_next_status,
        status = CASE WHEN v_next_status = 'active' THEN 'active'::public.community_content_status
                      ELSE 'hidden'::public.community_content_status END,
        moderation_reason = CASE WHEN p_decision = 'remove' THEN p_policy_category ELSE moderation_reason END,
        moderation_checked_at = v_now,
        moderation_version = 'perfectppi-moderation-v2'
    WHERE id = v_case.entity_id;
  ELSE
    UPDATE public.community_comments
    SET moderation_status = v_next_status,
        status = CASE WHEN v_next_status = 'active' THEN 'active'::public.community_content_status
                      ELSE 'hidden'::public.community_content_status END,
        moderation_reason = CASE WHEN p_decision = 'remove' THEN p_policy_category ELSE moderation_reason END,
        moderation_checked_at = v_now,
        moderation_version = 'perfectppi-moderation-v2'
    WHERE id = v_case.entity_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'moderated content not found' USING ERRCODE = 'no_data_found'; END IF;

  -- Compatibility aggregate, without the legacy sync trigger fighting us.
  PERFORM set_config('app.moderation_case_sync', 'skip', true);
  UPDATE public.moderation_items
  SET status = v_next_status,
      decision = v_next_decision,
      risk_level = CASE WHEN v_next_status = 'active' THEN 'none'
                        WHEN v_next_status = 'legal_hold' THEN 'critical' ELSE 'high' END,
      reason_codes = CASE WHEN p_decision = 'remove' AND NOT ('policy:' || p_policy_category) = ANY(reason_codes)
                          THEN array_append(reason_codes, 'policy:' || p_policy_category) ELSE reason_codes END,
      decided_by = v_actor,
      decided_at = v_now
  WHERE id = v_item.id;
  PERFORM set_config('app.moderation_case_sync', COALESCE(v_previous_setting, ''), true);

  UPDATE public.moderation_appeals
  SET status = CASE WHEN p_decision = 'restore' THEN 'approved' ELSE 'denied' END,
      reviewed_by = v_actor, reviewed_at = v_now, resolution_notes = trim(p_rationale)
  WHERE case_id = v_case.id AND status = 'pending' AND p_decision <> 'escalate';

  UPDATE public.moderation_cases
  SET state = CASE WHEN p_decision = 'escalate' THEN 'escalated' ELSE 'closed' END,
      resolution = v_resolution,
      closed_at = CASE WHEN p_decision = 'escalate' THEN NULL ELSE v_now END,
      legal_hold = CASE WHEN p_decision = 'escalate' THEN true ELSE legal_hold END,
      decision_version = decision_version + 1,
      assigned_moderator_id = v_actor,
      claimed_at = COALESCE(claimed_at, v_now),
      claim_expires_at = CASE WHEN p_decision = 'escalate' THEN v_now + interval '15 minutes' ELSE claim_expires_at END,
      updated_at = v_now
  WHERE id = v_case.id
  RETURNING * INTO v_case;

  INSERT INTO public.moderation_events (
    moderation_item_id, case_id, revision_id, actor_type, actor_id, event_type,
    previous_status, next_status, notes, metadata
  ) VALUES (
    v_item.id, v_case.id, v_case.revision_id, 'admin', v_actor, v_event,
    v_item.status, v_next_status, NULLIF(trim(p_rationale), ''),
    jsonb_build_object('policyCategory', p_policy_category, 'decisionVersion', v_case.decision_version,
                       'resolution', v_resolution)
  );
  IF v_resolution IN ('appeal_upheld', 'appeal_overturned') THEN
    INSERT INTO public.moderation_events (
      moderation_item_id, case_id, revision_id, actor_type, actor_id, event_type,
      previous_status, next_status, notes
    ) VALUES (
      v_item.id, v_case.id, v_case.revision_id, 'admin', v_actor, 'appeal_decided',
      v_item.status, v_next_status, NULLIF(trim(p_rationale), '')
    );
  END IF;

  IF p_enforcement <> 'none' AND v_item.author_id IS NOT NULL THEN
    v_action := CASE p_enforcement
      WHEN 'posting_hold' THEN 'temporary_posting_hold'
      WHEN 'media_hold' THEN 'media_upload_hold'
      ELSE p_enforcement END;
    v_ends_at := CASE WHEN p_enforcement IN ('warning', 'ban') THEN NULL
                      ELSE v_now + make_interval(days => p_enforcement_days) END;
    INSERT INTO public.user_enforcement_actions (
      profile_id, action_type, reason_code, related_moderation_item_id, ends_at, created_by
    ) VALUES (
      v_item.author_id, v_action, COALESCE(p_policy_category, 'community_guidelines'),
      v_item.id, v_ends_at, v_actor
    );
    INSERT INTO public.moderation_events (
      moderation_item_id, case_id, revision_id, actor_type, actor_id, event_type,
      previous_status, next_status, metadata
    ) VALUES (
      v_item.id, v_case.id, v_case.revision_id, 'admin', v_actor, 'enforcement_applied',
      v_next_status, v_next_status,
      jsonb_build_object('enforcement', v_action, 'endsAt', v_ends_at, 'profileId', v_item.author_id)
    );
  END IF;

  IF p_decision <> 'escalate' THEN
    INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
    VALUES (
      v_case.id,
      CASE WHEN p_decision = 'restore' THEN 'author_restored' ELSE 'author_removed' END,
      jsonb_build_object('caseId', v_case.id, 'entityType', v_case.entity_type, 'entityId', v_case.entity_id,
                         'policyCategory', p_policy_category, 'decisionVersion', v_case.decision_version),
      v_case.id::text || ':decided:' || v_case.decision_version::text
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN v_case;
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
ALTER TABLE public.moderation_role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_role_grant_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_case_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_role_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.moderation_role_grant_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.moderation_case_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.moderation_role_grants TO service_role;
GRANT SELECT, INSERT ON public.moderation_role_grant_events TO service_role;
GRANT SELECT, INSERT ON public.moderation_case_notes TO service_role;

REVOKE ALL ON FUNCTION public.moderation_has_capability(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_has_capability(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.moderation_current_user_has_capability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderation_current_user_has_capability(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_moderation_admin_history_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_active_moderation_case() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.grant_moderation_capability(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_moderation_capability(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_moderation_case_note(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_moderation_case(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_moderation_case(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_moderation_case(uuid, integer, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_moderation_capability(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_moderation_capability(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_moderation_case_note(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_moderation_case(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_moderation_case(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_moderation_case(uuid, integer, text, text, text, text, integer) TO authenticated, service_role;

COMMENT ON TABLE public.moderation_role_grants IS
  'Explicit, audited moderator capabilities. The admin role implies none of them.';
COMMENT ON TABLE public.moderation_case_notes IS
  'Append-only internal notes on a moderation case.';

COMMIT;
