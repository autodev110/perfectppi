-- Plan 15.2 / 15.5 and Phase 2: private Helpful reactions on technical
-- answers and a visible question outcome backed by append-only history.
BEGIN;

ALTER TABLE public.community_posts
  ADD COLUMN question_outcome public.community_question_outcome,
  ADD COLUMN question_outcome_updated_at timestamptz;

CREATE TABLE public.community_comment_helpful_reactions (
  comment_id uuid NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, profile_id)
);
CREATE INDEX community_comment_helpful_profile_idx
  ON public.community_comment_helpful_reactions(profile_id, created_at DESC);
ALTER TABLE public.community_comment_helpful_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_comment_helpful_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_comment_helpful_reactions TO service_role;

CREATE TABLE public.community_question_outcome_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  answer_comment_id uuid REFERENCES public.community_comments(id) ON DELETE SET NULL,
  previous_outcome public.community_question_outcome,
  outcome public.community_question_outcome,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_outcome IS DISTINCT FROM outcome)
);
CREATE INDEX community_question_outcome_events_post_idx
  ON public.community_question_outcome_events(post_id, created_at DESC, id DESC);
ALTER TABLE public.community_question_outcome_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_question_outcome_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.community_question_outcome_events TO service_role;

CREATE FUNCTION public.guard_community_question_outcome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A new accepted answer starts without an outcome. Historical choices stay
  -- in the event table, but must never appear to apply to a different answer.
  IF TG_OP = 'UPDATE'
     AND NEW.accepted_answer_comment_id IS DISTINCT FROM OLD.accepted_answer_comment_id THEN
    NEW.question_outcome := NULL;
    NEW.question_outcome_updated_at := NULL;
  END IF;

  IF NEW.question_outcome IS NOT NULL THEN
    IF NEW.post_type <> 'question' OR NEW.accepted_answer_comment_id IS NULL THEN
      RAISE EXCEPTION 'question outcomes require an accepted answer'
        USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' OR NEW.question_outcome IS DISTINCT FROM OLD.question_outcome THEN
      NEW.question_outcome_updated_at := now();
    END IF;
  ELSE
    NEW.question_outcome_updated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_posts_guard_question_outcome
  BEFORE INSERT OR UPDATE OF post_type, accepted_answer_comment_id, question_outcome
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_question_outcome();

CREATE FUNCTION public.set_community_comment_helpful(
  p_actor_profile_id uuid,
  p_comment_id uuid,
  p_helpful boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post_id uuid;
  v_comment_author_id uuid;
  v_count integer;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_actor_profile_id::text || ':' || p_comment_id::text, 0)
  );
  SELECT comment.post_id, comment.author_id
  INTO v_post_id, v_comment_author_id
  FROM public.community_comments comment
  JOIN public.community_posts post ON post.id = comment.post_id
  WHERE comment.id = p_comment_id
    AND comment.status = 'active'
    AND comment.moderation_status = 'active'
    AND post.post_type = 'question'
    AND post.status = 'active'
    AND post.moderation_status = 'active'
    AND post.group_status = 'active'
    AND public.social_can_view_community_post(p_actor_profile_id, post.id, false)
  FOR SHARE OF comment, post;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'answer unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_comment_author_id = p_actor_profile_id THEN
    RAISE EXCEPTION 'authors cannot mark their own answer helpful'
      USING ERRCODE = 'check_violation';
  END IF;
  IF public.social_profiles_are_blocked(p_actor_profile_id, v_comment_author_id) THEN
    RAISE EXCEPTION 'answer unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_helpful THEN
    INSERT INTO public.community_comment_helpful_reactions (comment_id, profile_id)
    VALUES (p_comment_id, p_actor_profile_id)
    ON CONFLICT (comment_id, profile_id) DO NOTHING;
  ELSE
    DELETE FROM public.community_comment_helpful_reactions
    WHERE comment_id = p_comment_id AND profile_id = p_actor_profile_id;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.community_comment_helpful_reactions reaction
  WHERE reaction.comment_id = p_comment_id;

  RETURN jsonb_build_object(
    'commentId', p_comment_id,
    'helpful', p_helpful,
    'helpfulCount', v_count
  );
END;
$$;

CREATE FUNCTION public.community_comment_helpful_summaries(
  p_viewer_id uuid,
  p_comment_ids uuid[]
)
RETURNS TABLE(comment_id uuid, helpful_count bigint, helpful_by_viewer boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT comment.id,
         count(reaction.profile_id)::bigint,
         COALESCE(bool_or(reaction.profile_id = p_viewer_id), false)
  FROM (SELECT DISTINCT unnest(p_comment_ids) AS id) requested
  JOIN public.community_comments comment ON comment.id = requested.id
  JOIN public.community_posts post ON post.id = comment.post_id
  LEFT JOIN public.community_comment_helpful_reactions reaction
    ON reaction.comment_id = comment.id
  WHERE comment.status = 'active'
    AND comment.moderation_status = 'active'
    AND post.post_type = 'question'
    AND post.status = 'active'
    AND post.moderation_status = 'active'
    AND public.social_can_view_community_post(p_viewer_id, post.id, false)
  GROUP BY comment.id;
$$;

CREATE FUNCTION public.set_community_question_outcome(
  p_actor_profile_id uuid,
  p_post_id uuid,
  p_outcome public.community_question_outcome DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.community_posts%ROWTYPE;
  v_previous public.community_question_outcome;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_post
  FROM public.community_posts post
  WHERE post.id = p_post_id
  FOR UPDATE;
  IF NOT FOUND OR v_post.author_id <> p_actor_profile_id
     OR v_post.post_type <> 'question'
     OR v_post.accepted_answer_comment_id IS NULL
     OR v_post.status <> 'active'
     OR v_post.moderation_status <> 'active'
     OR v_post.group_status <> 'active'
     OR NOT public.social_can_view_community_post(p_actor_profile_id, p_post_id, false) THEN
    RAISE EXCEPTION 'question unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_comments comment
    WHERE comment.id = v_post.accepted_answer_comment_id
      AND comment.post_id = p_post_id
      AND comment.status = 'active'
      AND comment.moderation_status = 'active'
  ) THEN
    RAISE EXCEPTION 'accepted answer unavailable' USING ERRCODE = 'check_violation';
  END IF;

  v_previous := v_post.question_outcome;
  IF v_previous IS NOT DISTINCT FROM p_outcome THEN
    RETURN jsonb_build_object(
      'postId', p_post_id,
      'outcome', p_outcome,
      'changed', false
    );
  END IF;

  UPDATE public.community_posts
  SET question_outcome = p_outcome
  WHERE id = p_post_id;
  INSERT INTO public.community_question_outcome_events (
    post_id, answer_comment_id, previous_outcome, outcome, actor_id
  ) VALUES (
    p_post_id, v_post.accepted_answer_comment_id, v_previous, p_outcome,
    p_actor_profile_id
  );

  RETURN jsonb_build_object(
    'postId', p_post_id,
    'outcome', p_outcome,
    'changed', true
  );
END;
$$;

CREATE FUNCTION public.prevent_community_question_outcome_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'question outcome history is append-only';
END;
$$;
CREATE TRIGGER community_question_outcome_events_immutable
  BEFORE UPDATE OR DELETE ON public.community_question_outcome_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_community_question_outcome_event_mutation();

-- Helpful notifications aggregate per answer/day so a useful response does
-- not create one inbox row for every tap.
CREATE FUNCTION public.notify_answer_helpful()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post_id uuid;
  v_recipient_id uuid;
  v_existing public.notifications%ROWTYPE;
  v_count integer;
  v_actor text := public.notification_actor_label(NEW.profile_id);
BEGIN
  SELECT comment.post_id, comment.author_id
  INTO v_post_id, v_recipient_id
  FROM public.community_comments comment
  JOIN public.community_posts post ON post.id = comment.post_id
  WHERE comment.id = NEW.comment_id
    AND comment.status = 'active'
    AND comment.moderation_status = 'active'
    AND post.status = 'active'
    AND post.moderation_status = 'active';
  IF v_recipient_id IS NULL OR v_recipient_id = NEW.profile_id THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.profile_mutes
    WHERE muter_id = v_recipient_id AND muted_id = NEW.profile_id AND mute_notifications
  ) OR public.social_profiles_are_blocked(v_recipient_id, NEW.profile_id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_existing
  FROM public.notifications
  WHERE user_id = v_recipient_id
    AND type = 'answer_helpful'
    AND read_at IS NULL
    AND data->>'comment_id' = NEW.comment_id::text
    AND (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    v_count := COALESCE(jsonb_array_length(v_existing.data->'actor_ids'), 0);
    IF NOT (v_existing.data->'actor_ids' ? NEW.profile_id::text) THEN
      v_count := v_count + 1;
    END IF;
    UPDATE public.notifications
    SET title = v_count || ' Helpful mark' || CASE WHEN v_count = 1 THEN '' ELSE 's' END,
        body = CASE WHEN v_count = 1
          THEN v_actor || ' marked your answer Helpful'
          ELSE v_actor || ' and ' || (v_count - 1) || ' other' || CASE WHEN v_count = 2 THEN '' ELSE 's' END || ' marked your answer Helpful'
        END,
        data = v_existing.data
          || jsonb_build_object('count', v_count, 'latest_actor_id', NEW.profile_id)
          || CASE WHEN v_existing.data->'actor_ids' ? NEW.profile_id::text
               THEN '{}'::jsonb
               ELSE jsonb_build_object('actor_ids', (v_existing.data->'actor_ids') || to_jsonb(NEW.profile_id::text))
             END,
        created_at = now()
    WHERE id = v_existing.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_recipient_id,
    'answer_helpful',
    'Helpful mark on your answer',
    v_actor || ' marked your answer Helpful',
    jsonb_build_object(
      'post_id', v_post_id,
      'comment_id', NEW.comment_id,
      'count', 1,
      'latest_actor_id', NEW.profile_id,
      'actor_ids', jsonb_build_array(NEW.profile_id::text)
    )
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_comment_helpful_notify_author
  AFTER INSERT ON public.community_comment_helpful_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_answer_helpful();

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
    WHEN 'post_likes' THEN 'social'
    WHEN 'post_mention' THEN 'social'
    WHEN 'answer_accepted' THEN 'social'
    WHEN 'accepted_answer_unavailable' THEN 'social'
    WHEN 'answer_helpful' THEN 'social'
    WHEN 'group_post_removed' THEN 'groups'
    WHEN 'group_role_changed' THEN 'groups'
    WHEN 'group_invitation' THEN 'groups'
    WHEN 'group_join_request' THEN 'groups'
    WHEN 'group_join_decision' THEN 'groups'
    WHEN 'message_received' THEN 'messages'
    WHEN 'listing_inspection_requested' THEN 'marketplace'
    WHEN 'saved_listing_updated' THEN 'marketplace'
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

REVOKE ALL ON FUNCTION public.guard_community_question_outcome() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_community_comment_helpful(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_comment_helpful_summaries(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_community_question_outcome(uuid, uuid, public.community_question_outcome) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_community_question_outcome_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_answer_helpful() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_comment_helpful(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_comment_helpful_summaries(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_community_question_outcome(uuid, uuid, public.community_question_outcome) TO service_role;

COMMENT ON TABLE public.community_comment_helpful_reactions IS
  'Private member-to-answer Helpful edges; counts are disclosed only after canonical post visibility passes.';
COMMENT ON TABLE public.community_question_outcome_events IS
  'Append-only history of question-author outcomes, retained when accepted answers change or become unavailable.';
COMMENT ON COLUMN public.community_posts.question_outcome IS
  'Current outcome for the current accepted answer; cleared automatically when that answer changes.';

COMMIT;
