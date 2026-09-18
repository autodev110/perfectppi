\set ON_ERROR_STOP on
BEGIN;

-- Plan 14.6 / 15.1: author edits create revisions and show "Edited"; a
-- reported item cannot be edited; comment replies are one level deep and
-- the parent's author is notified; author removal is soft.

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('64000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'edit-author@example.test', '', '{}', '{"username":"EditAuthor"}', now(), now()),
  ('64000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'edit-commenter@example.test', '', '{}', '{"username":"EditCommenter"}', now(), now()),
  ('64000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'edit-replier@example.test', '', '{}', '{"username":"EditReplier"}', now(), now());

UPDATE public.profiles SET is_public = true
WHERE auth_user_id IN (
  '64000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000002',
  '64000000-0000-0000-0000-000000000003'
);

CREATE TEMP TABLE edit_ids AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '64000000-0000-0000-0000-000000000001') author_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '64000000-0000-0000-0000-000000000002') commenter_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '64000000-0000-0000-0000-000000000003') replier_id,
  gen_random_uuid() post_id,
  gen_random_uuid() question_id,
  gen_random_uuid() comment_id,
  gen_random_uuid() reply_id,
  gen_random_uuid() answer_id,
  gen_random_uuid() answer_reply_id;

INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
SELECT post_id, author_id, 'Original wording of the post.', 'public', 'active', 'active' FROM edit_ids;
INSERT INTO public.community_posts (id, author_id, content, audience, post_type, status, moderation_status)
SELECT question_id, author_id, 'Why does the idle hunt when warm?', 'public', 'question', 'active', 'active' FROM edit_ids;

INSERT INTO public.community_comments (id, post_id, author_id, content, status, moderation_status)
SELECT comment_id, post_id, commenter_id, 'First thought on the post.', 'active', 'active' FROM edit_ids;

-- ── Privileges ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.edit_community_post(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.edit_community_comment(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.remove_own_community_comment(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.community_entities_with_open_cases(text,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'author edit RPCs leaked to authenticated clients';
  END IF;
END
$$;

-- ── Post edit: new revision, edited_at set, unchanged content is a no-op ───
DO $$
DECLARE
  v_post public.community_posts%ROWTYPE;
  v_revisions integer;
BEGIN
  v_post := public.edit_community_post((SELECT author_id FROM edit_ids), (SELECT post_id FROM edit_ids), 'Original wording of the post.');
  IF v_post.edited_at IS NOT NULL THEN RAISE EXCEPTION 'unchanged content marked the post edited'; END IF;

  v_post := public.edit_community_post((SELECT author_id FROM edit_ids), (SELECT post_id FROM edit_ids), 'Corrected wording of the post.');
  IF v_post.content <> 'Corrected wording of the post.' OR v_post.edited_at IS NULL THEN
    RAISE EXCEPTION 'post edit did not apply';
  END IF;
  SELECT count(*) INTO v_revisions FROM public.community_post_revisions WHERE post_id = v_post.id;
  IF v_revisions <> 2 THEN RAISE EXCEPTION 'post edit did not create a second revision (%)', v_revisions; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_post_revisions
    WHERE post_id = v_post.id AND revision_number = 1 AND content = 'Original wording of the post.'
  ) THEN RAISE EXCEPTION 'first revision was rewritten'; END IF;

  -- Not the author.
  BEGIN
    PERFORM public.edit_community_post((SELECT commenter_id FROM edit_ids), (SELECT post_id FROM edit_ids), 'Hijacked');
    RAISE EXCEPTION 'non-author edited a post';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  -- Empty and oversize content.
  BEGIN
    PERFORM public.edit_community_post((SELECT author_id FROM edit_ids), (SELECT post_id FROM edit_ids), '   ');
    RAISE EXCEPTION 'blank edit accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'post_content_invalid' THEN RAISE; END IF;
  END;
END
$$;

-- ── A reported (open case) post is frozen; a closed case unfreezes it ──────
SELECT public.submit_moderation_report(
  (SELECT commenter_id FROM edit_ids), 'community_post', (SELECT post_id FROM edit_ids),
  (SELECT active_revision_id FROM public.community_posts WHERE id = (SELECT post_id FROM edit_ids)),
  'spam', NULL, 'author-edit-test-report-1', false
);
DO $$
BEGIN
  -- report_auto_hide off keeps the post visible with a monitoring case; that
  -- still counts as reported for editing purposes.
  IF NOT EXISTS (
    SELECT 1 FROM public.community_entities_with_open_cases('community_post', ARRAY[(SELECT post_id FROM edit_ids)])
  ) THEN RAISE EXCEPTION 'open case not detected'; END IF;
  BEGIN
    PERFORM public.edit_community_post((SELECT author_id FROM edit_ids), (SELECT post_id FROM edit_ids), 'Edit after report');
    RAISE EXCEPTION 'reported post was edited';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'post_under_review' THEN RAISE; END IF;
  END;
END
$$;
UPDATE public.moderation_cases
SET state = 'closed', resolution = 'no_violation_restored', closed_at = now()
WHERE entity_type = 'community_post' AND entity_id = (SELECT post_id FROM edit_ids);
DO $$
DECLARE v_post public.community_posts%ROWTYPE;
BEGIN
  v_post := public.edit_community_post((SELECT author_id FROM edit_ids), (SELECT post_id FROM edit_ids), 'Edit after restore');
  IF v_post.content <> 'Edit after restore' THEN RAISE EXCEPTION 'restored post could not be edited'; END IF;
END
$$;

-- ── Comment replies: one level, same post, parent must be visible ──────────
-- Publication and its audit share one transaction, including after an older
-- case closes. Its revision must never point back to that closed case.
DO $$
DECLARE
  v_result jsonb;
  v_revision uuid;
  v_events integer;
  v_allow jsonb := '{"decision":"allow","riskLevel":"none","provider":"test","modelVersion":"1","reasonCodes":[]}'::jsonb;
BEGIN
  IF has_function_privilege('authenticated', 'public.publish_community_author_edit(uuid,text,uuid,text,jsonb,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'atomic edit publication leaked to clients';
  END IF;
  BEGIN
    PERFORM public.publish_community_author_edit((SELECT author_id FROM edit_ids), 'community_post',
      (SELECT post_id FROM edit_ids), 'Rejected edit', v_allow || '{"decision":"review"}', true);
    RAISE EXCEPTION 'unapproved edit was published';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  v_result := public.publish_community_author_edit((SELECT author_id FROM edit_ids), 'community_post',
    (SELECT post_id FROM edit_ids), 'Approved audited edit', v_allow, true);
  SELECT active_revision_id INTO v_revision FROM public.community_posts WHERE id = (SELECT post_id FROM edit_ids);
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_events event
    JOIN public.moderation_items item ON item.id = event.moderation_item_id
    WHERE item.entity_id = (SELECT post_id FROM edit_ids)
      AND event.metadata->>'authorEdit' = 'true' AND event.revision_id = v_revision AND event.case_id IS NULL
  ) THEN RAISE EXCEPTION 'new edit audit was rebound to an older case'; END IF;
  SELECT count(*) INTO v_events FROM public.moderation_events WHERE revision_id = v_revision;
  PERFORM public.publish_community_author_edit((SELECT author_id FROM edit_ids), 'community_post',
    (SELECT post_id FROM edit_ids), 'Approved audited edit', v_allow, true);
  IF (SELECT count(*) FROM public.moderation_events WHERE revision_id = v_revision) <> v_events THEN
    RAISE EXCEPTION 'no-op edit created another audit';
  END IF;
END $$;

INSERT INTO public.community_comments (id, post_id, author_id, content, status, moderation_status, parent_comment_id)
SELECT reply_id, post_id, replier_id, 'Reply to the first thought.', 'active', 'active', comment_id FROM edit_ids;

DO $$
BEGIN
  -- Parent author notified with the reply type; the post author gets the ordinary comment notice.
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = (SELECT commenter_id FROM edit_ids) AND type = 'comment_reply'
      AND data->>'parent_comment_id' = (SELECT comment_id FROM edit_ids)::text
  ) THEN RAISE EXCEPTION 'parent comment author was not notified of the reply'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = (SELECT author_id FROM edit_ids) AND type = 'post_comment'
  ) THEN RAISE EXCEPTION 'post author lost the comment notice'; END IF;
  IF public.notification_category('comment_reply') <> 'social' THEN
    RAISE EXCEPTION 'comment_reply is not in the social category';
  END IF;

  -- Reply to a reply is refused.
  BEGIN
    INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status, parent_comment_id)
    SELECT post_id, commenter_id, 'Too deep.', 'active', 'active', reply_id FROM edit_ids;
    RAISE EXCEPTION 'second-level reply accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'comment_reply_depth' THEN RAISE; END IF;
  END;
  -- Parent on another post is refused.
  BEGIN
    INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status, parent_comment_id)
    SELECT question_id, commenter_id, 'Wrong thread.', 'active', 'active', comment_id FROM edit_ids;
    RAISE EXCEPTION 'cross-post reply accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'comment_reply_parent_unavailable' THEN RAISE; END IF;
  END;
  -- The parent link cannot be rewritten.
  BEGIN
    UPDATE public.community_comments SET parent_comment_id = NULL WHERE id = (SELECT reply_id FROM edit_ids);
    RAISE EXCEPTION 'reply was detached';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'comment_reply_immutable' THEN RAISE; END IF;
  END;
END
$$;

-- ── Comment edit and soft removal ──────────────────────────────────────────
-- Access loss must suppress both new and aggregated reply notifications.
UPDATE public.community_posts SET audience = 'friends' WHERE id = (SELECT post_id FROM edit_ids);
UPDATE public.notifications SET read_at = now()
WHERE type = 'comment_reply' AND user_id = (SELECT commenter_id FROM edit_ids);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.notifications WHERE type = 'comment_reply'
    AND user_id = (SELECT commenter_id FROM edit_ids) AND read_at IS NULL) THEN
    RAISE EXCEPTION 'access-loss notification could not be marked read';
  END IF;
END $$;
DELETE FROM public.notifications WHERE type = 'comment_reply' AND user_id = (SELECT commenter_id FROM edit_ids);
UPDATE public.community_posts SET audience = 'friends' WHERE id = (SELECT post_id FROM edit_ids);
SELECT public.upsert_comment_reply_notification((SELECT commenter_id FROM edit_ids), (SELECT replier_id FROM edit_ids),
  (SELECT post_id FROM edit_ids), (SELECT comment_id FROM edit_ids), (SELECT reply_id FROM edit_ids));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.notifications WHERE type = 'comment_reply' AND user_id = (SELECT commenter_id FROM edit_ids)) THEN
    RAISE EXCEPTION 'reply notification leaked a now-inaccessible post';
  END IF;
END $$;
UPDATE public.community_posts SET audience = 'public' WHERE id = (SELECT post_id FROM edit_ids);

INSERT INTO public.profile_blocks (blocker_id, blocked_id)
SELECT commenter_id, replier_id FROM edit_ids;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status, parent_comment_id)
    SELECT post_id, replier_id, 'Reply across a block', 'active', 'active', comment_id FROM edit_ids;
    RAISE EXCEPTION 'reply bypassed the parent-author block';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'comment_reply_parent_unavailable' THEN RAISE; END IF;
  END;
END $$;
DELETE FROM public.profile_blocks WHERE blocker_id = (SELECT commenter_id FROM edit_ids);

DO $$
DECLARE
  v_comment public.community_comments%ROWTYPE;
  v_revisions integer;
BEGIN
  v_comment := public.edit_community_comment((SELECT commenter_id FROM edit_ids), (SELECT comment_id FROM edit_ids), 'First thought, clarified.');
  IF v_comment.content <> 'First thought, clarified.' OR v_comment.edited_at IS NULL THEN
    RAISE EXCEPTION 'comment edit did not apply';
  END IF;
  SELECT count(*) INTO v_revisions FROM public.community_comment_revisions WHERE comment_id = v_comment.id;
  IF v_revisions <> 2 THEN RAISE EXCEPTION 'comment edit did not create a revision'; END IF;

  BEGIN
    PERFORM public.edit_community_comment((SELECT replier_id FROM edit_ids), (SELECT comment_id FROM edit_ids), 'Not mine');
    RAISE EXCEPTION 'non-author edited a comment';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  -- Removal is soft and idempotent; the reply survives; revisions stay.
  v_comment := public.remove_own_community_comment((SELECT commenter_id FROM edit_ids), (SELECT comment_id FROM edit_ids));
  IF v_comment.status <> 'archived' THEN RAISE EXCEPTION 'removal was not a soft archive'; END IF;
  v_comment := public.remove_own_community_comment((SELECT commenter_id FROM edit_ids), (SELECT comment_id FROM edit_ids));
  IF v_comment.status <> 'archived' THEN RAISE EXCEPTION 'repeat removal changed state'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_comments WHERE id = (SELECT comment_id FROM edit_ids)) THEN
    RAISE EXCEPTION 'removal deleted the row';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_comments
    WHERE id = (SELECT reply_id FROM edit_ids) AND status = 'active'
      AND parent_comment_id = (SELECT comment_id FROM edit_ids)
  ) THEN RAISE EXCEPTION 'reply did not survive parent removal'; END IF;
  SELECT count(*) INTO v_revisions FROM public.community_comment_revisions WHERE comment_id = (SELECT comment_id FROM edit_ids);
  IF v_revisions <> 2 THEN RAISE EXCEPTION 'removal touched revision history'; END IF;

  -- An archived comment cannot be edited and cannot receive new replies.
  BEGIN
    PERFORM public.edit_community_comment((SELECT commenter_id FROM edit_ids), (SELECT comment_id FROM edit_ids), 'Editing a removed comment');
    RAISE EXCEPTION 'archived comment was edited';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'comment_not_editable' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status, parent_comment_id)
    SELECT post_id, replier_id, 'Late reply.', 'active', 'active', comment_id FROM edit_ids;
    RAISE EXCEPTION 'reply to a removed comment accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'comment_reply_parent_unavailable' THEN RAISE; END IF;
  END;
END
$$;

-- ── A hidden (moderated) comment cannot be removed by its author ───────────
INSERT INTO public.community_comments (id, post_id, author_id, content, status, moderation_status)
SELECT answer_id, question_id, commenter_id, 'Check the idle air control valve.', 'active', 'active' FROM edit_ids;
INSERT INTO public.community_comments (id, post_id, author_id, content, status, moderation_status, parent_comment_id)
SELECT answer_reply_id, question_id, replier_id, 'Agreed, that was it on mine.', 'active', 'active', answer_id FROM edit_ids;

DO $$
BEGIN
  -- A reply is never an Accepted Answer.
  BEGIN
    PERFORM public.set_accepted_community_answer((SELECT author_id FROM edit_ids), (SELECT question_id FROM edit_ids), (SELECT answer_reply_id FROM edit_ids));
    RAISE EXCEPTION 'reply was accepted as an answer';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM public.set_accepted_community_answer((SELECT author_id FROM edit_ids), (SELECT question_id FROM edit_ids), (SELECT answer_id FROM edit_ids));
  BEGIN
    PERFORM public.set_community_comment_helpful((SELECT author_id FROM edit_ids), (SELECT answer_reply_id FROM edit_ids), true);
    RAISE EXCEPTION 'a reply gained Helpful reputation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

SELECT public.submit_moderation_report(
  (SELECT commenter_id FROM edit_ids), 'community_comment', (SELECT answer_reply_id FROM edit_ids),
  (SELECT active_revision_id FROM public.community_comments WHERE id = (SELECT answer_reply_id FROM edit_ids)),
  'spam', NULL, 'author-edit-monitoring-report', false
);
DO $$ BEGIN
  BEGIN
    PERFORM public.remove_own_community_comment((SELECT replier_id FROM edit_ids), (SELECT answer_reply_id FROM edit_ids));
    RAISE EXCEPTION 'author removed a visible comment with an open monitoring case';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'comment_under_review' THEN RAISE; END IF;
  END;
END $$;

SELECT public.submit_moderation_report(
  (SELECT replier_id FROM edit_ids), 'community_comment', (SELECT answer_id FROM edit_ids),
  (SELECT active_revision_id FROM public.community_comments WHERE id = (SELECT answer_id FROM edit_ids)),
  'harassment', NULL, 'author-edit-test-report-2', true
);
DO $$
DECLARE v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.community_comments WHERE id = (SELECT answer_id FROM edit_ids);
  IF v_status <> 'hidden' THEN RAISE EXCEPTION 'auto-hide report did not hide the comment (%)', v_status; END IF;
  BEGIN
    PERFORM public.remove_own_community_comment((SELECT commenter_id FROM edit_ids), (SELECT answer_id FROM edit_ids));
    RAISE EXCEPTION 'author removed a comment under review';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'comment_under_review' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.edit_community_comment((SELECT commenter_id FROM edit_ids), (SELECT answer_id FROM edit_ids), 'Edited under review');
    RAISE EXCEPTION 'author edited a comment under review';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'comment_not_editable' THEN RAISE; END IF;
  END;
  -- Hiding the accepted answer released the selection (existing trigger).
  IF (SELECT accepted_answer_comment_id FROM public.community_posts WHERE id = (SELECT question_id FROM edit_ids)) IS NOT NULL THEN
    RAISE EXCEPTION 'hidden accepted answer stayed selected';
  END IF;
END
$$;

-- Account-wide edit throttles are also enforced inside the publication RPC.
DO $$
DECLARE
  v_edits integer;
  v_index integer;
  v_allow jsonb := '{"decision":"allow","riskLevel":"none","provider":"test","modelVersion":"1","reasonCodes":[]}'::jsonb;
BEGIN
  SELECT count(*) INTO v_edits FROM public.community_post_revisions
    WHERE author_id = (SELECT author_id FROM edit_ids) AND revision_number > 1;
  FOR v_index IN 1..(20 - v_edits) LOOP
    PERFORM public.publish_community_author_edit((SELECT author_id FROM edit_ids), 'community_post',
      (SELECT question_id FROM edit_ids), 'Audited edit ' || v_index, v_allow, true);
  END LOOP;
  BEGIN
    PERFORM public.publish_community_author_edit((SELECT author_id FROM edit_ids), 'community_post',
      (SELECT question_id FROM edit_ids), 'Too many edits', v_allow, true);
    RAISE EXCEPTION 'account edit throttle bypassed';
  EXCEPTION WHEN program_limit_exceeded THEN NULL;
  END;
END $$;

ROLLBACK;
