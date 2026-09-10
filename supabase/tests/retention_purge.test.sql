\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ret-admin@example.test', '',
   '{}', '{"username":"RetAdmin"}', now(), now()),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ret-author@example.test', '',
   '{}', '{"username":"RetAuthor"}', now(), now()),
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ret-reporter@example.test', '',
   '{}', '{"username":"RetReporter"}', now(), now());
SELECT set_config('test.admin_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '60000000-0000-0000-0000-000000000001'), true);
SELECT set_config('test.author_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '60000000-0000-0000-0000-000000000002'), true);
SELECT set_config('test.reporter_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '60000000-0000-0000-0000-000000000003'), true);
UPDATE public.profiles SET role = 'admin' WHERE id = current_setting('test.admin_id')::uuid;
UPDATE public.profiles SET is_public = true, default_post_audience = 'public'
WHERE id IN (current_setting('test.author_id')::uuid, current_setting('test.reporter_id')::uuid);

-- Two reported posts: one will be removed, one restored. Each carries media.
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status) VALUES
  ('60100000-0000-0000-0000-000000000001', current_setting('test.author_id')::uuid, 'Removed later', 'public', 'active', 'active'),
  ('60100000-0000-0000-0000-000000000002', current_setting('test.author_id')::uuid, 'Restored later', 'public', 'active', 'active'),
  ('60100000-0000-0000-0000-000000000003', current_setting('test.author_id')::uuid, 'Archived, never reported', 'public', 'active', 'active'),
  ('60100000-0000-0000-0000-000000000004', current_setting('test.author_id')::uuid, 'Archived recently', 'public', 'active', 'active');
INSERT INTO public.community_post_media (id, post_id, uploader_id, url, display_reference, content_sha256, media_type, content_type, sort_order, moderation_status) VALUES
  ('60200000-0000-0000-0000-000000000001', '60100000-0000-0000-0000-000000000001', current_setting('test.author_id')::uuid,
   'r2-private:///community_post/a/1/m1-0000000000000001.jpg', 'r2-private:///community_post/a/1/m1-0000000000000001-display.webp', repeat('1', 64), 'image', 'image/jpeg', 0, 'active'),
  ('60200000-0000-0000-0000-000000000002', '60100000-0000-0000-0000-000000000002', current_setting('test.author_id')::uuid,
   'r2-private:///community_post/a/2/m2-0000000000000002.jpg', 'r2-private:///community_post/a/2/m2-0000000000000002-display.webp', repeat('2', 64), 'image', 'image/jpeg', 0, 'active'),
  ('60200000-0000-0000-0000-000000000003', '60100000-0000-0000-0000-000000000003', current_setting('test.author_id')::uuid,
   'r2-private:///community_post/a/3/m3-0000000000000003.jpg', 'r2-private:///community_post/a/3/m3-0000000000000003-display.webp', repeat('3', 64), 'image', 'image/jpeg', 0, 'active');

SELECT public.submit_moderation_report(current_setting('test.reporter_id')::uuid, 'community_post', '60100000-0000-0000-0000-000000000001',
  (SELECT active_revision_id FROM public.community_posts WHERE id = '60100000-0000-0000-0000-000000000001'), 'spam', NULL, 'ret-test-report-000000000001');
SELECT public.submit_moderation_report(current_setting('test.reporter_id')::uuid, 'community_post', '60100000-0000-0000-0000-000000000002',
  (SELECT active_revision_id FROM public.community_posts WHERE id = '60100000-0000-0000-0000-000000000002'), 'spam', NULL, 'ret-test-report-000000000002');
SELECT set_config('test.case_removed', (SELECT id::text FROM public.moderation_cases WHERE entity_id = '60100000-0000-0000-0000-000000000001'), true);
SELECT set_config('test.case_restored', (SELECT id::text FROM public.moderation_cases WHERE entity_id = '60100000-0000-0000-0000-000000000002'), true);

-- Grant the admin decision + legal-hold authority and decide both cases.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT public.grant_moderation_capability(current_setting('test.admin_id')::uuid, 'queue_read', 'retention test: queue access');
SELECT public.grant_moderation_capability(current_setting('test.admin_id')::uuid, 'content_decide', 'retention test: decisions');
SELECT public.decide_moderation_case(current_setting('test.case_removed')::uuid, 1, 'remove', 'spam', 'confirmed spam listing', 'none', 7);
SELECT public.decide_moderation_case(current_setting('test.case_restored')::uuid, 1, 'restore', NULL, NULL, 'none', 7);

-- Recording a period needs the legal-hold reviewer capability.
DO $$
BEGIN
  BEGIN
    PERFORM public.set_moderation_retention_policy('community_safety', 30, 'T&S memo 2026-09-10 unapproved attempt');
    RAISE EXCEPTION 'FAIL - policy recorded without legal_hold_review';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

-- Without an approved period nothing is eligible.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.moderation_cases
             WHERE id IN (current_setting('test.case_removed')::uuid, current_setting('test.case_restored')::uuid)
               AND retention_expires_at IS NOT NULL) THEN
    RAISE EXCEPTION 'closed case received an expiry without an approved policy';
  END IF;
END
$$;

DO $$
DECLARE result jsonb;
BEGIN
  result := public.purge_moderation_case(current_setting('test.case_removed')::uuid);
  IF result->>'outcome' <> 'skipped' OR result->>'reason' <> 'no_approved_retention_period' THEN
    RAISE EXCEPTION 'purge ran without an approved period: %', result;
  END IF;
END
$$;

-- Record the period: closed cases are backfilled with an expiry.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT public.grant_moderation_capability(current_setting('test.admin_id')::uuid, 'legal_hold_review', 'retention test: designated reviewer');
SELECT public.set_moderation_retention_policy('community_safety', 30, 'T&S memo 2026-09-10 / counsel sign-off REF-42');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.moderation_cases
                 WHERE id = current_setting('test.case_removed')::uuid
                   AND retention_expires_at > now() + interval '29 days') THEN
    RAISE EXCEPTION 'policy did not backfill expiry on closed cases';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_retention_policy_events WHERE action = 'set' AND basis = 'community_safety') THEN
    RAISE EXCEPTION 'policy change was not audited';
  END IF;
END
$$;

-- Still inside the period: declined.
DO $$
DECLARE result jsonb;
BEGIN
  result := public.purge_moderation_case(current_setting('test.case_removed')::uuid);
  IF result->>'reason' <> 'retention_period_active' THEN
    RAISE EXCEPTION 'purge ran inside the retention period: %', result;
  END IF;
END
$$;

-- Age both cases past expiry.
UPDATE public.moderation_cases SET retention_expires_at = now() - interval '1 day'
WHERE id IN (current_setting('test.case_removed')::uuid, current_setting('test.case_restored')::uuid);

-- A pending appeal blocks the purge.
INSERT INTO public.moderation_appeals (moderation_item_id, case_id, appellant_id, statement)
SELECT moderation_item_id, id, current_setting('test.author_id')::uuid, 'Please reconsider this removal.'
FROM public.moderation_cases WHERE id = current_setting('test.case_removed')::uuid;
DO $$
DECLARE result jsonb;
BEGIN
  result := public.purge_moderation_case(current_setting('test.case_removed')::uuid);
  IF result->>'reason' <> 'appeal_open' THEN RAISE EXCEPTION 'purge ignored an open appeal: %', result; END IF;
END
$$;
UPDATE public.moderation_appeals SET status = 'denied' WHERE case_id = current_setting('test.case_removed')::uuid;

-- A legal hold on the case is never purged, even past expiry.
UPDATE public.moderation_cases SET legal_hold = true WHERE id = current_setting('test.case_restored')::uuid;
DO $$
DECLARE result jsonb;
BEGIN
  result := public.purge_moderation_case(current_setting('test.case_restored')::uuid);
  IF result->>'reason' <> 'legal_hold' THEN RAISE EXCEPTION 'purge touched a legal hold: %', result; END IF;
  -- The hold also cleared the expiry stamp (plan 19.3: hold overrides expiry).
  IF EXISTS (SELECT 1 FROM public.moderation_cases
             WHERE id = current_setting('test.case_restored')::uuid AND retention_expires_at IS NOT NULL) THEN
    RAISE EXCEPTION 'legal hold did not clear retention expiry';
  END IF;
END
$$;
UPDATE public.moderation_cases SET legal_hold = false WHERE id = current_setting('test.case_restored')::uuid;
UPDATE public.moderation_cases SET retention_expires_at = now() - interval '1 day'
WHERE id = current_setting('test.case_restored')::uuid;

-- Purge the removed case: content, media rows, reports, and evidence go;
-- objects are queued durably; the case, its events, and a purge record stay.
DO $$
DECLARE
  result jsonb;
  v_case public.moderation_cases%ROWTYPE;
BEGIN
  result := public.purge_moderation_case(current_setting('test.case_removed')::uuid);
  IF result->>'outcome' <> 'purged' OR NOT (result->>'contentRemoved')::boolean THEN
    RAISE EXCEPTION 'removed case was not purged: %', result;
  END IF;
  IF EXISTS (SELECT 1 FROM public.community_posts WHERE id = '60100000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'removed content row survived the purge';
  END IF;
  IF (SELECT count(*) FROM public.storage_cleanup_jobs
      WHERE storage_reference IN ('r2-private:///community_post/a/1/m1-0000000000000001.jpg',
                                  'r2-private:///community_post/a/1/m1-0000000000000001-display.webp')
        AND status = 'pending' AND reason = 'retention_purge') <> 2 THEN
    RAISE EXCEPTION 'media objects were not queued for cleanup';
  END IF;
  IF EXISTS (SELECT 1 FROM public.moderation_reports WHERE case_id = current_setting('test.case_removed')::uuid)
     OR EXISTS (SELECT 1 FROM public.moderation_evidence WHERE case_id = current_setting('test.case_removed')::uuid) THEN
    RAISE EXCEPTION 'reports or evidence survived the purge';
  END IF;
  SELECT * INTO v_case FROM public.moderation_cases WHERE id = current_setting('test.case_removed')::uuid;
  IF v_case.disposition_state <> 'purged' THEN RAISE EXCEPTION 'case tombstone not marked purged'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_events WHERE case_id = v_case.id AND event_type = 'evidence_purged') THEN
    RAISE EXCEPTION 'purge was not recorded on the case timeline';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_purge_events WHERE case_id = v_case.id) THEN
    RAISE EXCEPTION 'durable purge record missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.moderation_items WHERE id = v_case.moderation_item_id AND content_preview IS NOT NULL) THEN
    RAISE EXCEPTION 'content preview survived on the compatibility item';
  END IF;
  -- Idempotent: a second run is a no-op with a reason.
  result := public.purge_moderation_case(v_case.id);
  IF result->>'reason' <> 'already_purged' THEN RAISE EXCEPTION 'second purge was not idempotent: %', result; END IF;
END
$$;

-- Purge the restored case: evidence and reports go, live content stays.
DO $$
DECLARE result jsonb;
BEGIN
  result := public.purge_moderation_case(current_setting('test.case_restored')::uuid);
  IF result->>'outcome' <> 'purged' OR (result->>'contentRemoved')::boolean THEN
    RAISE EXCEPTION 'restored case purge was wrong: %', result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_posts
                 WHERE id = '60100000-0000-0000-0000-000000000002' AND status = 'active') THEN
    RAISE EXCEPTION 'restored content was deleted by an evidence purge';
  END IF;
  IF EXISTS (SELECT 1 FROM public.storage_cleanup_jobs
             WHERE storage_reference LIKE 'r2-private:///community_post/a/2/%') THEN
    RAISE EXCEPTION 'live media was queued for deletion';
  END IF;
END
$$;

-- Archived-post purge: only after 30 days, only when never reported. The
-- updated_at trigger would reset our back-dating, so it is paused for the
-- fixture writes only.
UPDATE public.community_posts SET status = 'archived' WHERE id IN ('60100000-0000-0000-0000-000000000003', '60100000-0000-0000-0000-000000000004');
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.community_posts DISABLE TRIGGER community_posts_updated_at;
SET CONSTRAINTS ALL DEFERRED;
UPDATE public.community_posts SET updated_at = now() - interval '31 days' WHERE id = '60100000-0000-0000-0000-000000000003';
DO $$
DECLARE result jsonb;
BEGIN
  result := public.purge_archived_community_post('60100000-0000-0000-0000-000000000004');
  IF result->>'reason' <> 'restorable_window_active' THEN RAISE EXCEPTION 'recent archive purged: %', result; END IF;

  -- The restored (reported) post, if archived, defers to its case lifecycle.
  UPDATE public.community_posts SET status = 'archived' WHERE id = '60100000-0000-0000-0000-000000000002';
  UPDATE public.community_posts SET updated_at = now() - interval '40 days' WHERE id = '60100000-0000-0000-0000-000000000002';
  result := public.purge_archived_community_post('60100000-0000-0000-0000-000000000002');
  IF result->>'reason' <> 'has_moderation_case' THEN RAISE EXCEPTION 'reported archive purged by the 30-day rule: %', result; END IF;

  result := public.purge_archived_community_post('60100000-0000-0000-0000-000000000003');
  IF result->>'outcome' <> 'purged' THEN RAISE EXCEPTION 'eligible archive was not purged: %', result; END IF;
  IF EXISTS (SELECT 1 FROM public.community_posts WHERE id = '60100000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'archived post row survived';
  END IF;
  IF (SELECT count(*) FROM public.storage_cleanup_jobs
      WHERE storage_reference LIKE 'r2-private:///community_post/a/3/%' AND reason = 'retention_purge') <> 2 THEN
    RAISE EXCEPTION 'archived post media not queued';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_purge_events
                 WHERE entity_type = 'community_post' AND entity_id = '60100000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'archived purge not recorded';
  END IF;
END
$$;
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.community_posts ENABLE TRIGGER community_posts_updated_at;
SET CONSTRAINTS ALL DEFERRED;

-- Account deletion keeps evidence objects for unpurged cases (plan 19.4).
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
VALUES ('60100000-0000-0000-0000-000000000005', current_setting('test.author_id')::uuid, 'Reported again', 'public', 'active', 'active');
INSERT INTO public.community_post_media (id, post_id, uploader_id, url, display_reference, content_sha256, media_type, content_type, sort_order, moderation_status)
VALUES ('60200000-0000-0000-0000-000000000005', '60100000-0000-0000-0000-000000000005', current_setting('test.author_id')::uuid,
  'r2-private:///community_post/a/5/m5-0000000000000005.jpg', 'r2-private:///community_post/a/5/m5-0000000000000005-display.webp', repeat('5', 64), 'image', 'image/jpeg', 0, 'active');
SELECT public.submit_moderation_report(current_setting('test.reporter_id')::uuid, 'community_post', '60100000-0000-0000-0000-000000000005',
  (SELECT active_revision_id FROM public.community_posts WHERE id = '60100000-0000-0000-0000-000000000005'), 'harassment', NULL, 'ret-test-report-000000000005');
DO $$
DECLARE refs text[];
BEGIN
  refs := public.retained_evidence_references_for_profile(current_setting('test.author_id')::uuid);
  IF NOT ('r2-private:///community_post/a/5/m5-0000000000000005.jpg' = ANY(refs))
     OR NOT ('r2-private:///community_post/a/5/m5-0000000000000005-display.webp' = ANY(refs)) THEN
    RAISE EXCEPTION 'retained evidence references missing an open-case object: %', refs;
  END IF;
  IF 'r2-private:///community_post/a/2/m2-0000000000000002.jpg' = ANY(refs) THEN
    RAISE EXCEPTION 'purged-case media incorrectly retained';
  END IF;
  -- Immutable records and service-only access.
  BEGIN
    DELETE FROM public.retention_purge_events;
    RAISE EXCEPTION 'FAIL - purge history deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  IF has_function_privilege('authenticated', 'public.purge_moderation_case(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.purge_archived_community_post(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'purge functions must be service-only';
  END IF;
END
$$;

-- With a policy in place, closing a case stamps its expiry automatically.
SELECT set_config('test.case_five', (SELECT id::text FROM public.moderation_cases
  WHERE entity_id = '60100000-0000-0000-0000-000000000005'), true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT public.decide_moderation_case(
  current_setting('test.case_five')::uuid,
  1, 'remove', 'harassment', 'targeted harassment, second occurrence', 'none', 7
);
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.moderation_cases
                 WHERE entity_id = '60100000-0000-0000-0000-000000000005'
                   AND state = 'closed'
                   AND retention_expires_at BETWEEN now() + interval '29 days' AND now() + interval '31 days') THEN
    RAISE EXCEPTION 'closure did not stamp the approved retention period';
  END IF;
END
$$;

-- Clearing the policy withdraws eligibility from everything not yet purged.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT public.clear_moderation_retention_policy('community_safety', 'counsel withdrew approval pending review');
RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.moderation_cases
             WHERE disposition_state <> 'purged' AND retention_expires_at IS NOT NULL) THEN
    RAISE EXCEPTION 'clearing the policy left unpurged cases eligible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_retention_policy_events WHERE action = 'cleared') THEN
    RAISE EXCEPTION 'policy clearing was not audited';
  END IF;
END
$$;

ROLLBACK;
