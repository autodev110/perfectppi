\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('58000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'media-author@example.test', '',
   '{}', '{"username":"MediaAuthor"}', now(), now());
SELECT set_config('test.author_id', (SELECT id::text FROM public.profiles
  WHERE auth_user_id = '58000000-0000-0000-0000-000000000001'), true);
UPDATE public.profiles SET is_public = true, default_post_audience = 'public'
WHERE id = current_setting('test.author_id')::uuid;

INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
VALUES ('58100000-0000-0000-0000-000000000001', current_setting('test.author_id')::uuid,
  'Private media post', 'public', 'active', 'active');

-- Quarantine (pending), approved private, and legacy public references are
-- all representable; anything else is not.
INSERT INTO public.community_post_media (
  id, post_id, uploader_id, url, media_type, content_type, sort_order, moderation_status
) VALUES
  ('58200000-0000-0000-0000-000000000001', '58100000-0000-0000-0000-000000000001',
   current_setting('test.author_id')::uuid,
   'r2-private:///quarantine/community_post/x/y/1.jpg', 'image', 'image/jpeg', 0, 'pending_scan'),
  ('58200000-0000-0000-0000-000000000002', '58100000-0000-0000-0000-000000000001',
   current_setting('test.author_id')::uuid,
   'r2-private:///community_post/x/y/2-abcdef0123456789.jpg', 'image', 'image/jpeg', 1, 'active'),
  ('58200000-0000-0000-0000-000000000003', '58100000-0000-0000-0000-000000000001',
   current_setting('test.author_id')::uuid,
   'https://pub.example.test/community_post/x/y/3.jpg', 'image', 'image/jpeg', 2, 'active');

UPDATE public.community_post_media
SET display_reference = 'r2-private:///community_post/x/y/2-abcdef0123456789-display.webp',
    content_sha256 = repeat('a', 64)
WHERE id = '58200000-0000-0000-0000-000000000002';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.community_post_media (
      post_id, uploader_id, url, media_type, content_type, sort_order
    ) VALUES (
      '58100000-0000-0000-0000-000000000001', current_setting('test.author_id')::uuid,
      'r2-private:///somewhere/else/4.jpg', 'image', 'image/jpeg', 3
    );
    RAISE EXCEPTION 'FAIL - unknown private keyspace accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.community_post_media
    SET display_reference = 'https://pub.example.test/leak.webp'
    WHERE id = '58200000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'FAIL - a public display reference was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.community_post_media SET content_sha256 = 'not-a-hash'
    WHERE id = '58200000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'FAIL - malformed hash accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

-- Launch readiness counter (plan 19.2 / 39).
DO $$
DECLARE
  status jsonb := public.community_media_storage_status();
BEGIN
  IF (status->>'legacyPublicObjects')::int < 1 THEN
    RAISE EXCEPTION 'legacy public object was not counted: %', status;
  END IF;
  IF (status->>'privateObjects')::int < 1 OR (status->>'quarantinedObjects')::int < 1 THEN
    RAISE EXCEPTION 'private/quarantined objects were not counted: %', status;
  END IF;
END
$$;

-- Migration bookkeeping: switching the reference records the retired URL and
-- stays "unverified" until the external probe confirms it is gone.
UPDATE public.community_post_media
SET url = 'r2-private:///community_post/x/y/3-0123456789abcdef.jpg',
    display_reference = 'r2-private:///community_post/x/y/3-0123456789abcdef-display.webp',
    content_sha256 = repeat('b', 64),
    legacy_public_url = 'https://pub.example.test/community_post/x/y/3.jpg'
WHERE id = '58200000-0000-0000-0000-000000000003';

DO $$
DECLARE
  status jsonb := public.community_media_storage_status();
BEGIN
  IF (status->>'unverifiedRetirements')::int <> 1 THEN
    RAISE EXCEPTION 'retirement was not tracked as unverified: %', status;
  END IF;
END
$$;

UPDATE public.community_post_media SET storage_migrated_at = now()
WHERE id = '58200000-0000-0000-0000-000000000003';

DO $$
DECLARE
  status jsonb := public.community_media_storage_status();
BEGIN
  IF (status->>'unverifiedRetirements')::int <> 0 THEN
    RAISE EXCEPTION 'verified retirement still counted: %', status;
  END IF;
  IF has_function_privilege('authenticated', 'public.community_media_storage_status()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.community_media_storage_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'storage status must be service-only';
  END IF;
END
$$;

-- Restricted-evidence reads are an auditable event type.
INSERT INTO public.moderation_items (
  entity_type, entity_id, author_id, status, risk_level, decision,
  reason_codes, content_preview, model_provider, model_version, report_count
) VALUES (
  'community_post_media', '58200000-0000-0000-0000-000000000002',
  current_setting('test.author_id')::uuid, 'active', 'none', 'allow',
  '{}', 'image upload', 'launch_policy', 'test', 0
);
INSERT INTO public.moderation_events (
  moderation_item_id, actor_type, actor_id, event_type, previous_status, next_status, metadata
)
SELECT id, 'admin', current_setting('test.author_id')::uuid, 'evidence_accessed', 'active', 'active',
  '{"variant":"original"}'::jsonb
FROM public.moderation_items
WHERE entity_type = 'community_post_media'
  AND entity_id = '58200000-0000-0000-0000-000000000002';

ROLLBACK;
