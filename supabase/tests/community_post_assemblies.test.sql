\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('64000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assembly-author@example.test', '', '{}', '{"username":"AssemblyAuthor"}', now(), now()),
  ('64000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assembly-other@example.test', '', '{}', '{"username":"AssemblyOther"}', now(), now());

UPDATE public.profiles SET is_public = true
WHERE auth_user_id IN (
  '64000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000002'
);

CREATE TEMP TABLE assembly_ids AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '64000000-0000-0000-0000-000000000001') author_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '64000000-0000-0000-0000-000000000002') other_id,
  '64000000-0000-0000-0000-000000000010'::uuid creation_token,
  '64000000-0000-0000-0000-000000000011'::uuid expiry_token;

SELECT public.create_community_post_assembly(
  author_id, creation_token, 2::smallint, 'public', NULL, NULL, NULL,
  'question', 'Photos must not publish one at a time.', 'active', NULL, now(), 'test-v1'
) AS post_id INTO TEMP TABLE created_assembly FROM assembly_ids;

DO $$
DECLARE v_first uuid;
DECLARE v_retry uuid;
BEGIN
  SELECT post_id INTO v_first FROM created_assembly;
  SELECT public.create_community_post_assembly(
    author_id, creation_token, 2::smallint, 'public', NULL, NULL, NULL,
    'question', 'Photos must not publish one at a time.', 'active', NULL, now(), 'test-v1'
  ) INTO v_retry FROM assembly_ids;
  IF v_retry <> v_first THEN RAISE EXCEPTION 'creation retry produced another post'; END IF;
  IF (SELECT count(*) FROM public.community_posts WHERE id = v_first) <> 1 THEN
    RAISE EXCEPTION 'idempotent assembly did not preserve exactly one post';
  END IF;
  IF EXISTS (SELECT 1 FROM public.community_posts WHERE id = v_first AND status = 'active') THEN
    RAISE EXCEPTION 'empty assembly was visible';
  END IF;
  IF has_table_privilege('authenticated', 'public.community_post_assemblies', 'SELECT')
     OR has_function_privilege('authenticated', 'public.finalize_community_post_assembly(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'private assembly capabilities leaked to authenticated clients';
  END IF;
  BEGIN
    PERFORM public.finalize_community_post_assembly(
      (SELECT author_id FROM assembly_ids), v_first
    );
    RAISE EXCEPTION 'incomplete media count finalized';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'incomplete media count finalized' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.finalize_community_post_assembly(
      (SELECT other_id FROM assembly_ids), v_first
    );
    RAISE EXCEPTION 'wrong owner finalized assembly';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'wrong owner finalized assembly' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO public.community_post_media (
  id, post_id, uploader_id, url, media_type, content_type, sort_order, moderation_status
)
SELECT '64000000-0000-0000-0000-000000000020'::uuid, post_id, author_id,
       'r2-private:///quarantine/community_post/author/draft/first.jpg',
       'image'::public.community_media_type, 'image/jpeg', 0, 'active'
FROM created_assembly CROSS JOIN assembly_ids
UNION ALL
SELECT '64000000-0000-0000-0000-000000000021'::uuid, post_id, author_id,
       'r2-private:///quarantine/community_post/author/draft/second.jpg',
       'image'::public.community_media_type, 'image/jpeg', 1, 'pending_review'
FROM created_assembly CROSS JOIN assembly_ids;

SELECT public.finalize_community_post_assembly(
  (SELECT author_id FROM assembly_ids), (SELECT post_id FROM created_assembly)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_post_assemblies assembly
    WHERE assembly.post_id = (SELECT post_id FROM created_assembly) AND assembly.state = 'submitted'
  ) THEN RAISE EXCEPTION 'pending media did not move assembly to submitted'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.community_posts post
    WHERE post.id = (SELECT post_id FROM created_assembly) AND post.status = 'active'
  ) THEN RAISE EXCEPTION 'pending media exposed a partial post'; END IF;
END
$$;

-- The media moderation transition is enough to complete the same assembly;
-- there is no second client-side publication race.
UPDATE public.community_post_media
SET moderation_status = 'active'
WHERE id = '64000000-0000-0000-0000-000000000021';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_post_assemblies assembly
    JOIN public.community_posts post ON post.id = assembly.post_id
    WHERE assembly.post_id = (SELECT post_id FROM created_assembly)
      AND assembly.state = 'finalized' AND post.status = 'active'
  ) THEN RAISE EXCEPTION 'approved assembly was not atomically published'; END IF;
END
$$;

-- If the client disappears after attaching its final item, the trigger still
-- makes the complete draft durable and visible in the owner's review queue.
SELECT public.create_community_post_assembly(
  author_id, '63000000-0000-0000-0000-000000000003', 1::smallint,
  'public', NULL, NULL, NULL, 'general', 'Interrupted upload.',
  'active', NULL, now(), 'test-v1'
) AS post_id INTO TEMP TABLE interrupted_assembly FROM assembly_ids;

INSERT INTO public.community_post_media (
  id, post_id, uploader_id, url, media_type, content_type, sort_order, moderation_status
)
SELECT '64000000-0000-0000-0000-000000000022'::uuid, post_id, author_id,
       'r2-private:///quarantine/community_post/author/interrupted/photo.jpg',
       'image'::public.community_media_type, 'image/jpeg', 0, 'pending_review'
FROM interrupted_assembly CROSS JOIN assembly_ids;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_post_assemblies assembly
    WHERE assembly.post_id = (SELECT post_id FROM interrupted_assembly)
      AND assembly.state = 'submitted'
      AND assembly.submitted_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'complete interrupted assembly was not preserved as submitted'; END IF;
END
$$;

-- An abandoned, clean assembly is removed by the existing storage worker's
-- database phase and its quarantine object is durably queued first.
SELECT public.create_community_post_assembly(
  author_id, expiry_token, 1::smallint, 'public', NULL, NULL, NULL,
  'general', 'Abandoned clean draft.', 'active', NULL, now(), 'test-v1'
) AS post_id INTO TEMP TABLE expired_assembly FROM assembly_ids;
UPDATE public.community_post_assemblies SET expires_at = now() - interval '1 minute'
WHERE post_id = (SELECT post_id FROM expired_assembly);
INSERT INTO public.community_upload_reservations (
  profile_id, post_id, storage_reference, expected_size, content_type
)
SELECT author_id, post_id,
       'r2-private:///quarantine/community_post/author/expired/photo.jpg', 100, 'image/jpeg'
FROM assembly_ids CROSS JOIN expired_assembly;

SELECT public.expire_community_post_assemblies(10);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.community_posts WHERE id = (SELECT post_id FROM expired_assembly)) THEN
    RAISE EXCEPTION 'expired assembly post survived cleanup';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.storage_cleanup_jobs
    WHERE storage_reference = 'r2-private:///quarantine/community_post/author/expired/photo.jpg'
      AND reason = 'expired_post_assembly'
  ) THEN RAISE EXCEPTION 'expired assembly object was not queued for cleanup'; END IF;
END
$$;

ROLLBACK;
