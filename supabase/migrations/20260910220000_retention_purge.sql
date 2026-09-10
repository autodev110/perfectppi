BEGIN;

-- ---------------------------------------------------------------------------
-- Retention and controlled purge (plan 14.6, 19.3, 19.4, 36.5).
--
-- Nothing in the ordinary application path hard-deletes moderation evidence
-- or community content. Two SECURITY DEFINER purge functions, callable only
-- by the service role from the retention worker, may do so, and only after
-- re-checking every prerequisite themselves:
--   * a closed moderation case whose approved retention period has passed;
--   * an author-archived, never-reported post older than 30 days.
-- `retention_expires_at = NULL` means "not eligible", never "purge now". No
-- period is seeded: the register records the closed-case period as pending
-- Trust & Safety / counsel approval, so cases keep NULL until a policy row is
-- recorded through the audited RPC below.
-- ---------------------------------------------------------------------------

-- 1. Approved retention periods per basis (moderation_cases.retention_basis).
CREATE TABLE public.moderation_retention_policies (
  basis text PRIMARY KEY CHECK (basis ~ '^[a-z][a-z0-9_]{2,63}$'),
  retention_days integer NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  approval_reference text NOT NULL CHECK (char_length(approval_reference) BETWEEN 10 AND 500),
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.moderation_retention_policy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  basis text NOT NULL,
  action text NOT NULL CHECK (action IN ('set', 'cleared')),
  retention_days integer,
  approval_reference text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER moderation_retention_policy_events_immutable
  BEFORE UPDATE OR DELETE ON public.moderation_retention_policy_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_moderation_admin_history_mutation();

-- 2. Durable purge record. A purge that cannot write this row does not happen.
CREATE TABLE public.retention_purge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('community_post', 'community_comment', 'moderation_case')),
  entity_id uuid NOT NULL,
  case_id uuid,
  basis text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retention_purge_events_created_idx ON public.retention_purge_events(created_at DESC);
CREATE TRIGGER retention_purge_events_immutable
  BEFORE UPDATE OR DELETE ON public.retention_purge_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_moderation_admin_history_mutation();

-- 3. Policy administration: admin role plus the legal-hold reviewer
--    capability (the designated safety/legal role), always with a reference to
--    the approval. Setting a policy stamps expiry on already-closed cases;
--    clearing it withdraws eligibility from anything not yet purged.
CREATE OR REPLACE FUNCTION public.set_moderation_retention_policy(
  p_basis text,
  p_retention_days integer,
  p_approval_reference text
)
RETURNS public.moderation_retention_policies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_row public.moderation_retention_policies%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin'
     OR NOT public.moderation_has_capability(v_actor, 'legal_hold_review') THEN
    RAISE EXCEPTION 'legal_hold_review capability required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.moderation_retention_policies (basis, retention_days, approval_reference, approved_by)
  VALUES (p_basis, p_retention_days, trim(p_approval_reference), v_actor)
  ON CONFLICT (basis) DO UPDATE
    SET retention_days = EXCLUDED.retention_days,
        approval_reference = EXCLUDED.approval_reference,
        approved_by = EXCLUDED.approved_by,
        approved_at = now(),
        updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO public.moderation_retention_policy_events (basis, action, retention_days, approval_reference, actor_id)
  VALUES (p_basis, 'set', p_retention_days, trim(p_approval_reference), v_actor);

  -- Closed, unheld, unpurged cases on this basis become eligible at
  -- closed_at + period; anything else stays NULL.
  UPDATE public.moderation_cases
  SET retention_expires_at = closed_at + make_interval(days => p_retention_days),
      updated_at = now()
  WHERE retention_basis = p_basis
    AND state = 'closed'
    AND closed_at IS NOT NULL
    AND legal_hold = false
    AND resolution <> 'legal_escalation'
    AND disposition_state = 'retained';

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_moderation_retention_policy(
  p_basis text,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_deleted integer;
BEGIN
  IF v_actor IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin'
     OR NOT public.moderation_has_capability(v_actor, 'legal_hold_review') THEN
    RAISE EXCEPTION 'legal_hold_review capability required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(trim(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'a reason of at least 10 characters is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  DELETE FROM public.moderation_retention_policies WHERE basis = p_basis;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RETURN false; END IF;

  INSERT INTO public.moderation_retention_policy_events (basis, action, approval_reference, actor_id)
  VALUES (p_basis, 'cleared', trim(p_reason), v_actor);

  UPDATE public.moderation_cases
  SET retention_expires_at = NULL, updated_at = now()
  WHERE retention_basis = p_basis AND disposition_state <> 'purged';
  RETURN true;
END;
$$;

-- 4. Stamp expiry on closure when a policy exists; a hold or a reopened case
--    always clears it (plan 19.3: a legal hold overrides ordinary expiry).
CREATE OR REPLACE FUNCTION public.stamp_moderation_case_retention()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_days integer;
BEGIN
  IF NEW.legal_hold OR NEW.state <> 'closed' OR NEW.resolution = 'legal_escalation' THEN
    NEW.retention_expires_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.disposition_state = 'purged' THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' OR OLD.state <> 'closed' OR OLD.legal_hold) AND NEW.closed_at IS NOT NULL THEN
    SELECT retention_days INTO v_days
    FROM public.moderation_retention_policies WHERE basis = NEW.retention_basis;
    NEW.retention_expires_at := CASE WHEN v_days IS NULL THEN NULL
      ELSE NEW.closed_at + make_interval(days => v_days) END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER moderation_cases_stamp_retention
  BEFORE INSERT OR UPDATE OF state, legal_hold, closed_at, resolution ON public.moderation_cases
  FOR EACH ROW EXECUTE FUNCTION public.stamp_moderation_case_retention();

-- 5. Storage references that must survive an account deletion because a
--    not-yet-purged case still relies on them (plan 19.4).
CREATE OR REPLACE FUNCTION public.retained_evidence_references_for_profile(p_profile_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH retained_cases AS (
    SELECT moderation_case.id, moderation_case.entity_type, moderation_case.entity_id
    FROM public.moderation_cases moderation_case
    JOIN public.moderation_items item ON item.id = moderation_case.moderation_item_id
    WHERE item.author_id = p_profile_id
      AND moderation_case.disposition_state <> 'purged'
  ),
  live_media AS (
    SELECT media.url AS reference FROM public.community_post_media media
    JOIN retained_cases rc ON rc.entity_type = 'community_post' AND rc.entity_id = media.post_id
    UNION
    SELECT media.display_reference FROM public.community_post_media media
    JOIN retained_cases rc ON rc.entity_type = 'community_post' AND rc.entity_id = media.post_id
    WHERE media.display_reference IS NOT NULL
  ),
  evidence_media AS (
    SELECT ref->>'url' AS reference
    FROM public.moderation_evidence evidence
    JOIN retained_cases rc ON rc.id = evidence.case_id
    CROSS JOIN LATERAL jsonb_array_elements(evidence.media_references) AS ref
    WHERE ref->>'url' IS NOT NULL
  )
  SELECT COALESCE(array_agg(DISTINCT reference), ARRAY[]::text[])
  FROM (SELECT reference FROM live_media UNION SELECT reference FROM evidence_media) refs;
$$;

-- 6. Case purge. Returns {outcome: purged|skipped, reason, ...counts}; never
--    raises for an ineligible case so the worker can continue and report.
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
      AND (sibling.state <> 'closed' OR sibling.legal_hold OR sibling.resolution = 'legal_escalation')
  ) THEN v_reason := 'linked_case_open_or_held';
  ELSIF v_case.entity_type = 'community_post' AND EXISTS (
    SELECT 1 FROM public.moderation_cases comment_case
    JOIN public.community_comments comment ON comment.id = comment_case.entity_id
    WHERE comment_case.entity_type = 'community_comment' AND comment.post_id = v_case.entity_id
      AND (comment_case.state <> 'closed' OR comment_case.legal_hold)
  ) THEN v_reason := 'comment_case_open_or_held';
  ELSIF EXISTS (
    SELECT 1 FROM public.moderation_items item
    WHERE item.status = 'legal_hold'
      AND ((item.entity_type = v_case.entity_type AND item.entity_id = v_case.entity_id)
        OR (v_case.entity_type = 'community_post' AND item.entity_type = 'community_post_media'
            AND item.entity_id IN (SELECT id FROM public.community_post_media WHERE post_id = v_case.entity_id)))
  ) THEN v_reason := 'media_or_item_legal_hold';
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'skipped', 'reason', v_reason);
  END IF;

  v_content_removed := v_case.resolution IN ('violation_removed', 'appeal_upheld');

  -- Enumerate every object this purge is responsible for. Restored content
  -- stays live, so only its evidence rows go; removed content and its media
  -- objects go with it. Evidence references cover media whose rows were
  -- already cascaded away by an account deletion.
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

    -- Processor cleanup is queued durably before any row disappears.
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

-- 7. Archived-post purge (plan 14.6): author-archived, never reported, older
--    than 30 days. Any case on the post or its comments defers to the case
--    lifecycle instead.
CREATE OR REPLACE FUNCTION public.purge_archived_community_post(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.community_posts%ROWTYPE;
  v_references text[] := ARRAY[]::text[];
  v_now timestamptz := now();
  v_reason text := NULL;
BEGIN
  SELECT * INTO v_post FROM public.community_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'skipped', 'reason', 'not_found'); END IF;

  IF v_post.status <> 'archived' THEN v_reason := 'not_archived';
  ELSIF v_post.updated_at > v_now - interval '30 days' THEN v_reason := 'restorable_window_active';
  ELSIF EXISTS (
    SELECT 1 FROM public.moderation_cases moderation_case
    WHERE (moderation_case.entity_type = 'community_post' AND moderation_case.entity_id = v_post.id)
       OR (moderation_case.entity_type = 'community_comment'
           AND moderation_case.entity_id IN (SELECT id FROM public.community_comments WHERE post_id = v_post.id))
  ) THEN v_reason := 'has_moderation_case';
  ELSIF EXISTS (
    SELECT 1 FROM public.moderation_items item
    WHERE item.status IN ('legal_hold', 'pending_review', 'rejected')
      AND ((item.entity_type = 'community_post' AND item.entity_id = v_post.id)
        OR (item.entity_type = 'community_post_media'
            AND item.entity_id IN (SELECT id FROM public.community_post_media WHERE post_id = v_post.id))
        OR (item.entity_type = 'community_comment'
            AND item.entity_id IN (SELECT id FROM public.community_comments WHERE post_id = v_post.id)))
  ) THEN v_reason := 'moderation_item_not_clear';
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'skipped', 'reason', v_reason);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT reference), ARRAY[]::text[]) INTO v_references
  FROM (
    SELECT url AS reference FROM public.community_post_media WHERE post_id = v_post.id
    UNION
    SELECT display_reference FROM public.community_post_media
    WHERE post_id = v_post.id AND display_reference IS NOT NULL
  ) refs;

  INSERT INTO public.storage_cleanup_jobs (storage_reference, reason, status, next_attempt_at)
  SELECT reference, 'retention_purge', 'pending', v_now
  FROM unnest(v_references) AS reference
  WHERE reference ~ '^(https://|r2-private:///)'
  ON CONFLICT (storage_reference) DO UPDATE
    SET status = 'pending', reason = 'retention_purge', next_attempt_at = v_now, completed_at = NULL;

  DELETE FROM public.community_posts WHERE id = v_post.id;

  UPDATE public.moderation_items
  SET content_preview = NULL, raw_result = '{}'::jsonb, evidence_reference = NULL
  WHERE entity_type = 'community_post' AND entity_id = v_post.id;

  INSERT INTO public.retention_purge_events (entity_type, entity_id, case_id, basis, summary)
  VALUES (
    'community_post', v_post.id, NULL, 'archived_post_30d',
    jsonb_build_object('objectsQueued', COALESCE(array_length(v_references, 1), 0),
                       'archivedAt', v_post.updated_at)
  );

  RETURN jsonb_build_object('outcome', 'purged', 'objectsQueued', COALESCE(array_length(v_references, 1), 0));
END;
$$;

-- 8. Readiness / status for the admin page and the worker.
CREATE OR REPLACE FUNCTION public.retention_purge_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'closedCasesAwaitingPolicy', (
      SELECT count(*) FROM public.moderation_cases
      WHERE state = 'closed' AND legal_hold = false AND resolution <> 'legal_escalation'
        AND disposition_state = 'retained' AND retention_expires_at IS NULL
    ),
    'casesEligibleNow', (
      SELECT count(*) FROM public.moderation_cases
      WHERE state = 'closed' AND legal_hold = false AND disposition_state = 'retained'
        AND retention_expires_at IS NOT NULL AND retention_expires_at <= now()
    ),
    'casesPurged', (SELECT count(*) FROM public.moderation_cases WHERE disposition_state = 'purged'),
    'casesUnderLegalHold', (SELECT count(*) FROM public.moderation_cases WHERE legal_hold),
    'archivedPostsEligibleNow', (
      SELECT count(*) FROM public.community_posts post
      WHERE post.status = 'archived' AND post.updated_at <= now() - interval '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_cases moderation_case
          WHERE moderation_case.entity_type = 'community_post' AND moderation_case.entity_id = post.id
        )
    ),
    'purgeEventsLast30d', (
      SELECT count(*) FROM public.retention_purge_events WHERE created_at >= now() - interval '30 days'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges: purge functions and status are service-only; policy RPCs are
-- callable by authenticated users but gate themselves on the capability.
-- ---------------------------------------------------------------------------
ALTER TABLE public.moderation_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_retention_policy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_purge_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_retention_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.moderation_retention_policy_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.retention_purge_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.moderation_retention_policies TO service_role;
GRANT SELECT ON public.moderation_retention_policy_events TO service_role;
GRANT SELECT ON public.retention_purge_events TO service_role;

REVOKE ALL ON FUNCTION public.stamp_moderation_case_retention() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_moderation_retention_policy(text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_moderation_retention_policy(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retained_evidence_references_for_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_moderation_case(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_archived_community_post(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retention_purge_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_moderation_retention_policy(text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_moderation_retention_policy(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retained_evidence_references_for_profile(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_moderation_case(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_archived_community_post(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.retention_purge_status() TO service_role;

COMMENT ON TABLE public.moderation_retention_policies IS
  'Approved retention periods by basis. Empty until Trust & Safety/counsel record a period; NULL expiry means not eligible for purge.';
COMMENT ON TABLE public.retention_purge_events IS
  'Append-only record of every controlled purge performed by the retention worker.';

COMMIT;
