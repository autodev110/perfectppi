\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ob-admin@example.test', '',
   '{}', '{"username":"OutboxAdmin"}', now(), now()),
  ('61000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ob-author@example.test', '',
   '{}', '{"username":"OutboxAuthor"}', now(), now()),
  ('61000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ob-reporter@example.test', '',
   '{}', '{"username":"OutboxReporter"}', now(), now());
SELECT set_config('test.admin_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '61000000-0000-0000-0000-000000000001'), true);
SELECT set_config('test.author_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '61000000-0000-0000-0000-000000000002'), true);
SELECT set_config('test.reporter_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '61000000-0000-0000-0000-000000000003'), true);
UPDATE public.profiles SET role = 'admin' WHERE id = current_setting('test.admin_id')::uuid;
UPDATE public.profiles SET is_public = true, default_post_audience = 'public'
WHERE id IN (current_setting('test.author_id')::uuid, current_setting('test.reporter_id')::uuid);

INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status) VALUES
  ('61100000-0000-0000-0000-000000000001', current_setting('test.author_id')::uuid, 'Ordinary report', 'public', 'active', 'active'),
  ('61100000-0000-0000-0000-000000000002', current_setting('test.author_id')::uuid, 'Urgent report', 'public', 'active', 'active');

-- Every new report enqueues exactly one receipt for its reporter; the case
-- opening enqueues one moderator alert.
SELECT public.submit_moderation_report(current_setting('test.reporter_id')::uuid, 'community_post', '61100000-0000-0000-0000-000000000001',
  (SELECT active_revision_id FROM public.community_posts WHERE id = '61100000-0000-0000-0000-000000000001'), 'spam', NULL, 'ob-test-report-0000000000001');
SELECT public.submit_moderation_report(current_setting('test.reporter_id')::uuid, 'community_post', '61100000-0000-0000-0000-000000000002',
  (SELECT active_revision_id FROM public.community_posts WHERE id = '61100000-0000-0000-0000-000000000002'), 'violence', NULL, 'ob-test-report-0000000000002');
SELECT set_config('test.case_normal', (SELECT id::text FROM public.moderation_cases WHERE entity_id = '61100000-0000-0000-0000-000000000001'), true);
SELECT set_config('test.case_urgent', (SELECT id::text FROM public.moderation_cases WHERE entity_id = '61100000-0000-0000-0000-000000000002'), true);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.moderation_outbox WHERE event_type = 'report_received'
      AND payload->>'reporterId' = current_setting('test.reporter_id')) <> 2 THEN
    RAISE EXCEPTION 'reporter receipts were not enqueued once per report';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_outbox WHERE case_id = current_setting('test.case_normal')::uuid AND event_type = 'case_opened')
     OR NOT EXISTS (SELECT 1 FROM public.moderation_outbox WHERE case_id = current_setting('test.case_urgent')::uuid AND event_type = 'case_escalated') THEN
    RAISE EXCEPTION 'moderator alerts were not enqueued for new cases';
  END IF;
END
$$;

-- Deciding a case enqueues the author notice and the reporters' completion
-- notice exactly once, even though decide() and the trigger both insert.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT public.grant_moderation_capability(current_setting('test.admin_id')::uuid, 'queue_read', 'outbox test: queue access');
SELECT public.grant_moderation_capability(current_setting('test.admin_id')::uuid, 'content_decide', 'outbox test: decisions');
SELECT public.decide_moderation_case(current_setting('test.case_normal')::uuid, 1, 'remove', 'spam', 'confirmed spam listing', 'none', 7);
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.moderation_outbox WHERE case_id = current_setting('test.case_normal')::uuid AND event_type = 'author_removed') <> 1 THEN
    RAISE EXCEPTION 'author decision notice was not enqueued exactly once';
  END IF;
  IF (SELECT count(*) FROM public.moderation_outbox WHERE case_id = current_setting('test.case_normal')::uuid AND event_type = 'reporters_review_complete') <> 1 THEN
    RAISE EXCEPTION 'reporter completion notice was not enqueued exactly once';
  END IF;
  IF EXISTS (SELECT 1 FROM public.moderation_outbox WHERE case_id = current_setting('test.case_normal')::uuid AND event_type = 'author_restored') THEN
    RAISE EXCEPTION 'wrong author notice for a removal';
  END IF;
END
$$;

-- Claiming leases rows atomically; a second claim in the lease window sees
-- nothing; completion and failure transition correctly; repeated failure
-- dead-letters.
DO $$
DECLARE
  first_count integer;
  second_count integer;
  v_id uuid;
  v_row public.moderation_outbox%ROWTYPE;
BEGIN
  SELECT count(*) INTO first_count FROM public.claim_moderation_outbox(100, 'worker-a');
  IF first_count < 5 THEN RAISE EXCEPTION 'expected to claim the queued jobs, got %', first_count; END IF;
  SELECT count(*) INTO second_count FROM public.claim_moderation_outbox(100, 'worker-b');
  IF second_count <> 0 THEN RAISE EXCEPTION 'lease was not respected: % re-claimed', second_count; END IF;
  IF EXISTS (SELECT 1 FROM public.moderation_outbox WHERE status = 'processing' AND locked_by IS DISTINCT FROM 'worker-a') THEN
    RAISE EXCEPTION 'claimed rows are not attributed to the worker';
  END IF;

  SELECT id INTO v_id FROM public.moderation_outbox WHERE event_type = 'author_removed' LIMIT 1;
  v_row := public.complete_moderation_outbox(v_id, true, NULL);
  IF v_row.status <> 'completed' OR v_row.completed_at IS NULL THEN RAISE EXCEPTION 'completion did not record'; END IF;

  SELECT id INTO v_id FROM public.moderation_outbox WHERE event_type = 'report_received' LIMIT 1;
  v_row := public.complete_moderation_outbox(v_id, false, 'push provider 503');
  IF v_row.status <> 'failed' OR v_row.last_error <> 'push provider 503' OR v_row.dead_lettered_at IS NOT NULL
     OR v_row.next_attempt_at <= now() THEN
    RAISE EXCEPTION 'failure did not schedule a retry: %', v_row;
  END IF;
  -- Not claimable until the backoff elapses.
  IF EXISTS (SELECT 1 FROM public.claim_moderation_outbox(100, 'worker-c') WHERE id = v_id) THEN
    RAISE EXCEPTION 'failed job was reclaimed before its backoff';
  END IF;
  -- Exhaust attempts: dead-lettered and never claimable again.
  UPDATE public.moderation_outbox SET attempt_count = 8, next_attempt_at = now() - interval '1 minute' WHERE id = v_id;
  v_row := public.complete_moderation_outbox(v_id, false, 'still failing');
  IF v_row.dead_lettered_at IS NULL THEN RAISE EXCEPTION 'job was not dead-lettered after max attempts'; END IF;
  UPDATE public.moderation_outbox SET next_attempt_at = now() - interval '1 minute' WHERE id = v_id;
  IF EXISTS (SELECT 1 FROM public.claim_moderation_outbox(100, 'worker-d') WHERE id = v_id) THEN
    RAISE EXCEPTION 'dead-lettered job was claimed';
  END IF;
  -- A lapsed lease is reclaimable.
  UPDATE public.moderation_outbox SET next_attempt_at = now() - interval '1 minute'
  WHERE status = 'processing' AND locked_by = 'worker-a';
  IF (SELECT count(*) FROM public.claim_moderation_outbox(100, 'worker-e')) = 0 THEN
    RAISE EXCEPTION 'lapsed leases were not reclaimed';
  END IF;
END
$$;

-- SLA alerts: urgent unacknowledged after 15 minutes, approaching within 2h,
-- overdue with an audited escalation to high priority; all idempotent.
UPDATE public.moderation_cases SET created_at = now() - interval '20 minutes'
WHERE id = current_setting('test.case_urgent')::uuid;
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
VALUES ('61100000-0000-0000-0000-000000000003', current_setting('test.author_id')::uuid, 'Overdue report', 'public', 'active', 'active');
SELECT public.submit_moderation_report(current_setting('test.reporter_id')::uuid, 'community_post', '61100000-0000-0000-0000-000000000003',
  (SELECT active_revision_id FROM public.community_posts WHERE id = '61100000-0000-0000-0000-000000000003'), 'harassment', NULL, 'ob-test-report-0000000000003');
SELECT set_config('test.case_overdue', (SELECT id::text FROM public.moderation_cases WHERE entity_id = '61100000-0000-0000-0000-000000000003'), true);
UPDATE public.moderation_cases SET sla_due_at = now() - interval '1 hour' WHERE id = current_setting('test.case_overdue')::uuid;
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
VALUES ('61100000-0000-0000-0000-000000000004', current_setting('test.author_id')::uuid, 'Approaching report', 'public', 'active', 'active');
SELECT public.submit_moderation_report(current_setting('test.reporter_id')::uuid, 'community_post', '61100000-0000-0000-0000-000000000004',
  (SELECT active_revision_id FROM public.community_posts WHERE id = '61100000-0000-0000-0000-000000000004'), 'harassment', NULL, 'ob-test-report-0000000000004');
SELECT set_config('test.case_soon', (SELECT id::text FROM public.moderation_cases WHERE entity_id = '61100000-0000-0000-0000-000000000004'), true);
UPDATE public.moderation_cases SET sla_due_at = now() + interval '90 minutes' WHERE id = current_setting('test.case_soon')::uuid;

DO $$
DECLARE
  first jsonb := public.enqueue_moderation_sla_alerts();
  again jsonb;
BEGIN
  IF (first->>'urgentUnacknowledged')::int < 1 THEN RAISE EXCEPTION 'urgent unacknowledged alert missing: %', first; END IF;
  IF (first->>'approaching')::int < 1 THEN RAISE EXCEPTION 'approaching alert missing: %', first; END IF;
  IF (first->>'overdue')::int < 1 THEN RAISE EXCEPTION 'overdue alert missing: %', first; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_outbox
                 WHERE case_id = current_setting('test.case_urgent')::uuid AND event_type = 'sla_alert'
                   AND payload->>'stage' = 'urgent_unacknowledged') THEN
    RAISE EXCEPTION 'urgent alert not attached to the urgent case';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_cases
                 WHERE id = current_setting('test.case_overdue')::uuid AND priority = 'high') THEN
    RAISE EXCEPTION 'overdue case was not escalated to high';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_events
                 WHERE case_id = current_setting('test.case_overdue')::uuid AND event_type = 'escalated'
                   AND metadata->>'reason' = 'sla_overdue') THEN
    RAISE EXCEPTION 'SLA escalation was not audited';
  END IF;
  again := public.enqueue_moderation_sla_alerts();
  IF (again->>'urgentUnacknowledged')::int <> 0 OR (again->>'approaching')::int <> 0 OR (again->>'overdue')::int <> 0
     OR (again->>'escalated')::int <> 0 THEN
    RAISE EXCEPTION 'SLA alerts are not idempotent: %', again;
  END IF;
END
$$;

-- Backlog guardrail: exceeding 25 open cases raises one alert per hour.
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT ('6110000a-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, current_setting('test.author_id')::uuid,
  'Backlog post ' || n, 'public', 'active', 'active'
FROM generate_series(1, 26) AS n;
-- One reporter would trip the 10/hour report limit, so each report is
-- back-dated as it is created: the fixture models a backlog, not abuse.
DO $$
DECLARE n integer;
BEGIN
  FOR n IN 1..26 LOOP
    PERFORM public.submit_moderation_report(
      current_setting('test.reporter_id')::uuid, 'community_post',
      ('6110000a-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
      (SELECT active_revision_id FROM public.community_posts WHERE id = ('6110000a-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid),
      'spam', NULL, 'ob-test-backlog-' || lpad(n::text, 12, '0')
    );
    UPDATE public.moderation_reports SET created_at = created_at - interval '3 hours'
    WHERE reporter_id = current_setting('test.reporter_id')::uuid AND created_at > now() - interval '1 hour';
  END LOOP;
END
$$;
DO $$
DECLARE
  first jsonb;
  again jsonb;
BEGIN
  first := public.enqueue_moderation_sla_alerts();
  IF (first->>'openCases')::int <= 25 THEN RAISE EXCEPTION 'fixture did not exceed the backlog threshold: %', first; END IF;
  IF (first->>'backlogAlerts')::int <> 1 THEN RAISE EXCEPTION 'backlog alert not raised: %', first; END IF;
  again := public.enqueue_moderation_sla_alerts();
  IF (again->>'backlogAlerts')::int <> 0 THEN RAISE EXCEPTION 'backlog alert repeated within the hour: %', again; END IF;
  IF has_function_privilege('authenticated', 'public.claim_moderation_outbox(integer, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.enqueue_moderation_sla_alerts()', 'EXECUTE') THEN
    RAISE EXCEPTION 'outbox functions must be service-only';
  END IF;
END
$$;

ROLLBACK;
