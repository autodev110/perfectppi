\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '41000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'media-owner@example.test', '',
    '{}', '{}', now(), now()
  ),
  (
    '41000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'media-stranger@example.test', '',
    '{}', '{}', now(), now()
  );

UPDATE public.profiles
SET id = CASE auth_user_id
  WHEN '41000000-0000-0000-0000-000000000001' THEN '41100000-0000-0000-0000-000000000001'::uuid
  WHEN '41000000-0000-0000-0000-000000000002' THEN '41100000-0000-0000-0000-000000000002'::uuid
END
WHERE auth_user_id IN (
  '41000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000002'
);

INSERT INTO public.community_posts (id, author_id, content, status) VALUES (
  '42000000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000001',
  'Ten-item media test',
  'active'
);

INSERT INTO public.conversations (id)
VALUES ('43000000-0000-0000-0000-000000000001');

INSERT INTO public.conversation_participants (conversation_id, profile_id)
VALUES (
  '43000000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000001'
);

INSERT INTO public.community_posts (id, author_id, content, status) VALUES (
  '42000000-0000-0000-0000-000000000002',
  '41100000-0000-0000-0000-000000000001',
  'Ownership media test',
  'active'
);

INSERT INTO public.community_post_media (
  post_id, uploader_id, url, media_type, content_type, sort_order
)
SELECT
  '42000000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000001',
  'https://media.example.test/' || position || '.jpg',
  'image',
  'image/jpeg',
  position
FROM generate_series(0, 9) AS position;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.conversation_participants
    WHERE conversation_id = '43000000-0000-0000-0000-000000000001'
      AND profile_id = '41100000-0000-0000-0000-000000000001'
  ) <> 1 THEN
    RAISE EXCEPTION 'conversation member cannot authorize an attachment upload';
  END IF;

  IF (
    SELECT count(*)
    FROM public.community_post_media
    WHERE post_id = '42000000-0000-0000-0000-000000000001'
  ) <> 10 THEN
    RAISE EXCEPTION 'server could not create a ten-item post carousel';
  END IF;

  BEGIN
    INSERT INTO public.community_post_media (
      post_id, uploader_id, url, media_type, content_type, sort_order
    ) VALUES (
      '42000000-0000-0000-0000-000000000002',
      '41100000-0000-0000-0000-000000000001',
      'https://media.example.test/direct-write.jpg',
      'image', 'image/jpeg', 0
    );
    RAISE EXCEPTION 'an authenticated client bypassed server moderation';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.community_post_media (
      post_id, uploader_id, url, media_type, content_type, sort_order
    )
    VALUES (
      '42000000-0000-0000-0000-000000000001',
      '41100000-0000-0000-0000-000000000001',
      'https://media.example.test/11.jpg',
      'image',
      'image/jpeg',
      10
    );
    RAISE EXCEPTION 'an eleventh post-media item was accepted';
  EXCEPTION
    WHEN check_violation OR insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.conversation_participants
    WHERE conversation_id = '43000000-0000-0000-0000-000000000001'
  ) <> 0 THEN
    RAISE EXCEPTION 'non-member can authorize an attachment upload';
  END IF;

  BEGIN
    INSERT INTO public.community_post_media (
      post_id, uploader_id, url, media_type, content_type, sort_order
    )
    VALUES (
      '42000000-0000-0000-0000-000000000002',
      '41100000-0000-0000-0000-000000000002',
      'https://media.example.test/not-mine.jpg',
      'image',
      'image/jpeg',
      0
    );
    RAISE EXCEPTION 'a user attached media to another author''s post';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK;
