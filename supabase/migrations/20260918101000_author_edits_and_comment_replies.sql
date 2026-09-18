BEGIN;

-- ---------------------------------------------------------------------------
-- Author editing and the comment lifecycle (plan 14.6, 15.1).
--
-- The revision triggers already turn a content change into an immutable
-- revision and refuse edits to hidden/archived content; what was missing was
-- the author-facing operation itself. This migration adds:
--
--   * edited_at on posts and comments so cards can show "Edited" without
--     joining the revision history;
--   * one level of comment replies (parent_comment_id), with the parent
--     bound to the same post and never itself a reply;
--   * service-only edit_community_post / edit_community_comment /
--     remove_own_community_comment that enforce the author, active-state,
--     and "not reported" rules in one place;
--   * community_entities_with_open_cases so clients can hide Edit on content
--     that already has a report bound to its revision;
--   * a comment_reply notification for the parent comment's author.
--
-- Author removal stays soft (status = archived). A removed comment that still
-- has visible replies is projected as a neutral "Comment removed" placeholder
-- by the read layer; the row and its revisions are untouched.
-- ---------------------------------------------------------------------------

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  -- SET NULL, not CASCADE: a retention purge of a parent comment must not
  -- destroy replies that carry their own moderation evidence. The orphaned
  -- reply reads as a top-level comment afterwards.
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid
    REFERENCES public.community_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS community_comments_parent_idx
  ON public.community_comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

COMMENT ON COLUMN public.community_comments.parent_comment_id IS
  'Plan 15.1: one level of threading. The parent is always a top-level comment on the same post; deeper replies stay flat.';
COMMENT ON COLUMN public.community_comments.edited_at IS
  'Set by edit_community_comment when the author publishes a new revision; drives the "Edited" label.';
COMMENT ON COLUMN public.community_posts.edited_at IS
  'Set by edit_community_post when the author publishes a new revision; drives the "Edited" label.';

-- ---------------------------------------------------------------------------
-- 1. Reply structure guard: same post, one level, parent visible at reply
--    time, and the parent link is immutable once written.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_community_comment_reply()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_parent public.community_comments%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- The FK's ON DELETE SET NULL (a nested referential-integrity trigger)
    -- is the only permitted change; a direct detach or re-parent is refused.
    IF NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id
       AND NOT (NEW.parent_comment_id IS NULL AND pg_trigger_depth() > 1) THEN
      RAISE EXCEPTION 'comment_reply_immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_parent
  FROM public.community_comments parent
  WHERE parent.id = NEW.parent_comment_id;
  IF NOT FOUND OR v_parent.post_id <> NEW.post_id THEN
    RAISE EXCEPTION 'comment_reply_parent_unavailable' USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.parent_comment_id IS NOT NULL THEN
    RAISE EXCEPTION 'comment_reply_depth' USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.status <> 'active' OR v_parent.moderation_status <> 'active' THEN
    RAISE EXCEPTION 'comment_reply_parent_unavailable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_comments_guard_reply ON public.community_comments;
CREATE TRIGGER community_comments_guard_reply
  BEFORE INSERT OR UPDATE OF parent_comment_id ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_comment_reply();

-- An Accepted Answer must be a top-level response (plan 15.1).
CREATE OR REPLACE FUNCTION public.guard_accepted_answer_is_top_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.accepted_answer_comment_id IS NOT NULL
     AND NEW.accepted_answer_comment_id IS DISTINCT FROM OLD.accepted_answer_comment_id
     AND EXISTS (
       SELECT 1 FROM public.community_comments comment
       WHERE comment.id = NEW.accepted_answer_comment_id
         AND comment.parent_comment_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'answer unavailable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_accepted_answer_top_level ON public.community_posts;
CREATE TRIGGER community_posts_accepted_answer_top_level
  BEFORE UPDATE OF accepted_answer_comment_id ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_accepted_answer_is_top_level();

-- ---------------------------------------------------------------------------
-- 2. "Reported" means a case that is not closed. A restored item (closed
--    case) is editable again and the next report binds to the new revision.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_entities_with_open_cases(
  p_entity_type text,
  p_entity_ids uuid[]
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT moderation_case.entity_id
  FROM public.moderation_cases moderation_case
  WHERE moderation_case.entity_type = p_entity_type
    AND moderation_case.entity_id = ANY (p_entity_ids)
    AND moderation_case.state <> 'closed';
$$;

CREATE OR REPLACE FUNCTION public.edit_community_post(
  p_actor_profile_id uuid,
  p_post_id uuid,
  p_content text
)
RETURNS public.community_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.community_posts%ROWTYPE;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_content IS NULL OR char_length(btrim(p_content)) = 0 OR char_length(p_content) > 1200 THEN
    RAISE EXCEPTION 'post_content_invalid' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_post
  FROM public.community_posts post
  WHERE post.id = p_post_id
  FOR UPDATE;
  IF NOT FOUND OR v_post.author_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'post_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_post.status <> 'active' OR v_post.moderation_status <> 'active'
     OR v_post.group_status <> 'active' THEN
    RAISE EXCEPTION 'post_not_editable' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.community_entities_with_open_cases('community_post', ARRAY[p_post_id])
  ) THEN
    RAISE EXCEPTION 'post_under_review' USING ERRCODE = 'check_violation';
  END IF;

  IF v_post.content = p_content THEN
    RETURN v_post;
  END IF;

  UPDATE public.community_posts
  SET content = p_content, edited_at = now()
  WHERE id = p_post_id
  RETURNING * INTO v_post;
  RETURN v_post;
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_community_comment(
  p_actor_profile_id uuid,
  p_comment_id uuid,
  p_content text
)
RETURNS public.community_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comment public.community_comments%ROWTYPE;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_content IS NULL OR char_length(btrim(p_content)) = 0 OR char_length(p_content) > 600 THEN
    RAISE EXCEPTION 'comment_content_invalid' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_comment
  FROM public.community_comments comment
  WHERE comment.id = p_comment_id
  FOR UPDATE;
  IF NOT FOUND OR v_comment.author_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'comment_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_comment.status <> 'active' OR v_comment.moderation_status <> 'active' THEN
    RAISE EXCEPTION 'comment_not_editable' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.community_entities_with_open_cases('community_comment', ARRAY[p_comment_id])
  ) THEN
    RAISE EXCEPTION 'comment_under_review' USING ERRCODE = 'check_violation';
  END IF;
  -- The post must still accept interaction; a hidden post keeps its thread frozen.
  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts post
    WHERE post.id = v_comment.post_id
      AND post.status = 'active' AND post.moderation_status = 'active'
  ) THEN
    RAISE EXCEPTION 'comment_not_editable' USING ERRCODE = 'check_violation';
  END IF;

  IF v_comment.content = p_content THEN
    RETURN v_comment;
  END IF;

  UPDATE public.community_comments
  SET content = p_content, edited_at = now()
  WHERE id = p_comment_id
  RETURNING * INTO v_comment;
  RETURN v_comment;
END;
$$;

-- Soft removal by the author. Content under review stays as it is so the
-- case keeps the revision the reporter saw; an already-archived comment is
-- an idempotent no-op.
CREATE OR REPLACE FUNCTION public.remove_own_community_comment(
  p_actor_profile_id uuid,
  p_comment_id uuid
)
RETURNS public.community_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comment public.community_comments%ROWTYPE;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_comment
  FROM public.community_comments comment
  WHERE comment.id = p_comment_id
  FOR UPDATE;
  IF NOT FOUND OR v_comment.author_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'comment_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_comment.status = 'archived' THEN
    RETURN v_comment;
  END IF;
  IF v_comment.status <> 'active' OR v_comment.moderation_status <> 'active' THEN
    RAISE EXCEPTION 'comment_under_review' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.community_comments
  SET status = 'archived'
  WHERE id = p_comment_id
  RETURNING * INTO v_comment;
  RETURN v_comment;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reply notification (plan 22.1 "direct reply"), aggregated per parent
--    comment per day like post activity. The post author keeps the existing
--    post_comment aggregate; when they are also the parent author they get
--    the reply notice instead of two entries for one comment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_comment_reply_notification(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_post_id uuid,
  p_parent_comment_id uuid,
  p_reply_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_existing public.notifications%ROWTYPE;
  v_count integer;
  v_actor text := public.notification_actor_label(p_actor_id);
  v_others integer;
BEGIN
  IF p_recipient_id IS NULL OR p_recipient_id = p_actor_id THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.profile_mutes
    WHERE muter_id = p_recipient_id AND muted_id = p_actor_id AND mute_notifications
  ) THEN RETURN; END IF;
  IF public.social_profiles_are_blocked(p_recipient_id, p_actor_id) THEN RETURN; END IF;

  SELECT * INTO v_existing
  FROM public.notifications
  WHERE user_id = p_recipient_id
    AND type = 'comment_reply'
    AND read_at IS NULL
    AND data->>'parent_comment_id' = p_parent_comment_id::text
    AND (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_count := COALESCE(jsonb_array_length(v_existing.data->'actor_ids'), 0);
    IF NOT (v_existing.data->'actor_ids' ? p_actor_id::text) THEN
      v_count := v_count + 1;
    END IF;
    v_others := v_count - 1;
    UPDATE public.notifications
    SET body = CASE
          WHEN v_others <= 0 THEN v_actor || ' replied to your comment'
          WHEN v_others = 1 THEN v_actor || ' and 1 other replied to your comment'
          ELSE v_actor || ' and ' || v_others || ' others replied to your comment'
        END,
        title = v_count || CASE WHEN v_count = 1 THEN ' reply' ELSE ' replies' END || ' to your comment',
        data = v_existing.data
          || jsonb_build_object('count', v_count, 'latest_actor_id', p_actor_id, 'comment_id', p_reply_id)
          || CASE WHEN v_existing.data->'actor_ids' ? p_actor_id::text
               THEN '{}'::jsonb
               ELSE jsonb_build_object('actor_ids', (v_existing.data->'actor_ids') || to_jsonb(p_actor_id::text))
             END,
        created_at = now()
    WHERE id = v_existing.id;
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_recipient_id,
    'comment_reply',
    'New reply to your comment',
    v_actor || ' replied to your comment',
    jsonb_build_object(
      'post_id', p_post_id,
      'parent_comment_id', p_parent_comment_id,
      'comment_id', p_reply_id,
      'count', 1,
      'latest_actor_id', p_actor_id,
      'actor_ids', jsonb_build_array(p_actor_id::text)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author uuid;
  v_parent_author uuid;
BEGIN
  -- Fire once: when an active comment is inserted, or when a scanned
  -- comment becomes active.
  IF NEW.status <> 'active' OR NEW.moderation_status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.moderation_status = 'active' THEN RETURN NEW; END IF;

  SELECT post.author_id INTO v_author
  FROM public.community_posts post
  WHERE post.id = NEW.post_id AND post.status = 'active' AND post.moderation_status = 'active';
  IF v_author IS NULL THEN RETURN NEW; END IF;

  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT parent.author_id INTO v_parent_author
    FROM public.community_comments parent
    WHERE parent.id = NEW.parent_comment_id
      AND parent.status = 'active' AND parent.moderation_status = 'active';
    IF v_parent_author IS NOT NULL THEN
      PERFORM public.upsert_comment_reply_notification(
        v_parent_author, NEW.author_id, NEW.post_id, NEW.parent_comment_id, NEW.id
      );
    END IF;
  END IF;

  IF v_parent_author IS DISTINCT FROM v_author THEN
    PERFORM public.upsert_post_activity_notification(v_author, NEW.author_id, NEW.post_id, 'post_comment', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_category(p_type public.notification_type)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_type::text
    WHEN 'friend_request' THEN 'social'
    WHEN 'friend_request_accepted' THEN 'social'
    WHEN 'post_comment' THEN 'social'
    WHEN 'comment_reply' THEN 'social'
    WHEN 'post_likes' THEN 'social'
    WHEN 'post_mention' THEN 'social'
    WHEN 'answer_accepted' THEN 'social'
    WHEN 'accepted_answer_unavailable' THEN 'social'
    WHEN 'answer_helpful' THEN 'social'
    WHEN 'build_update' THEN 'social'
    WHEN 'group_post_removed' THEN 'groups'
    WHEN 'group_role_changed' THEN 'groups'
    WHEN 'group_invitation' THEN 'groups'
    WHEN 'group_join_request' THEN 'groups'
    WHEN 'group_join_decision' THEN 'groups'
    WHEN 'event_cancelled' THEN 'groups'
    WHEN 'event_update' THEN 'groups'
    WHEN 'message_received' THEN 'messages'
    WHEN 'listing_inspection_requested' THEN 'marketplace'
    WHEN 'saved_listing_updated' THEN 'marketplace'
    WHEN 'saved_search_match' THEN 'marketplace'
    WHEN 'tech_request_new' THEN 'inspections'
    WHEN 'tech_request_accepted' THEN 'inspections'
    WHEN 'inspection_submitted' THEN 'inspections'
    WHEN 'inspection_updated' THEN 'inspections'
    WHEN 'warranty_available' THEN 'inspections'
    WHEN 'payment_completed' THEN 'account'
    WHEN 'moderation_decision' THEN 'safety'
    WHEN 'moderation_case' THEN 'safety'
    WHEN 'report_received' THEN 'safety'
    ELSE 'account'
  END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Privileges: every new function is service-mediated.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.guard_community_comment_reply() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_accepted_answer_is_top_level() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_entities_with_open_cases(text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edit_community_post(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edit_community_comment(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_own_community_comment(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_comment_reply_notification(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_post_comment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_entities_with_open_cases(text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.edit_community_post(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.edit_community_comment(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_own_community_comment(uuid, uuid) TO service_role;

COMMIT;
