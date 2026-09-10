\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '55000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revision-alice@example.test', '',
    '{}', '{"username":"RevisionAlice"}', now(), now()
  ),
  (
    '55000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revision-bob@example.test', '',
    '{}', '{"username":"RevisionBob"}', now(), now()
  ),
  (
    '55000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'revision-casey@example.test', '',
    '{}', '{"username":"RevisionCasey"}', now(), now()
  );

UPDATE public.profiles
SET is_public = true, default_post_audience = 'public'
WHERE auth_user_id IN (
  '55000000-0000-0000-0000-000000000001',
  '55000000-0000-0000-0000-000000000002',
  '55000000-0000-0000-0000-000000000003'
);

SELECT id AS alice_id FROM public.profiles
WHERE auth_user_id = '55000000-0000-0000-0000-000000000001' \gset
SELECT id AS bob_id FROM public.profiles
WHERE auth_user_id = '55000000-0000-0000-0000-000000000002' \gset
SELECT id AS casey_id FROM public.profiles
WHERE auth_user_id = '55000000-0000-0000-0000-000000000003' \gset

INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
) VALUES (
  '55100000-0000-0000-0000-000000000001', :'bob_id',
  'Exact reported revision', 'public', 'active', 'active'
);

INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
) VALUES (
  '55100000-0000-0000-0000-000000000002', :'bob_id',
  'Parent for comment report', 'public', 'active', 'active'
);

INSERT INTO public.community_comments (
  id, post_id, author_id, content, status, moderation_status
) VALUES (
  '55200000-0000-0000-0000-000000000001',
  '55100000-0000-0000-0000-000000000002', :'bob_id',
  'Exact reported comment revision', 'active', 'active'
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.community_post_revisions
      WHERE post_id = '55100000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'initial post revision was not captured';
  END IF;
  IF (SELECT count(*) FROM public.community_comment_revisions
      WHERE comment_id = '55200000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'initial comment revision was not captured';
  END IF;
END
$$;

SELECT active_revision_id AS post_revision_id FROM public.community_posts
WHERE id = '55100000-0000-0000-0000-000000000001' \gset
SELECT active_revision_id AS comment_revision_id FROM public.community_comments
WHERE id = '55200000-0000-0000-0000-000000000001' \gset
SELECT set_config('test.post_revision_id', :'post_revision_id', true);

SELECT public.submit_moderation_report(
  :'alice_id', 'community_post',
  '55100000-0000-0000-0000-000000000001', :'post_revision_id',
  'spam', NULL, 'revision-test-alice-post-0001'
);

DO $$
DECLARE
  v_case_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE id = '55100000-0000-0000-0000-000000000001'
      AND status = 'hidden' AND moderation_status = 'pending_review'
  ) THEN RAISE EXCEPTION 'first report did not hide the post atomically'; END IF;

  SELECT id INTO v_case_id FROM public.moderation_cases
  WHERE entity_type = 'community_post'
    AND entity_id = '55100000-0000-0000-0000-000000000001'
    AND revision_id = current_setting('test.post_revision_id')::uuid
    AND state = 'open';
  IF v_case_id IS NULL THEN RAISE EXCEPTION 'open revision case was not created'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_evidence WHERE case_id = v_case_id) THEN
    RAISE EXCEPTION 'immutable evidence was not captured';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_outbox WHERE case_id = v_case_id) THEN
    RAISE EXCEPTION 'moderator outbox event was not created';
  END IF;
END
$$;

-- A retry with the same context is idempotent and does not inflate counts.
SELECT public.submit_moderation_report(
  :'alice_id', 'community_post',
  '55100000-0000-0000-0000-000000000001', :'post_revision_id',
  'spam', NULL, 'revision-test-alice-post-0001'
);

-- A second viewer who held a valid short-lived context may support the same
-- now-hidden revision; no hidden-content lookup is exposed to that viewer.
SELECT public.submit_moderation_report(
  :'casey_id', 'community_post',
  '55100000-0000-0000-0000-000000000001', :'post_revision_id',
  'harassment', NULL, 'revision-test-casey-post-0001'
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.moderation_reports
      WHERE entity_id = '55100000-0000-0000-0000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'report idempotency or hidden-revision support failed';
  END IF;
  IF (SELECT report_count FROM public.moderation_items
      WHERE entity_type = 'community_post'
        AND entity_id = '55100000-0000-0000-0000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'aggregate report count is incorrect';
  END IF;
END
$$;

SELECT public.submit_moderation_report(
  :'alice_id', 'community_comment',
  '55200000-0000-0000-0000-000000000001', :'comment_revision_id',
  'fraud', NULL, 'revision-test-alice-comment-01'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_comments
    WHERE id = '55200000-0000-0000-0000-000000000001'
      AND status = 'hidden' AND moderation_status = 'pending_review'
  ) THEN RAISE EXCEPTION 'reported comment remained visible'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE id = '55100000-0000-0000-0000-000000000002'
      AND status = 'active' AND moderation_status = 'active'
  ) THEN RAISE EXCEPTION 'reporting a comment changed its parent post'; END IF;
END
$$;

-- New content revisions are append-only.
INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
) VALUES (
  '55100000-0000-0000-0000-000000000003', :'bob_id',
  'First version', 'public', 'active', 'active'
);
UPDATE public.community_posts SET content = 'Second version'
WHERE id = '55100000-0000-0000-0000-000000000003';

INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
) VALUES (
  '55100000-0000-0000-0000-000000000004', :'bob_id',
  'Cascade cleanup revision', 'public', 'active', 'active'
);
DELETE FROM public.community_posts
WHERE id = '55100000-0000-0000-0000-000000000004';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.community_post_revisions
      WHERE post_id = '55100000-0000-0000-0000-000000000003') <> 2 THEN
    RAISE EXCEPTION 'post edit did not append a revision';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.community_post_revisions
    WHERE post_id = '55100000-0000-0000-0000-000000000004'
  ) THEN
    RAISE EXCEPTION 'parent deletion did not cascade through revision history';
  END IF;
  BEGIN
    UPDATE public.community_post_revisions SET content = 'tampered'
    WHERE post_id = '55100000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'revision update was allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'revision update was allowed' THEN RAISE; END IF;
  END;
END
$$;

-- ---------------------------------------------------------------------------
-- Audit additions. psql does not interpolate :'vars' inside $$ blocks, so the
-- identifiers below travel through transaction-local settings.
-- ---------------------------------------------------------------------------
SELECT set_config('test.alice_id', :'alice_id', true);
SELECT set_config('test.bob_id', :'bob_id', true);
SELECT set_config('test.casey_id', :'casey_id', true);

-- A reporter cannot report their own content, and a report must name the
-- revision the reporter actually saw.
DO $$
DECLARE
  edited_revision uuid := (SELECT active_revision_id FROM public.community_posts
    WHERE id = '55100000-0000-0000-0000-000000000003');
BEGIN
  BEGIN
    PERFORM public.submit_moderation_report(
      current_setting('test.bob_id')::uuid, 'community_post',
      '55100000-0000-0000-0000-000000000003', edited_revision,
      'spam', NULL, 'revision-test-bob-self-report-01'
    );
    RAISE EXCEPTION 'self-report was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'report is not available' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.submit_moderation_report(
      current_setting('test.alice_id')::uuid, 'community_post',
      '55100000-0000-0000-0000-000000000003', gen_random_uuid(),
      'spam', NULL, 'revision-test-alice-stale-rev-01'
    );
    RAISE EXCEPTION 'stale revision report was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'report is not available' THEN RAISE; END IF;
  END;

  -- The full launch reason set is accepted; intellectual-property reports
  -- need a written explanation just like Other.
  BEGIN
    PERFORM public.submit_moderation_report(
      current_setting('test.alice_id')::uuid, 'community_post',
      '55100000-0000-0000-0000-000000000003', edited_revision,
      'intellectual_property', NULL, 'revision-test-alice-ip-nodetail'
    );
    RAISE EXCEPTION 'intellectual_property report without details was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'report details are required for this reason' THEN RAISE; END IF;
  END;
END
$$;

DO $$
DECLARE
  result jsonb;
BEGIN
  result := public.submit_moderation_report(
    current_setting('test.alice_id')::uuid, 'community_post',
    '55100000-0000-0000-0000-000000000003',
    (SELECT active_revision_id FROM public.community_posts
      WHERE id = '55100000-0000-0000-0000-000000000003'),
    'dangerous_vehicle_advice', NULL, 'revision-test-alice-dva-0001'
  );
  IF NOT (result->>'hiddenGlobally')::boolean
     OR result->>'caseState' <> 'open'
     OR result->>'contentStatus' <> 'hidden'
     OR result->>'entityType' <> 'community_post'
     OR result->>'revisionId' IS NULL
     OR (result->>'duplicate')::boolean THEN
    RAISE EXCEPTION 'report payload is missing the specified stable fields: %', result;
  END IF;
END
$$;

-- Going private must narrow every public post, including ones that are hidden
-- under review or archived, without rotating the reported revision.
UPDATE public.community_posts SET status = 'archived'
WHERE id = '55100000-0000-0000-0000-000000000002';

SELECT set_config('test.hidden_revision_before', (
  SELECT active_revision_id::text FROM public.community_posts
  WHERE id = '55100000-0000-0000-0000-000000000001'
), true);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"55000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
SELECT public.set_own_social_privacy(false, 'friends', true, true);
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE author_id = current_setting('test.bob_id')::uuid AND audience = 'public'
  ) THEN
    RAISE EXCEPTION 'going private left a public post behind';
  END IF;
  IF (SELECT active_revision_id FROM public.community_posts
      WHERE id = '55100000-0000-0000-0000-000000000001')
     <> current_setting('test.hidden_revision_before')::uuid THEN
    RAISE EXCEPTION 'audience narrowing rotated the revision of a reported post';
  END IF;
  IF (SELECT count(*) FROM public.community_post_revisions
      WHERE post_id = '55100000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'audience narrowing appended a revision';
  END IF;

  -- Broadening a hidden post is still an edit and still refused.
  BEGIN
    UPDATE public.community_posts SET audience = 'public'
    WHERE id = '55100000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'hidden post audience was broadened';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'content under review or removal cannot be edited' THEN RAISE; END IF;
  END;
END
$$;

-- Restored-revision rule (plan 20.1): after a human restore, an unchanged
-- revision re-hides immediately for a severe code but needs three distinct
-- reporters for an ordinary code.
UPDATE public.profiles SET role = 'admin'
WHERE auth_user_id = '55000000-0000-0000-0000-000000000003';

SELECT public.apply_moderation_review(
  (SELECT id FROM public.moderation_items
    WHERE entity_type = 'community_post'
      AND entity_id = '55100000-0000-0000-0000-000000000001'),
  :'casey_id', 'active', 'allow', 'no violation', 'none', NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE id = '55100000-0000-0000-0000-000000000001'
      AND status = 'active' AND moderation_status = 'active'
  ) THEN RAISE EXCEPTION 'restore did not republish the post'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_cases
    WHERE entity_id = '55100000-0000-0000-0000-000000000001'
      AND state = 'closed' AND resolution = 'no_violation_restored'
  ) THEN RAISE EXCEPTION 'restore did not close the case'; END IF;
END
$$;

-- Bob is private now, so reporters must be friends to still see the post.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('55000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'revision-dana@example.test', '',
   '{}', '{"username":"RevisionDana"}', now(), now()),
  ('55000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'revision-eli@example.test', '',
   '{}', '{"username":"RevisionEli"}', now(), now());
SELECT set_config('test.dana_id', (SELECT id::text FROM public.profiles
  WHERE auth_user_id = '55000000-0000-0000-0000-000000000004'), true);
SELECT set_config('test.eli_id', (SELECT id::text FROM public.profiles
  WHERE auth_user_id = '55000000-0000-0000-0000-000000000005'), true);

INSERT INTO public.friend_relationships (
  profile_low_id, profile_high_id, requested_by, status, responded_at
)
SELECT LEAST(friend.id, bob.id), GREATEST(friend.id, bob.id), friend.id, 'friends', now()
FROM public.profiles bob, public.profiles friend
WHERE bob.id = current_setting('test.bob_id')::uuid
  AND friend.id IN (
    current_setting('test.alice_id')::uuid,
    current_setting('test.casey_id')::uuid,
    current_setting('test.dana_id')::uuid,
    current_setting('test.eli_id')::uuid
  )
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  result jsonb;
  revision uuid := current_setting('test.hidden_revision_before')::uuid;
BEGIN
  -- Alice already reported this exact revision; uniqueness is per revision.
  result := public.submit_moderation_report(
    current_setting('test.alice_id')::uuid, 'community_post',
    '55100000-0000-0000-0000-000000000001', revision,
    'spam', NULL, 'revision-test-alice-rereport-01'
  );
  IF NOT (result->>'duplicate')::boolean THEN
    RAISE EXCEPTION 'same reporter re-reported an unchanged revision';
  END IF;

  -- Casey also reported it before the restore, so Dana is the first fresh
  -- ordinary reporter: a monitoring case, post stays visible.
  result := public.submit_moderation_report(
    current_setting('test.dana_id')::uuid, 'community_post',
    '55100000-0000-0000-0000-000000000001', revision,
    'spam', NULL, 'revision-test-dana-monitor-01'
  );
  IF (result->>'hiddenGlobally')::boolean OR result->>'caseState' <> 'monitoring' THEN
    RAISE EXCEPTION 'ordinary re-report of a restored revision hid it immediately: %', result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE id = '55100000-0000-0000-0000-000000000001' AND status = 'active'
  ) THEN RAISE EXCEPTION 'monitoring case changed content visibility'; END IF;

  result := public.submit_moderation_report(
    current_setting('test.eli_id')::uuid, 'community_post',
    '55100000-0000-0000-0000-000000000001', revision,
    'harassment', NULL, 'revision-test-eli-monitor-001'
  );
  IF (result->>'hiddenGlobally')::boolean THEN
    RAISE EXCEPTION 'second ordinary reporter hid a restored revision';
  END IF;
END
$$;

-- Third distinct reporter crosses the threshold.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('55000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'revision-fay@example.test', '',
   '{}', '{"username":"RevisionFay"}', now(), now());
SELECT set_config('test.fay_id', (SELECT id::text FROM public.profiles
  WHERE auth_user_id = '55000000-0000-0000-0000-000000000006'), true);
INSERT INTO public.friend_relationships (
  profile_low_id, profile_high_id, requested_by, status, responded_at
)
SELECT LEAST(fay.id, bob.id), GREATEST(fay.id, bob.id), fay.id, 'friends', now()
FROM public.profiles bob, public.profiles fay
WHERE bob.id = current_setting('test.bob_id')::uuid
  AND fay.id = current_setting('test.fay_id')::uuid;

DO $$
DECLARE
  result jsonb;
  revision uuid := current_setting('test.hidden_revision_before')::uuid;
BEGIN
  result := public.submit_moderation_report(
    current_setting('test.fay_id')::uuid, 'community_post',
    '55100000-0000-0000-0000-000000000001', revision,
    'spam', NULL, 'revision-test-fay-monitor-0001'
  );
  IF NOT (result->>'hiddenGlobally')::boolean OR result->>'caseState' <> 'open' THEN
    RAISE EXCEPTION 'third distinct reporter did not re-hide the restored revision: %', result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE id = '55100000-0000-0000-0000-000000000001'
      AND status = 'hidden' AND moderation_status = 'pending_review'
  ) THEN RAISE EXCEPTION 'threshold re-hide did not change the content row'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_cases
    WHERE entity_id = '55100000-0000-0000-0000-000000000001'
      AND state = 'open' AND sla_due_at > now() + interval '23 hours'
  ) THEN RAISE EXCEPTION 'monitoring case did not restart its SLA clock when it opened'; END IF;
END
$$;

-- Severe codes re-hide a restored revision on the first report.
SELECT public.apply_moderation_review(
  (SELECT id FROM public.moderation_items
    WHERE entity_type = 'community_post'
      AND entity_id = '55100000-0000-0000-0000-000000000003'),
  :'casey_id', 'active', 'allow', 'no violation', 'none', NULL
);
DO $$
DECLARE
  result jsonb;
BEGIN
  result := public.submit_moderation_report(
    current_setting('test.dana_id')::uuid, 'community_post',
    '55100000-0000-0000-0000-000000000003',
    (SELECT active_revision_id FROM public.community_posts
      WHERE id = '55100000-0000-0000-0000-000000000003'),
    'violence', NULL, 'revision-test-dana-severe-01'
  );
  IF NOT (result->>'hiddenGlobally')::boolean OR result->>'caseState' <> 'open' THEN
    RAISE EXCEPTION 'severe re-report of a restored revision did not hide immediately: %', result;
  END IF;
END
$$;

DO $$
BEGIN
  IF has_table_privilege('service_role', 'public.moderation_evidence', 'UPDATE')
     OR has_table_privilege('service_role', 'public.moderation_evidence', 'DELETE')
     OR has_table_privilege('service_role', 'public.moderation_reports', 'UPDATE')
     OR has_table_privilege('service_role', 'public.moderation_reports', 'DELETE')
     OR has_table_privilege('authenticated', 'public.community_posts', 'DELETE') THEN
    RAISE EXCEPTION 'immutable moderation records are mutable by the application role';
  END IF;
END
$$;

ROLLBACK;
