\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '53000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'community-viewer@example.test', '',
    '{}', '{"username":"FeedViewer"}', now(), now()
  ),
  (
    '53000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'community-pending@example.test', '',
    '{}', '{}', now(), now()
  );

INSERT INTO public.community_posts (
  author_id, content, status, moderation_status
) VALUES (
  (SELECT id FROM public.profiles
   WHERE auth_user_id = '53000000-0000-0000-0000-000000000001'),
  'Viewer-aware Community test post', 'active', 'active'
);

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.community_posts;
    RAISE EXCEPTION 'anonymous Community table read was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

DO $$
BEGIN
  BEGIN
    PERFORM moderation_reason FROM public.community_posts;
    RAISE EXCEPTION 'authenticated client could read raw Community rows';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
