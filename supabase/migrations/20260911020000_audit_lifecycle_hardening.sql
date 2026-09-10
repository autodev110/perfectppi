BEGIN;

-- Audit hardening for moderation authority, decisions, and retention.

-- A capability is ineffective while its holder is pending, suspended, or
-- banned. Grants remain recorded so a temporary suspension does not destroy
-- the audit trail or silently change staffing configuration.
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
    AND public.social_profile_is_available(p_profile_id)
    AND EXISTS (
      SELECT 1
      FROM public.moderation_role_grants grant_row
      WHERE grant_row.profile_id = p_profile_id
        AND grant_row.capability = p_capability
        AND grant_row.revoked_at IS NULL
    );
$$;

-- Safe session-bound availability check for middleware and route guards.
-- It reveals only the caller's own usable/unusable state and cannot be used
-- to enumerate enforcement applied to another member.
CREATE OR REPLACE FUNCTION public.social_current_user_is_available()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.social_profile_is_available(public.get_my_profile_id());
$$;
REVOKE ALL ON FUNCTION public.social_current_user_is_available() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_current_user_is_available() TO authenticated, service_role;

-- Suspended or banned administrators cannot manage moderation authority.
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
  IF v_actor IS NULL
     OR public.get_my_role() IS DISTINCT FROM 'admin'
     OR NOT public.social_profile_is_available(v_actor) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_profile_id AND username_state = 'claimed'
      AND public.social_profile_is_available(id)
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
  IF v_actor IS NULL
     OR public.get_my_role() IS DISTINCT FROM 'admin'
     OR NOT public.social_profile_is_available(v_actor) THEN
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

-- Production feature flags are release/safety controls, not ordinary admin
-- preferences. Require the designated legal/safety reviewer capability in
-- addition to an active admin account; non-production environments retain the
-- active-admin gate for testing and staging operations.
CREATE OR REPLACE FUNCTION public.set_product_feature_flag(
  p_environment text,
  p_flag_code text,
  p_enabled boolean,
  p_reason text
)
RETURNS public.product_feature_flags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := public.get_my_profile_id();
  v_previous public.product_feature_flags%ROWTYPE;
  v_next public.product_feature_flags%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
     OR public.get_my_role() IS DISTINCT FROM 'admin'
     OR NOT public.social_profile_is_available(v_actor_id) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_environment = 'production'
     AND NOT public.moderation_has_capability(v_actor_id, 'legal_hold_review') THEN
    RAISE EXCEPTION 'moderation capability required: legal_hold_review'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(trim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_previous
  FROM public.product_feature_flags
  WHERE environment = p_environment AND flag_code = p_flag_code
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown feature flag' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.product_feature_flags
  SET enabled = p_enabled,
      reason = trim(p_reason),
      updated_by = v_actor_id,
      version = version + 1,
      updated_at = now()
  WHERE environment = p_environment AND flag_code = p_flag_code
  RETURNING * INTO v_next;

  INSERT INTO public.product_feature_flag_changes (
    environment, flag_code, previous_enabled, next_enabled, reason, actor_id, version
  ) VALUES (
    p_environment, p_flag_code, v_previous.enabled, p_enabled, trim(p_reason),
    v_actor_id, v_next.version
  );

  RETURN v_next;
END;
$$;

-- Keep the original atomic implementation private and put strict validation
-- in front of it. PostgreSQL's three-valued logic made the former NOT IN and
-- version comparisons accept NULL, which could bypass both decision type and
-- compare-and-swap validation. Account enforcement also cannot accompany a
-- restore or escalation decision.
ALTER FUNCTION public.decide_moderation_case(uuid, integer, text, text, text, text, integer)
  RENAME TO decide_moderation_case_internal;
REVOKE ALL ON FUNCTION public.decide_moderation_case_internal(uuid, integer, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.decide_moderation_case(
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
BEGIN
  IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'case and expected version are required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('restore', 'remove', 'escalate') THEN
    RAISE EXCEPTION 'invalid decision' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_enforcement IS NULL OR p_enforcement NOT IN (
    'none', 'warning', 'posting_hold', 'media_hold', 'reporting_hold', 'suspension', 'ban'
  ) THEN
    RAISE EXCEPTION 'invalid enforcement' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_enforcement <> 'none' AND p_decision <> 'remove' THEN
    RAISE EXCEPTION 'account enforcement requires a removal decision'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN public.decide_moderation_case_internal(
    p_case_id,
    p_expected_version,
    p_decision,
    p_policy_category,
    p_rationale,
    p_enforcement,
    p_enforcement_days
  );
END;
$$;
REVOKE ALL ON FUNCTION public.decide_moderation_case(uuid, integer, text, text, text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_moderation_case(uuid, integer, text, text, text, text, integer)
  TO authenticated, service_role;

-- Purging one case must not delete shared content or media while another case
-- on that content (or a child comment) still has an open, held, unapproved, or
-- unexpired retention obligation.
CREATE OR REPLACE FUNCTION public.purge_moderation_case(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case public.moderation_cases%ROWTYPE;
  v_content_removed boolean;
  v_references text[] := ARRAY[]::text[];
  v_reports integer := 0;
  v_evidence integer := 0;
  v_content_rows integer := 0;
  v_now timestamptz := now();
  v_reason text := NULL;
BEGIN
  SELECT * INTO v_case FROM public.moderation_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'skipped', 'reason', 'not_found'); END IF;

  IF v_case.disposition_state = 'purged' THEN v_reason := 'already_purged';
  ELSIF v_case.state <> 'closed' THEN v_reason := 'case_open';
  ELSIF v_case.legal_hold OR v_case.resolution = 'legal_escalation' THEN v_reason := 'legal_hold';
  ELSIF v_case.retention_expires_at IS NULL THEN v_reason := 'no_approved_retention_period';
  ELSIF v_case.retention_expires_at > v_now THEN v_reason := 'retention_period_active';
  ELSIF EXISTS (SELECT 1 FROM public.moderation_appeals WHERE case_id = v_case.id AND status = 'pending') THEN
    v_reason := 'appeal_open';
  ELSIF EXISTS (
    SELECT 1 FROM public.moderation_cases sibling
    WHERE sibling.entity_type = v_case.entity_type AND sibling.entity_id = v_case.entity_id
      AND sibling.id <> v_case.id
      AND sibling.disposition_state <> 'purged'
      AND (
        sibling.state <> 'closed'
        OR sibling.legal_hold
        OR sibling.resolution = 'legal_escalation'
        OR sibling.retention_expires_at IS NULL
        OR sibling.retention_expires_at > v_now
        OR EXISTS (
          SELECT 1 FROM public.moderation_appeals sibling_appeal
          WHERE sibling_appeal.case_id = sibling.id AND sibling_appeal.status = 'pending'
        )
      )
  ) THEN v_reason := 'linked_case_retention_active';
  ELSIF v_case.entity_type = 'community_post' AND EXISTS (
    SELECT 1 FROM public.moderation_cases comment_case
    JOIN public.community_comments comment ON comment.id = comment_case.entity_id
    WHERE comment_case.entity_type = 'community_comment' AND comment.post_id = v_case.entity_id
      AND comment_case.disposition_state <> 'purged'
      AND (
        comment_case.state <> 'closed'
        OR comment_case.legal_hold
        OR comment_case.resolution = 'legal_escalation'
        OR comment_case.retention_expires_at IS NULL
        OR comment_case.retention_expires_at > v_now
        OR EXISTS (
          SELECT 1 FROM public.moderation_appeals comment_appeal
          WHERE comment_appeal.case_id = comment_case.id AND comment_appeal.status = 'pending'
        )
      )
  ) THEN v_reason := 'comment_case_retention_active';
  ELSIF EXISTS (
    SELECT 1 FROM public.moderation_items item
    WHERE item.status = 'legal_hold'
      AND ((item.entity_type = v_case.entity_type AND item.entity_id = v_case.entity_id)
        OR (v_case.entity_type = 'community_post' AND item.entity_type = 'community_post_media'
            AND item.entity_id IN (SELECT id FROM public.community_post_media WHERE post_id = v_case.entity_id))
        OR (v_case.entity_type = 'community_post' AND item.entity_type = 'community_comment'
            AND item.entity_id IN (SELECT id FROM public.community_comments WHERE post_id = v_case.entity_id)))
  ) THEN v_reason := 'media_or_item_legal_hold';
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'skipped', 'reason', v_reason);
  END IF;

  v_content_removed := v_case.resolution IN ('violation_removed', 'appeal_upheld');
  IF v_content_removed THEN
    SELECT COALESCE(array_agg(DISTINCT reference), ARRAY[]::text[]) INTO v_references
    FROM (
      SELECT media.url AS reference FROM public.community_post_media media
      WHERE v_case.entity_type = 'community_post' AND media.post_id = v_case.entity_id
      UNION
      SELECT media.display_reference FROM public.community_post_media media
      WHERE v_case.entity_type = 'community_post' AND media.post_id = v_case.entity_id
        AND media.display_reference IS NOT NULL
      UNION
      SELECT ref->>'url' FROM public.moderation_evidence evidence
      CROSS JOIN LATERAL jsonb_array_elements(evidence.media_references) AS ref
      WHERE evidence.case_id = v_case.id AND ref->>'url' IS NOT NULL
    ) refs;

    INSERT INTO public.storage_cleanup_jobs (storage_reference, reason, status, next_attempt_at)
    SELECT reference, 'retention_purge', 'pending', v_now
    FROM unnest(v_references) AS reference
    WHERE reference ~ '^(https://|r2-private:///)'
    ON CONFLICT (storage_reference) DO UPDATE
      SET status = 'pending', reason = 'retention_purge', next_attempt_at = v_now, completed_at = NULL;

    IF v_case.entity_type = 'community_post' THEN
      DELETE FROM public.community_posts WHERE id = v_case.entity_id;
    ELSE
      DELETE FROM public.community_comments WHERE id = v_case.entity_id;
    END IF;
    GET DIAGNOSTICS v_content_rows = ROW_COUNT;

    UPDATE public.moderation_items
    SET content_preview = NULL, raw_result = '{}'::jsonb, evidence_reference = NULL
    WHERE id = v_case.moderation_item_id;
  END IF;

  DELETE FROM public.moderation_reports WHERE case_id = v_case.id;
  GET DIAGNOSTICS v_reports = ROW_COUNT;
  DELETE FROM public.moderation_evidence WHERE case_id = v_case.id;
  GET DIAGNOSTICS v_evidence = ROW_COUNT;

  UPDATE public.moderation_cases
  SET disposition_state = 'purged', updated_at = v_now
  WHERE id = v_case.id;

  INSERT INTO public.moderation_events (
    moderation_item_id, case_id, revision_id, actor_type, event_type,
    previous_status, next_status, metadata
  ) VALUES (
    v_case.moderation_item_id, v_case.id, v_case.revision_id, 'system', 'evidence_purged',
    'closed', 'closed',
    jsonb_build_object('contentRemoved', v_content_removed, 'objectsQueued', COALESCE(array_length(v_references, 1), 0),
                       'reportsDeleted', v_reports, 'evidenceDeleted', v_evidence, 'basis', v_case.retention_basis)
  );
  INSERT INTO public.retention_purge_events (entity_type, entity_id, case_id, basis, summary)
  VALUES (
    'moderation_case', v_case.id, v_case.id, v_case.retention_basis,
    jsonb_build_object('entityType', v_case.entity_type, 'entityId', v_case.entity_id,
                       'contentRemoved', v_content_removed, 'contentRowsDeleted', v_content_rows,
                       'objectsQueued', COALESCE(array_length(v_references, 1), 0),
                       'reportsDeleted', v_reports, 'evidenceDeleted', v_evidence)
  );

  RETURN jsonb_build_object(
    'outcome', 'purged', 'contentRemoved', v_content_removed, 'contentRowsDeleted', v_content_rows,
    'objectsQueued', COALESCE(array_length(v_references, 1), 0),
    'reportsDeleted', v_reports, 'evidenceDeleted', v_evidence
  );
END;
$$;
REVOKE ALL ON FUNCTION public.purge_moderation_case(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_moderation_case(uuid) TO service_role;

COMMIT;
