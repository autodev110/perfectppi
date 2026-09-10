BEGIN;

-- Community is delivered through viewer-aware server DTOs. Raw table reads
-- would let clients request internal moderation columns even when row policies
-- correctly hide other rows, so neither anonymous nor authenticated clients
-- receive table-level SELECT privileges.
REVOKE SELECT ON public.community_posts FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.community_comments FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.community_post_media FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS community_posts_select_active ON public.community_posts;
CREATE POLICY community_posts_select_active ON public.community_posts
  FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    AND moderation_status = 'active'
    AND public.get_my_profile_id() IS NOT NULL
  );

DROP POLICY IF EXISTS community_comments_select_active ON public.community_comments;
CREATE POLICY community_comments_select_active ON public.community_comments
  FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    AND moderation_status = 'active'
    AND public.get_my_profile_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.community_posts post
      WHERE post.id = community_comments.post_id
        AND post.status = 'active'
        AND post.moderation_status = 'active'
    )
  );

DROP POLICY IF EXISTS community_post_media_select_visible ON public.community_post_media;
CREATE POLICY community_post_media_select_visible ON public.community_post_media
  FOR SELECT
  TO authenticated
  USING (
    (
      moderation_status = 'active'
      AND public.get_my_profile_id() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.community_posts post
        WHERE post.id = post_id
          AND post.status = 'active'
          AND post.moderation_status = 'active'
      )
    )
    OR uploader_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

COMMIT;
