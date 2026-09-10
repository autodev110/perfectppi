-- PostgreSQL requires newly added enum values to commit before they are used.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'answer_accepted';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'accepted_answer_unavailable';

BEGIN;

CREATE TYPE public.community_post_type AS ENUM ('general', 'question');

ALTER TABLE public.community_posts
  ADD COLUMN post_type public.community_post_type NOT NULL DEFAULT 'general',
  ADD COLUMN accepted_answer_comment_id uuid
    REFERENCES public.community_comments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX community_posts_accepted_answer_unique_idx
  ON public.community_posts(accepted_answer_comment_id)
  WHERE accepted_answer_comment_id IS NOT NULL;
CREATE INDEX community_posts_type_created_idx
  ON public.community_posts(post_type, created_at DESC, id DESC)
  WHERE status = 'active';

ALTER TABLE public.community_post_revisions
  ADD COLUMN post_type public.community_post_type NOT NULL DEFAULT 'general';

CREATE TABLE public.community_answer_selection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  previous_comment_id uuid,
  selected_comment_id uuid,
  action text NOT NULL CHECK (action IN ('selected', 'changed', 'cleared', 'answer_unavailable')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_answer_selection_events_post_idx
  ON public.community_answer_selection_events(post_id, created_at DESC, id DESC);

ALTER TABLE public.community_answer_selection_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_answer_selection_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.community_answer_selection_events TO service_role;

CREATE OR REPLACE FUNCTION public.guard_community_question_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.accepted_answer_comment_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.post_type <> 'question' THEN
    RAISE EXCEPTION 'accepted answers require a question post';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.community_comments comment
    WHERE comment.id = NEW.accepted_answer_comment_id
      AND comment.post_id = NEW.id
      AND comment.author_id <> NEW.author_id
      AND comment.status = 'active'
      AND comment.moderation_status = 'active'
  ) THEN
    RAISE EXCEPTION 'accepted answer must be an active response by another member';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_posts_guard_question_state
  BEFORE INSERT OR UPDATE OF post_type, accepted_answer_comment_id, author_id
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_question_state();

CREATE OR REPLACE FUNCTION public.capture_community_post_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
  v_is_edit boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.active_revision_id := COALESCE(NEW.active_revision_id, gen_random_uuid());
    RETURN NEW;
  END IF;

  v_is_edit := NEW.content IS DISTINCT FROM OLD.content
    OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
    OR NEW.marketplace_listing_id IS DISTINCT FROM OLD.marketplace_listing_id
    OR NEW.group_id IS DISTINCT FROM OLD.group_id
    OR NEW.post_type IS DISTINCT FROM OLD.post_type
    OR (
      NEW.audience IS DISTINCT FROM OLD.audience
      AND NOT (OLD.audience = 'public' AND NEW.audience = 'friends')
    );

  IF NEW.active_revision_id IS DISTINCT FROM OLD.active_revision_id AND NOT v_is_edit THEN
    RAISE EXCEPTION 'active revision is managed by the revision trigger';
  END IF;
  IF v_is_edit THEN
    IF OLD.status <> 'active' OR OLD.moderation_status <> 'active' THEN
      RAISE EXCEPTION 'content under review or removal cannot be edited';
    END IF;
    IF OLD.post_type = 'question' AND NEW.post_type <> 'question'
       AND OLD.accepted_answer_comment_id IS NOT NULL THEN
      RAISE EXCEPTION 'clear the accepted answer before changing post type';
    END IF;
    SELECT revision_number + 1 INTO v_revision_number
    FROM public.community_post_revisions
    WHERE id = OLD.active_revision_id;
    IF v_revision_number IS NULL THEN
      RAISE EXCEPTION 'active post revision is unavailable';
    END IF;
    NEW.active_revision_id := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_community_post_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_revision_number := 1;
  ELSE
    IF NEW.active_revision_id IS NOT DISTINCT FROM OLD.active_revision_id THEN
      RETURN NEW;
    END IF;
    SELECT revision_number + 1 INTO v_revision_number
    FROM public.community_post_revisions
    WHERE id = OLD.active_revision_id;
  END IF;

  INSERT INTO public.community_post_revisions (
    id, post_id, revision_number, content, audience, vehicle_id,
    marketplace_listing_id, author_id, group_id, group_status, post_type
  ) VALUES (
    NEW.active_revision_id, NEW.id, v_revision_number, NEW.content, NEW.audience,
    NEW.vehicle_id, NEW.marketplace_listing_id, NEW.author_id, NEW.group_id,
    NEW.group_status, NEW.post_type
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER community_posts_capture_revision ON public.community_posts;
DROP TRIGGER community_posts_persist_revision ON public.community_posts;
CREATE TRIGGER community_posts_capture_revision
  BEFORE INSERT OR UPDATE OF content, audience, vehicle_id, marketplace_listing_id,
    group_id, group_status, post_type, active_revision_id
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.capture_community_post_revision();
CREATE TRIGGER community_posts_persist_revision
  AFTER INSERT OR UPDATE OF content, audience, vehicle_id, marketplace_listing_id,
    group_id, group_status, post_type, active_revision_id
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.persist_community_post_revision();

CREATE FUNCTION public.set_accepted_community_answer(
  p_actor_profile_id uuid,
  p_post_id uuid,
  p_comment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.community_posts%ROWTYPE;
  v_comment public.community_comments%ROWTYPE;
  v_previous uuid;
  v_action text;
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
     OR v_post.status <> 'active'
     OR v_post.moderation_status <> 'active'
     OR v_post.group_status <> 'active' THEN
    RAISE EXCEPTION 'question unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_previous := v_post.accepted_answer_comment_id;
  IF v_previous IS NOT DISTINCT FROM p_comment_id THEN
    RETURN jsonb_build_object(
      'postId', p_post_id,
      'acceptedAnswerCommentId', p_comment_id,
      'changed', false
    );
  END IF;

  IF p_comment_id IS NOT NULL THEN
    SELECT * INTO v_comment
    FROM public.community_comments comment
    WHERE comment.id = p_comment_id
      AND comment.post_id = p_post_id
      AND comment.status = 'active'
      AND comment.moderation_status = 'active'
      AND public.social_can_view_profile(p_actor_profile_id, comment.author_id);
    IF NOT FOUND OR v_comment.author_id = v_post.author_id THEN
      RAISE EXCEPTION 'answer unavailable' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.community_posts
  SET accepted_answer_comment_id = p_comment_id
  WHERE id = p_post_id;

  v_action := CASE
    WHEN p_comment_id IS NULL THEN 'cleared'
    WHEN v_previous IS NULL THEN 'selected'
    ELSE 'changed'
  END;
  INSERT INTO public.community_answer_selection_events (
    post_id, previous_comment_id, selected_comment_id, action, actor_id
  ) VALUES (p_post_id, v_previous, p_comment_id, v_action, p_actor_profile_id);

  IF p_comment_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_comment.author_id,
      'answer_accepted',
      'Your answer was accepted',
      'The question author selected your response as the accepted answer.',
      jsonb_build_object('post_id', p_post_id, 'comment_id', p_comment_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'postId', p_post_id,
    'acceptedAnswerCommentId', p_comment_id,
    'changed', true
  );
END;
$$;

CREATE FUNCTION public.clear_unavailable_accepted_answer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_post_id uuid;
  v_question_author uuid;
BEGIN
  IF NEW.status = 'active' AND NEW.moderation_status = 'active' THEN
    RETURN NEW;
  END IF;

  SELECT post.id, post.author_id
  INTO v_post_id, v_question_author
  FROM public.community_posts post
  WHERE post.accepted_answer_comment_id = NEW.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.community_posts
  SET accepted_answer_comment_id = NULL
  WHERE id = v_post_id;
  INSERT INTO public.community_answer_selection_events (
    post_id, previous_comment_id, selected_comment_id, action, actor_id
  ) VALUES (v_post_id, NEW.id, NULL, 'answer_unavailable', NULL);
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_question_author,
    'accepted_answer_unavailable',
    'Accepted answer unavailable',
    'The accepted response is no longer available. You can select another answer.',
    jsonb_build_object('post_id', v_post_id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_comments_clear_unavailable_answer
  AFTER UPDATE OF status, moderation_status
  ON public.community_comments
  FOR EACH ROW
  WHEN (
    (OLD.status IS DISTINCT FROM NEW.status OR OLD.moderation_status IS DISTINCT FROM NEW.moderation_status)
    AND (NEW.status <> 'active' OR NEW.moderation_status <> 'active')
  )
  EXECUTE FUNCTION public.clear_unavailable_accepted_answer();

REVOKE ALL ON FUNCTION public.set_accepted_community_answer(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_accepted_community_answer(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.guard_community_question_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_unavailable_accepted_answer() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.community_posts.accepted_answer_comment_id IS
  'Current visible accepted answer. Historical selections remain in community_answer_selection_events.';

COMMIT;
