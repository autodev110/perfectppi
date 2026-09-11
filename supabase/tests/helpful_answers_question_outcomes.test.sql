\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('7d000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outcome-author@example.test', '', '{}', '{"username":"OutcomeAuthor"}', now(), now()),
  ('7d000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outcome-helper@example.test', '', '{}', '{"username":"OutcomeHelper"}', now(), now()),
  ('7d000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outcome-reader@example.test', '', '{}', '{"username":"OutcomeReader"}', now(), now());

UPDATE public.profiles SET is_public = true
WHERE auth_user_id::text LIKE '7d000000-%';

CREATE TEMP TABLE ho AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '7d000000-0000-0000-0000-000000000001') author,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7d000000-0000-0000-0000-000000000002') helper,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7d000000-0000-0000-0000-000000000003') reader;

INSERT INTO public.community_posts (
  id, author_id, content, audience, post_type, status, moderation_status
) SELECT
  '7d100000-0000-0000-0000-000000000001', author, 'Warm-start stumble',
  'public', 'question', 'active', 'active'
FROM ho;
INSERT INTO public.community_posts (
  id, author_id, content, audience, post_type, status, moderation_status
) SELECT
  '7d100000-0000-0000-0000-000000000002', author, 'Ordinary post',
  'public', 'general', 'active', 'active'
FROM ho;
INSERT INTO public.community_comments (
  id, post_id, author_id, content, status, moderation_status
) SELECT
  '7d200000-0000-0000-0000-000000000001'::uuid,
  '7d100000-0000-0000-0000-000000000001'::uuid, helper,
  'Check the coolant temperature sensor.', 'active'::public.community_content_status, 'active'
FROM ho
UNION ALL
SELECT
  '7d200000-0000-0000-0000-000000000002',
  '7d100000-0000-0000-0000-000000000001', author,
  'More details from the owner.', 'active', 'active'
FROM ho
UNION ALL
SELECT
  '7d200000-0000-0000-0000-000000000003',
  '7d100000-0000-0000-0000-000000000002', helper,
  'A comment on a general post.', 'active', 'active'
FROM ho;

DO $$
DECLARE
  hit boolean;
  result jsonb;
BEGIN
  result := public.set_community_comment_helpful(
    (SELECT reader FROM ho), '7d200000-0000-0000-0000-000000000001', true
  );
  IF result->>'helpful' <> 'true' OR (result->>'helpfulCount')::int <> 1 THEN
    RAISE EXCEPTION 'Helpful reaction was not recorded: %', result;
  END IF;
  result := public.set_community_comment_helpful(
    (SELECT reader FROM ho), '7d200000-0000-0000-0000-000000000001', true
  );
  IF (result->>'helpfulCount')::int <> 1 THEN
    RAISE EXCEPTION 'Helpful retry was not idempotent';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = (SELECT helper FROM ho) AND type = 'answer_helpful'
  ) THEN
    RAISE EXCEPTION 'answer author did not receive a Helpful notification';
  END IF;

  hit := false;
  BEGIN
    PERFORM public.set_community_comment_helpful(
      (SELECT helper FROM ho), '7d200000-0000-0000-0000-000000000001', true
    );
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'authors must not mark their own answer Helpful'; END IF;

  hit := false;
  BEGIN
    PERFORM public.set_community_comment_helpful(
      (SELECT reader FROM ho), '7d200000-0000-0000-0000-000000000003', true
    );
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'general-post comments must not receive Helpful reactions'; END IF;
END
$$;

DO $$
DECLARE
  result jsonb;
  hit boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_community_question_outcome(
      (SELECT author FROM ho), '7d100000-0000-0000-0000-000000000001', 'fixed'
    );
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'an outcome must require an accepted answer'; END IF;

  PERFORM public.set_accepted_community_answer(
    (SELECT author FROM ho), '7d100000-0000-0000-0000-000000000001',
    '7d200000-0000-0000-0000-000000000001'
  );
  result := public.set_community_question_outcome(
    (SELECT author FROM ho), '7d100000-0000-0000-0000-000000000001', 'helped'
  );
  IF result->>'outcome' <> 'helped' OR result->>'changed' <> 'true' THEN
    RAISE EXCEPTION 'question outcome was not set: %', result;
  END IF;
  result := public.set_community_question_outcome(
    (SELECT author FROM ho), '7d100000-0000-0000-0000-000000000001', 'helped'
  );
  IF result->>'changed' <> 'false' THEN RAISE EXCEPTION 'outcome retry was not idempotent'; END IF;
  IF (SELECT count(*) FROM public.community_question_outcome_events
      WHERE post_id = '7d100000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'idempotent retry created duplicate outcome history';
  END IF;

  hit := false;
  BEGIN
    PERFORM public.set_community_question_outcome(
      (SELECT reader FROM ho), '7d100000-0000-0000-0000-000000000001', 'fixed'
    );
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'only the question author may set the outcome'; END IF;

  PERFORM public.set_accepted_community_answer(
    (SELECT author FROM ho), '7d100000-0000-0000-0000-000000000001', NULL
  );
  IF EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE id = '7d100000-0000-0000-0000-000000000001'
      AND (question_outcome IS NOT NULL OR question_outcome_updated_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'changing the accepted answer did not clear its outcome';
  END IF;
  IF (SELECT count(*) FROM public.community_question_outcome_events
      WHERE post_id = '7d100000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'clearing an answer destroyed outcome history';
  END IF;
END
$$;

DO $$
DECLARE hit boolean := false;
BEGIN
  BEGIN
    UPDATE public.community_question_outcome_events SET outcome = 'fixed'
    WHERE post_id = '7d100000-0000-0000-0000-000000000001';
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'question outcome history is append-only';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'outcome history was mutable'; END IF;

  IF has_table_privilege('authenticated', 'public.community_comment_helpful_reactions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.community_question_outcome_events', 'SELECT')
     OR has_function_privilege('authenticated', 'public.set_community_comment_helpful(uuid,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.community_comment_helpful_summaries(uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.set_community_question_outcome(uuid,uuid,public.community_question_outcome)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Helpful or outcome internals leaked to clients';
  END IF;
END
$$;

-- Hidden answers disappear from summaries even though historical reaction
-- rows remain for integrity and future reputation accounting.
UPDATE public.community_comments
SET status = 'hidden', moderation_status = 'pending_review'
WHERE id = '7d200000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.community_comment_helpful_summaries(
      (SELECT reader FROM ho), ARRAY['7d200000-0000-0000-0000-000000000001'::uuid]
    )
  ) THEN RAISE EXCEPTION 'hidden answer leaked Helpful state'; END IF;
END
$$;

ROLLBACK;
