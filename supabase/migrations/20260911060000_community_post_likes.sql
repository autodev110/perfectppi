BEGIN;

CREATE TABLE public.community_post_likes (
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, profile_id)
);

CREATE INDEX community_post_likes_profile_idx
  ON public.community_post_likes(profile_id, created_at DESC);

ALTER TABLE public.community_post_likes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_post_likes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_post_likes TO service_role;

CREATE FUNCTION public.set_community_post_like(
  p_actor_profile_id uuid,
  p_post_id uuid,
  p_liked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author_id uuid;
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_actor_profile_id::text || ':' || p_post_id::text, 0)
  );

  SELECT post.author_id INTO v_author_id
  FROM public.community_posts post
  WHERE post.id = p_post_id
    AND post.status = 'active'
    AND post.moderation_status = 'active'
    AND public.social_can_view_community_post(
      p_actor_profile_id, post.id, false
    )
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'post unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_author_id = p_actor_profile_id THEN
    RAISE EXCEPTION 'authors cannot like their own posts' USING ERRCODE = 'check_violation';
  END IF;

  IF p_liked THEN
    INSERT INTO public.community_post_likes (post_id, profile_id)
    VALUES (p_post_id, p_actor_profile_id)
    ON CONFLICT (post_id, profile_id) DO NOTHING;
  ELSE
    DELETE FROM public.community_post_likes
    WHERE post_id = p_post_id AND profile_id = p_actor_profile_id;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.community_post_likes likes
  WHERE likes.post_id = p_post_id;

  RETURN jsonb_build_object(
    'postId', p_post_id,
    'liked', p_liked,
    'likeCount', v_count
  );
END;
$$;

CREATE FUNCTION public.community_post_like_summaries(
  p_viewer_id uuid,
  p_post_ids uuid[]
)
RETURNS TABLE(post_id uuid, like_count bigint, liked_by_viewer boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT post.id,
         count(likes.profile_id)::bigint,
         COALESCE(bool_or(likes.profile_id = p_viewer_id), false)
  FROM (
    SELECT DISTINCT unnest(p_post_ids) AS id
  ) requested
  JOIN public.community_posts post ON post.id = requested.id
  LEFT JOIN public.community_post_likes likes ON likes.post_id = post.id
  WHERE public.social_can_view_community_post(p_viewer_id, post.id, false)
  GROUP BY post.id;
$$;

REVOKE ALL ON FUNCTION public.set_community_post_like(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_post_like_summaries(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_post_like(uuid, uuid, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.community_post_like_summaries(uuid, uuid[])
  TO service_role;

COMMENT ON TABLE public.community_post_likes IS
  'Private post-like edges. Counts are exposed only after canonical post visibility succeeds.';

COMMIT;
