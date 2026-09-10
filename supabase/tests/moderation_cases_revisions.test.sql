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
