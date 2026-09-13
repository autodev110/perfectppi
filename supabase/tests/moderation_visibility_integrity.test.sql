\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'e1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'visibility-integrity@example.test', '',
  '{}', '{"username":"VisibilityCheck"}', now(), now()
);

SELECT id AS author_id
FROM public.profiles
WHERE auth_user_id = 'e1000000-0000-4000-8000-000000000001' \gset

UPDATE public.profiles
SET is_public = true, default_post_audience = 'public'
WHERE id = :'author_id';

INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
) VALUES (
  'e1100000-0000-4000-8000-000000000001', :'author_id',
  'Visibility integrity fixture', 'public', 'active', 'active'
);

INSERT INTO public.community_comments (
  id, post_id, author_id, content, status, moderation_status
) VALUES (
  'e1200000-0000-4000-8000-000000000001',
  'e1100000-0000-4000-8000-000000000001', :'author_id',
  'Visibility integrity comment fixture', 'active', 'active'
);

DO $$
DECLARE
  v_status jsonb;
BEGIN
  IF has_function_privilege('anon', 'public.moderation_visibility_integrity_status()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.moderation_visibility_integrity_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'visibility integrity diagnostics leaked to a public API role';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.moderation_visibility_integrity_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role cannot run visibility integrity diagnostics';
  END IF;

  v_status := public.moderation_visibility_integrity_status();
  IF (v_status->>'totalViolations')::integer <> 0 THEN
    RAISE EXCEPTION 'healthy content produced a visibility integrity violation: %', v_status;
  END IF;
END;
$$;

UPDATE public.community_posts
SET moderation_status = 'pending_review'
WHERE id = 'e1100000-0000-4000-8000-000000000001';

UPDATE public.community_comments
SET moderation_status = 'pending_review'
WHERE id = 'e1200000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v_status jsonb := public.moderation_visibility_integrity_status();
BEGIN
  IF (v_status->>'activeRestrictedPosts')::integer <> 1
     OR (v_status->>'activeRestrictedComments')::integer <> 1
     OR (v_status->>'totalViolations')::integer <> 2 THEN
    RAISE EXCEPTION 'restrictive active-state mismatches were not detected: %', v_status;
  END IF;
END;
$$;

UPDATE public.community_posts
SET moderation_status = 'active'
WHERE id = 'e1100000-0000-4000-8000-000000000001';

UPDATE public.community_comments
SET moderation_status = 'active'
WHERE id = 'e1200000-0000-4000-8000-000000000001';

SELECT active_revision_id AS post_revision_id
FROM public.community_posts
WHERE id = 'e1100000-0000-4000-8000-000000000001' \gset

INSERT INTO public.moderation_items (
  id, entity_type, entity_id, author_id, status, risk_level, decision,
  model_provider, model_version
) VALUES (
  'e1300000-0000-4000-8000-000000000001',
  'community_post', 'e1100000-0000-4000-8000-000000000001', :'author_id',
  'pending_review', 'medium', 'review', 'user_report', 'visibility-test-v1'
);

INSERT INTO public.moderation_cases (
  moderation_item_id, entity_type, entity_id, revision_id, state, sla_due_at
) VALUES (
  'e1300000-0000-4000-8000-000000000001',
  'community_post', 'e1100000-0000-4000-8000-000000000001',
  :'post_revision_id', 'open', now() + interval '24 hours'
);

DO $$
DECLARE
  v_status jsonb := public.moderation_visibility_integrity_status();
BEGIN
  IF (v_status->>'openCaseVisibleContent')::integer <> 1
     OR (v_status->>'totalViolations')::integer <> 1 THEN
    RAISE EXCEPTION 'visible current content under an open case was not detected: %', v_status;
  END IF;
END;
$$;

UPDATE public.community_posts
SET status = 'hidden', moderation_status = 'pending_review'
WHERE id = 'e1100000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v_status jsonb := public.moderation_visibility_integrity_status();
BEGIN
  IF (v_status->>'totalViolations')::integer <> 0 THEN
    RAISE EXCEPTION 'atomic hidden state did not clear integrity violations: %', v_status;
  END IF;
END;
$$;

ROLLBACK;
