CREATE TYPE public.community_media_type AS ENUM ('image', 'video');

CREATE TABLE public.community_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url ~ '^https://'),
  media_type public.community_media_type NOT NULL,
  content_type text NOT NULL CHECK (content_type ~ '^(image|video)/'),
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 0 AND 9),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, sort_order)
);

CREATE INDEX community_post_media_post_id_idx
  ON public.community_post_media(post_id, sort_order);

ALTER TABLE public.community_post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_post_media_select_visible
  ON public.community_post_media
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_posts post
      WHERE post.id = post_id
        AND (
          post.status = 'active'
          OR post.author_id = public.get_my_profile_id()
          OR public.get_my_role() = 'admin'
        )
    )
  );

CREATE POLICY community_post_media_insert_own
  ON public.community_post_media
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploader_id = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1
      FROM public.community_posts post
      WHERE post.id = post_id
        AND post.author_id = public.get_my_profile_id()
    )
  );

CREATE POLICY community_post_media_update_own
  ON public.community_post_media
  FOR UPDATE
  TO authenticated
  USING (uploader_id = public.get_my_profile_id())
  WITH CHECK (
    uploader_id = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1
      FROM public.community_posts post
      WHERE post.id = post_id
        AND post.author_id = public.get_my_profile_id()
    )
  );

CREATE POLICY community_post_media_delete_own
  ON public.community_post_media
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_posts post
      WHERE post.id = post_id
        AND post.author_id = public.get_my_profile_id()
    )
  );

CREATE POLICY community_post_media_admin
  ON public.community_post_media
  FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

GRANT SELECT ON public.community_post_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_post_media TO authenticated;
GRANT SELECT ON public.community_posts TO anon, authenticated;
GRANT SELECT ON public.conversation_participants TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
