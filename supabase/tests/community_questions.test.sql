\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('63000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'question-author@example.test', '', '{}', '{"username":"QuestionAuthor"}', now(), now()),
  ('63000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'question-helper@example.test', '', '{}', '{"username":"QuestionHelper"}', now(), now()),
  ('63000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'question-other@example.test', '', '{}', '{"username":"QuestionOther"}', now(), now());

UPDATE public.profiles
SET is_public = true
WHERE auth_user_id IN (
  '63000000-0000-0000-0000-000000000001',
  '63000000-0000-0000-0000-000000000002',
  '63000000-0000-0000-0000-000000000003'
);

CREATE TEMP TABLE question_ids AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '63000000-0000-0000-0000-000000000001') author_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '63000000-0000-0000-0000-000000000002') helper_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '63000000-0000-0000-0000-000000000003') other_id,
  gen_random_uuid() question_id,
  gen_random_uuid() other_post_id,
  gen_random_uuid() helper_comment_id,
  gen_random_uuid() second_comment_id,
  gen_random_uuid() own_comment_id,
  gen_random_uuid() wrong_post_comment_id;

INSERT INTO public.community_posts (
  id, author_id, content, audience, post_type, status, moderation_status
)
SELECT question_id, author_id, 'Why does this engine stumble only when warm?', 'public', 'question', 'active', 'active'
FROM question_ids;
INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
)
SELECT other_post_id, other_id, 'An ordinary post using the old-client default', 'public', 'active', 'active'
FROM question_ids;

INSERT INTO public.community_comments (id, post_id, author_id, content, status, moderation_status)
SELECT helper_comment_id, question_id, helper_id, 'Check fuel pressure after heat soak.', 'active'::public.community_content_status, 'active' FROM question_ids
UNION ALL
SELECT second_comment_id, question_id, other_id, 'Inspect the coolant temperature sensor reading.', 'active'::public.community_content_status, 'active' FROM question_ids
UNION ALL
SELECT own_comment_id, question_id, author_id, 'Adding details from my own testing.', 'active'::public.community_content_status, 'active' FROM question_ids
UNION ALL
SELECT wrong_post_comment_id, other_post_id, helper_id, 'Response on another post.', 'active'::public.community_content_status, 'active' FROM question_ids;

DO $$
DECLARE v_type public.community_post_type;
DECLARE v_revision_type public.community_post_type;
BEGIN
  SELECT post_type INTO v_type FROM public.community_posts WHERE id = (SELECT other_post_id FROM question_ids);
  IF v_type <> 'general' THEN RAISE EXCEPTION 'old-client post did not default to general'; END IF;
  SELECT revision.post_type INTO v_revision_type
  FROM public.community_posts post
  JOIN public.community_post_revisions revision ON revision.id = post.active_revision_id
  WHERE post.id = (SELECT question_id FROM question_ids);
  IF v_revision_type <> 'question' THEN RAISE EXCEPTION 'question type missing from immutable revision'; END IF;
  IF has_function_privilege('authenticated', 'public.set_accepted_community_answer(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'accepted-answer RPC leaked to authenticated clients';
  END IF;
END
$$;

DO $$
DECLARE result jsonb;
BEGIN
  result := public.set_accepted_community_answer(
    (SELECT author_id FROM question_ids),
    (SELECT question_id FROM question_ids),
    (SELECT helper_comment_id FROM question_ids)
  );
  IF result->>'changed' <> 'true' THEN RAISE EXCEPTION 'first selection was not recorded'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_answer_selection_events
    WHERE post_id = (SELECT question_id FROM question_ids)
      AND selected_comment_id = (SELECT helper_comment_id FROM question_ids)
      AND action = 'selected'
  ) THEN RAISE EXCEPTION 'selection event missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = (SELECT helper_id FROM question_ids) AND type = 'answer_accepted'
  ) THEN RAISE EXCEPTION 'answer author was not notified'; END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.set_accepted_community_answer(
      (SELECT other_id FROM question_ids), (SELECT question_id FROM question_ids),
      (SELECT second_comment_id FROM question_ids)
    );
    RAISE EXCEPTION 'non-author selected an answer';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'non-author selected an answer' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_accepted_community_answer(
      (SELECT author_id FROM question_ids), (SELECT question_id FROM question_ids),
      (SELECT own_comment_id FROM question_ids)
    );
    RAISE EXCEPTION 'question author selected their own response';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'question author selected their own response' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_accepted_community_answer(
      (SELECT author_id FROM question_ids), (SELECT question_id FROM question_ids),
      (SELECT wrong_post_comment_id FROM question_ids)
    );
    RAISE EXCEPTION 'response from another post was selected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'response from another post was selected' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO public.profile_blocks (blocker_id, blocked_id)
SELECT author_id, other_id FROM question_ids;
DO $$
BEGIN
  BEGIN
    PERFORM public.set_accepted_community_answer(
      (SELECT author_id FROM question_ids), (SELECT question_id FROM question_ids),
      (SELECT second_comment_id FROM question_ids)
    );
    RAISE EXCEPTION 'blocked member response was selected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'blocked member response was selected' THEN RAISE; END IF;
  END;
END
$$;
DELETE FROM public.profile_blocks
WHERE blocker_id = (SELECT author_id FROM question_ids)
  AND blocked_id = (SELECT other_id FROM question_ids);

SELECT public.set_accepted_community_answer(
  (SELECT author_id FROM question_ids), (SELECT question_id FROM question_ids),
  (SELECT second_comment_id FROM question_ids)
);

-- A moderation or author-removal transition clears only the visible accepted
-- state, while retaining an append-only history and notifying the author.
UPDATE public.community_comments
SET status = 'hidden', moderation_status = 'pending_review'
WHERE id = (SELECT second_comment_id FROM question_ids);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE id = (SELECT question_id FROM question_ids)
      AND accepted_answer_comment_id IS NOT NULL
  ) THEN RAISE EXCEPTION 'unavailable accepted answer remained visible'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_answer_selection_events
    WHERE post_id = (SELECT question_id FROM question_ids) AND action = 'answer_unavailable'
  ) THEN RAISE EXCEPTION 'answer-unavailable history missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = (SELECT author_id FROM question_ids)
      AND type = 'accepted_answer_unavailable'
  ) THEN RAISE EXCEPTION 'question author was not notified of unavailable answer'; END IF;
END
$$;

ROLLBACK;
