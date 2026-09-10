\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('65000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'like-author@example.test', '', '{}',
   '{"username":"LikeAuthor"}', now(), now()),
  ('65000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'like-reader@example.test', '', '{}',
   '{"username":"LikeReader"}', now(), now());

UPDATE public.profiles SET is_public = true
WHERE auth_user_id::text LIKE '65000000-%';

CREATE TEMP TABLE like_ids AS
SELECT
  max(id::text) FILTER (WHERE auth_user_id = '65000000-0000-0000-0000-000000000001')::uuid AS author_id,
  max(id::text) FILTER (WHERE auth_user_id = '65000000-0000-0000-0000-000000000002')::uuid AS reader_id
FROM public.profiles;

INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
)
SELECT '66000000-0000-0000-0000-000000000001', author_id,
       'A visible post', 'public', 'active', 'active'
FROM like_ids;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.community_post_likes', 'SELECT')
     OR has_function_privilege(
       'authenticated',
       'public.set_community_post_like(uuid,uuid,boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.community_post_like_summaries(uuid,uuid[])',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'like storage or mutation leaked to authenticated clients';
  END IF;
END
$$;

SELECT public.set_community_post_like(
  reader_id, '66000000-0000-0000-0000-000000000001', true
) FROM like_ids;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.community_post_like_summaries(
      (SELECT reader_id FROM like_ids),
      ARRAY['66000000-0000-0000-0000-000000000001'::uuid]
    ) summary
    WHERE summary.like_count = 1 AND summary.liked_by_viewer
  ) THEN
    RAISE EXCEPTION 'visible like summary did not return canonical viewer state';
  END IF;
END
$$;
SELECT public.set_community_post_like(
  reader_id, '66000000-0000-0000-0000-000000000001', true
) FROM like_ids;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.community_post_likes
      WHERE post_id = '66000000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'repeated like was not idempotent';
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.set_community_post_like(
      (SELECT author_id FROM like_ids),
      '66000000-0000-0000-0000-000000000001',
      true
    );
    RAISE EXCEPTION 'author liked own post';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

UPDATE public.community_posts SET status = 'hidden'
WHERE id = '66000000-0000-0000-0000-000000000001';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.community_post_like_summaries(
      (SELECT reader_id FROM like_ids),
      ARRAY['66000000-0000-0000-0000-000000000001'::uuid]
    )
  ) THEN
    RAISE EXCEPTION 'hidden post leaked through like summaries';
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.set_community_post_like(
      (SELECT reader_id FROM like_ids),
      '66000000-0000-0000-0000-000000000001',
      false
    );
    RAISE EXCEPTION 'hidden post accepted a reaction mutation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

UPDATE public.community_posts SET status = 'active'
WHERE id = '66000000-0000-0000-0000-000000000001';
SELECT public.set_community_post_like(
  reader_id, '66000000-0000-0000-0000-000000000001', false
) FROM like_ids;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.community_post_likes
    WHERE post_id = '66000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'unlike did not remove the active edge';
  END IF;
END
$$;

ROLLBACK;
