BEGIN;

-- ---------------------------------------------------------------------------
-- Moderation outbox processing and SLA alerting (plan 17.3, 18.5, 20.3, 22.1,
-- 22.2, 29.8, 33).
--
-- Every notification that moderation produces is a durable outbox row first:
-- author decisions, reporter receipts and completion notices, moderator
-- new-case/escalation/SLA alerts, and queue-backlog guardrails. The worker
-- claims rows atomically, retries with backoff, dead-letters after repeated
-- failure, and never carries report reasons, reporter identity, or content
-- text in a push payload.
-- ---------------------------------------------------------------------------

-- In-app notification categories for the social/moderation surfaces. Values
-- added here are not used inside this transaction.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'moderation_decision';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'moderation_case';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'report_received';

ALTER TABLE public.moderation_outbox
  DROP CONSTRAINT IF EXISTS moderation_outbox_event_type_check;
ALTER TABLE public.moderation_outbox
  ADD CONSTRAINT moderation_outbox_event_type_check CHECK (event_type IN (
    'case_opened', 'case_escalated', 'author_restored', 'author_removed', 'sla_alert',
    'report_received', 'reporters_review_complete', 'queue_backlog'
  )),
  ADD COLUMN locked_by text,
  ADD COLUMN dead_lettered_at timestamptz;
CREATE INDEX moderation_outbox_dead_letter_idx
  ON public.moderation_outbox(dead_lettered_at) WHERE dead_lettered_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1. Enqueue from the data change, not from the caller. A reporter receipt
--    for every new report; author + reporter notices whenever a case closes;
--    on-call escalation whenever a case is escalated or an appeal opens.
--    Keys match the ones decide_moderation_case() already uses, so the two
--    paths converge on one row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_report_received()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.reporter_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
  VALUES (
    NEW.case_id, 'report_received',
    jsonb_build_object('reportId', NEW.id, 'reporterId', NEW.reporter_id, 'caseId', NEW.case_id),
    'report:' || NEW.id::text || ':received'
  ) ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER moderation_reports_enqueue_receipt
  AFTER INSERT ON public.moderation_reports
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_report_received();

CREATE OR REPLACE FUNCTION public.enqueue_moderation_case_outbox()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.state = 'closed' AND OLD.state <> 'closed' AND NEW.resolution IS NOT NULL THEN
    INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
    VALUES (
      NEW.id,
      CASE WHEN NEW.resolution IN ('no_violation_restored', 'appeal_overturned')
        THEN 'author_restored' ELSE 'author_removed' END,
      jsonb_build_object('caseId', NEW.id, 'entityType', NEW.entity_type, 'entityId', NEW.entity_id,
                         'resolution', NEW.resolution, 'decisionVersion', NEW.decision_version),
      NEW.id::text || ':decided:' || NEW.decision_version::text
    ) ON CONFLICT (idempotency_key) DO NOTHING;
    INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
    VALUES (
      NEW.id, 'reporters_review_complete',
      jsonb_build_object('caseId', NEW.id, 'decisionVersion', NEW.decision_version),
      NEW.id::text || ':reporters:' || NEW.decision_version::text
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  ELSIF NEW.state = 'escalated' AND OLD.state <> 'escalated' THEN
    INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
    VALUES (
      NEW.id, 'case_escalated',
      jsonb_build_object('caseId', NEW.id, 'priority', NEW.priority, 'reason', 'legal_hold'),
      NEW.id::text || ':escalated:' || NEW.decision_version::text
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  ELSIF NEW.state = 'appeal_open' AND OLD.state <> 'appeal_open' THEN
    INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
    VALUES (
      NEW.id, 'case_opened',
      jsonb_build_object('caseId', NEW.id, 'priority', NEW.priority, 'reason', 'appeal'),
      NEW.id::text || ':appeal:' || NEW.decision_version::text
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER moderation_cases_enqueue_outbox
  AFTER UPDATE OF state ON public.moderation_cases
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_moderation_case_outbox();

-- ---------------------------------------------------------------------------
-- 2. Atomic claim with a 10-minute lease. Rows whose lease lapsed while
--    processing are picked up again; dead-lettered rows never are.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_moderation_outbox(p_limit integer, p_worker text)
RETURNS SETOF public.moderation_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.moderation_outbox
    WHERE dead_lettered_at IS NULL
      AND next_attempt_at <= now()
      AND status IN ('pending', 'failed', 'processing')
    ORDER BY created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.moderation_outbox outbox
  SET status = 'processing',
      attempt_count = outbox.attempt_count + 1,
      next_attempt_at = now() + interval '10 minutes',
      locked_by = p_worker
  FROM candidates
  WHERE outbox.id = candidates.id
  RETURNING outbox.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_moderation_outbox(
  p_id uuid,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS public.moderation_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.moderation_outbox%ROWTYPE;
  v_max_attempts constant integer := 8;
BEGIN
  IF p_success THEN
    UPDATE public.moderation_outbox
    SET status = 'completed', completed_at = now(), last_error = NULL, locked_by = NULL
    WHERE id = p_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.moderation_outbox
    SET status = 'failed',
        last_error = left(COALESCE(p_error, 'unknown error'), 1000),
        locked_by = NULL,
        -- Exponential backoff: 1, 2, 4, ... minutes, capped at 24h.
        next_attempt_at = now() + make_interval(mins => LEAST(1440, power(2, LEAST(attempt_count, 11))::integer)),
        dead_lettered_at = CASE WHEN attempt_count >= v_max_attempts THEN now() ELSE dead_lettered_at END
    WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. SLA alerts (plan 18.5 / 20.3), generated idempotently per case and stage:
--    urgent and unclaimed for 15 minutes; due within two hours; overdue (and
--    escalated to high priority, audited). Plus an hourly backlog guardrail.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_moderation_sla_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
  v_urgent integer;
  v_approaching integer;
  v_overdue integer;
  v_escalated integer;
  v_open integer;
  v_old integer;
  v_backlog integer := 0;
  v_hour text := to_char(date_trunc('hour', v_now), 'YYYY-MM-DD"T"HH24');
  v_prev_hour text := to_char(date_trunc('hour', v_now) - interval '1 hour', 'YYYY-MM-DD"T"HH24');
BEGIN
  -- Urgent item unacknowledged for 15 minutes pages the on-call owner.
  WITH inserted AS (
    INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
    SELECT c.id, 'sla_alert',
      jsonb_build_object('caseId', c.id, 'stage', 'urgent_unacknowledged', 'priority', c.priority,
                         'slaDueAt', c.sla_due_at, 'state', c.state),
      'case:' || c.id::text || ':sla:urgent_unacknowledged'
    FROM public.moderation_cases c
    WHERE c.priority = 'urgent' AND c.state = 'open' AND c.created_at <= v_now - interval '15 minutes'
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_urgent FROM inserted;

  WITH inserted AS (
    INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
    SELECT c.id, 'sla_alert',
      jsonb_build_object('caseId', c.id, 'stage', 'approaching', 'priority', c.priority,
                         'slaDueAt', c.sla_due_at, 'state', c.state),
      'case:' || c.id::text || ':sla:approaching'
    FROM public.moderation_cases c
    WHERE c.state IN ('open', 'claimed', 'appeal_open', 'escalated')
      AND c.sla_due_at > v_now AND c.sla_due_at <= v_now + interval '2 hours'
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_approaching FROM inserted;

  WITH inserted AS (
    INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
    SELECT c.id, 'sla_alert',
      jsonb_build_object('caseId', c.id, 'stage', 'overdue', 'priority', c.priority,
                         'slaDueAt', c.sla_due_at, 'state', c.state),
      'case:' || c.id::text || ':sla:overdue'
    FROM public.moderation_cases c
    WHERE c.state IN ('open', 'claimed', 'appeal_open', 'escalated') AND c.sla_due_at <= v_now
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_overdue FROM inserted;

  -- Escalate overdue ordinary cases so they sort ahead of fresh work.
  WITH bumped AS (
    UPDATE public.moderation_cases c
    SET priority = 'high', updated_at = v_now
    WHERE c.state IN ('open', 'claimed', 'appeal_open') AND c.sla_due_at <= v_now AND c.priority = 'normal'
    RETURNING c.id, c.moderation_item_id, c.revision_id, c.state
  ), audited AS (
    INSERT INTO public.moderation_events (
      moderation_item_id, case_id, revision_id, actor_type, event_type, previous_status, next_status, metadata
    )
    SELECT moderation_item_id, id, revision_id, 'system', 'escalated', state, state,
      jsonb_build_object('reason', 'sla_overdue', 'priority', 'high')
    FROM bumped
    RETURNING 1
  ) SELECT count(*) INTO v_escalated FROM audited;

  -- Backlog guardrail: >25 open cases, or >20% of ordinary cases past the
  -- 24-hour target. Alerted once per hour; "sustained" when the previous
  -- hour alerted too (the plan's two-consecutive-hours rule).
  SELECT count(*), count(*) FILTER (WHERE c.priority <> 'urgent' AND c.created_at <= v_now - interval '24 hours')
  INTO v_open, v_old
  FROM public.moderation_cases c
  WHERE c.state IN ('open', 'claimed', 'appeal_open');
  IF v_open > 25 OR (v_open > 0 AND v_old::numeric / v_open > 0.2) THEN
    INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
    SELECT c.id, 'queue_backlog',
      jsonb_build_object('openCases', v_open, 'casesOver24h', v_old, 'hour', v_hour,
                         'sustained', EXISTS (SELECT 1 FROM public.moderation_outbox
                                              WHERE idempotency_key = 'backlog:' || v_prev_hour)),
      'backlog:' || v_hour
    FROM public.moderation_cases c
    WHERE c.state IN ('open', 'claimed', 'appeal_open')
    ORDER BY c.created_at LIMIT 1
    ON CONFLICT (idempotency_key) DO NOTHING;
    GET DIAGNOSTICS v_backlog = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'urgentUnacknowledged', v_urgent, 'approaching', v_approaching, 'overdue', v_overdue,
    'escalated', v_escalated, 'backlogAlerts', v_backlog, 'openCases', v_open, 'casesOver24h', v_old
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Operations status for the admin surface (plan 33: retry/dead-letter
--    visibility and SLA alerts).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.moderation_operations_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'outboxPending', (SELECT count(*) FROM public.moderation_outbox WHERE status IN ('pending', 'failed') AND dead_lettered_at IS NULL),
    'outboxProcessing', (SELECT count(*) FROM public.moderation_outbox WHERE status = 'processing'),
    'outboxDeadLettered', (SELECT count(*) FROM public.moderation_outbox WHERE dead_lettered_at IS NOT NULL),
    'outboxOldestPendingMinutes', (
      SELECT COALESCE(floor(extract(epoch FROM now() - min(created_at)) / 60), 0)::integer
      FROM public.moderation_outbox WHERE status IN ('pending', 'failed') AND dead_lettered_at IS NULL
    ),
    'casesOpen', (SELECT count(*) FROM public.moderation_cases WHERE state IN ('open', 'claimed', 'appeal_open')),
    'casesOverdue', (SELECT count(*) FROM public.moderation_cases WHERE state IN ('open', 'claimed', 'appeal_open', 'escalated') AND sla_due_at <= now()),
    'casesDueWithin2h', (SELECT count(*) FROM public.moderation_cases WHERE state IN ('open', 'claimed', 'appeal_open', 'escalated') AND sla_due_at > now() AND sla_due_at <= now() + interval '2 hours'),
    'urgentUnacknowledged', (SELECT count(*) FROM public.moderation_cases WHERE priority = 'urgent' AND state = 'open' AND created_at <= now() - interval '15 minutes'),
    'casesOver24hShare', (
      SELECT CASE WHEN count(*) = 0 THEN 0
        ELSE round(100.0 * count(*) FILTER (WHERE priority <> 'urgent' AND created_at <= now() - interval '24 hours') / count(*)) END
      FROM public.moderation_cases WHERE state IN ('open', 'claimed', 'appeal_open')
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Purge pre-check refinements from the retention self-audit (forward-only
--    because 20260910220000 may already be applied): a legal hold on any
--    comment under a post also blocks the case purge instead of raising from
--    the cascade, and only a legal hold — not a stale media scan or an
--    auto-rejected upload — blocks disposal of an unreported archived post.
-- ---------------------------------------------------------------------------
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
            AND item.entity_id IN (SELECT id FROM public.community_post_media WHERE post_id = v_case.entity_id))
        OR (v_case.entity_type = 'community_post' AND item.entity_type = 'community_comment'
            AND item.entity_id IN (SELECT id FROM public.community_comments WHERE post_id = v_case.entity_id)))
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
    -- Only a legal hold blocks disposal; a stale media scan or an
    -- auto-rejected upload is not evidence the retention register keeps.
    SELECT 1 FROM public.moderation_items item
    WHERE item.status = 'legal_hold'
      AND ((item.entity_type = 'community_post' AND item.entity_id = v_post.id)
        OR (item.entity_type = 'community_post_media'
            AND item.entity_id IN (SELECT id FROM public.community_post_media WHERE post_id = v_post.id))
        OR (item.entity_type = 'community_comment'
            AND item.entity_id IN (SELECT id FROM public.community_comments WHERE post_id = v_post.id)))
  ) THEN v_reason := 'legal_hold';
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

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.enqueue_report_received() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_moderation_case_outbox() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_moderation_outbox(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_moderation_outbox(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_moderation_sla_alerts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.moderation_operations_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_moderation_outbox(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_moderation_outbox(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_moderation_sla_alerts() TO service_role;
GRANT EXECUTE ON FUNCTION public.moderation_operations_status() TO service_role;

COMMIT;
