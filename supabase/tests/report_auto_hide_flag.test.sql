\set ON_ERROR_STOP on
BEGIN;

-- report_auto_hide (plan 3.4 / 30.2): with the flag off an ordinary report
-- opens a monitoring case and leaves the content up; urgent categories and
-- the legacy seven-argument call still hide.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ah-reporter@example.test', '', '{}', '{"username":"AhReporter"}', now(), now()),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ah-author@example.test', '', '{}', '{"username":"AhAuthor"}', now(), now()),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ah-second@example.test', '', '{}', '{"username":"AhSecond"}', now(), now());
UPDATE public.profiles SET is_public = true, default_post_audience = 'public' WHERE auth_user_id::text LIKE 'd0000000-%';

SELECT id AS reporter FROM public.profiles WHERE auth_user_id = 'd0000000-0000-0000-0000-000000000001' \gset
SELECT id AS author FROM public.profiles WHERE auth_user_id = 'd0000000-0000-0000-0000-000000000002' \gset
SELECT id AS second FROM public.profiles WHERE auth_user_id = 'd0000000-0000-0000-0000-000000000003' \gset

INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status) VALUES
  ('d0100000-0000-0000-0000-000000000001', :'author', 'Ordinary report, auto-hide off', 'public', 'active', 'active'),
  ('d0100000-0000-0000-0000-000000000002', :'author', 'Urgent report, auto-hide off', 'public', 'active', 'active'),
  ('d0100000-0000-0000-0000-000000000003', :'author', 'Legacy call', 'public', 'active', 'active');

SELECT active_revision_id AS rev1 FROM public.community_posts WHERE id = 'd0100000-0000-0000-0000-000000000001' \gset
SELECT active_revision_id AS rev2 FROM public.community_posts WHERE id = 'd0100000-0000-0000-0000-000000000002' \gset
SELECT active_revision_id AS rev3 FROM public.community_posts WHERE id = 'd0100000-0000-0000-0000-000000000003' \gset

-- 1. Flag off, ordinary reason: monitoring case, content stays visible.
SELECT public.submit_moderation_report(:'reporter', 'community_post', 'd0100000-0000-0000-0000-000000000001', :'rev1', 'spam', NULL, 'auto-hide-off-key-0001', false);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE id = 'd0100000-0000-0000-0000-000000000001' AND status = 'active' AND moderation_status = 'active') THEN
    RAISE EXCEPTION 'auto-hide off must leave an ordinary report visible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_cases WHERE entity_id = 'd0100000-0000-0000-0000-000000000001' AND state = 'monitoring') THEN
    RAISE EXCEPTION 'auto-hide off must still open a monitoring case';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_reports WHERE entity_id = 'd0100000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'the report itself must be recorded';
  END IF;
END
$$;

-- 2. Flag off, urgent reason: still hidden.
SELECT public.submit_moderation_report(:'reporter', 'community_post', 'd0100000-0000-0000-0000-000000000002', :'rev2', 'violence', NULL, 'auto-hide-off-key-0002', false);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE id = 'd0100000-0000-0000-0000-000000000002' AND status = 'hidden' AND moderation_status = 'pending_review') THEN
    RAISE EXCEPTION 'urgent reports hide regardless of the flag';
  END IF;
END
$$;

-- 3. Legacy seven-argument call keeps hiding.
SELECT public.submit_moderation_report(:'reporter', 'community_post', 'd0100000-0000-0000-0000-000000000003', :'rev3', 'spam', NULL, 'auto-hide-legacy-key-0003');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE id = 'd0100000-0000-0000-0000-000000000003' AND status = 'hidden') THEN
    RAISE EXCEPTION 'legacy call must keep auto-hide on';
  END IF;
  IF has_function_privilege('authenticated', 'public.submit_moderation_report(uuid,text,uuid,uuid,text,text,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'report RPC leaked to clients';
  END IF;
END
$$;

ROLLBACK;
