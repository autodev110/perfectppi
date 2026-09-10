\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('57000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'flags-admin@example.test', '',
   '{}', '{"username":"FlagsAdmin"}', now(), now()),
  ('57000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'flags-member@example.test', '',
   '{}', '{"username":"FlagsMember"}', now(), now()),
  ('57000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'flags-pending@example.test', '',
   '{}', '{}', now(), now());

UPDATE public.profiles SET role = 'admin'
WHERE auth_user_id = '57000000-0000-0000-0000-000000000001';

-- Launch configuration is seeded for every environment (plan 3.6).
DO $$
BEGIN
  IF (SELECT count(*) FROM public.product_feature_flags) <> 33 THEN
    RAISE EXCEPTION 'expected 11 flags x 3 environments, got %',
      (SELECT count(*) FROM public.product_feature_flags);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_feature_flags
    WHERE flag_code = 'community_video_uploads' AND enabled
  ) THEN RAISE EXCEPTION 'community video must be off in every environment'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_feature_flags
    WHERE flag_code = 'automated_post_moderation' AND enabled
  ) THEN RAISE EXCEPTION 'AI publication gate must be off in launch mode'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_feature_flags
    WHERE flag_code IN ('report_auto_hide', 'specialist_image_safeguard') AND NOT enabled
  ) THEN RAISE EXCEPTION 'safety controls must be on'; END IF;
  IF has_table_privilege('authenticated', 'public.product_feature_flags', 'SELECT')
     OR has_table_privilege('anon', 'public.product_feature_flags', 'SELECT')
     OR has_table_privilege('authenticated', 'public.product_feature_flag_changes', 'SELECT') THEN
    RAISE EXCEPTION 'flag tables must be service-only';
  END IF;
END
$$;

-- An ordinary member cannot change flags.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"57000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_product_feature_flag('production', 'community_video_uploads', true, 'member trying to enable video');
    RAISE EXCEPTION 'FAIL - member changed a feature flag';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- Neither can a pending (NULL-role) account.
SELECT set_config('request.jwt.claims',
  '{"sub":"57000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_product_feature_flag('production', 'community_video_uploads', true, 'pending account trying to enable video');
    RAISE EXCEPTION 'FAIL - pending account changed a feature flag';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- An admin can, with a reason, and the change is audited and versioned.
SELECT set_config('request.jwt.claims',
  '{"sub":"57000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE
  updated public.product_feature_flags%ROWTYPE;
BEGIN
  BEGIN
    PERFORM public.set_product_feature_flag('production', 'community_photo_uploads', false, 'short');
    RAISE EXCEPTION 'FAIL - flag changed without an adequate reason';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.set_product_feature_flag('production', 'not_a_flag', false, 'incident: unknown code');
    RAISE EXCEPTION 'FAIL - unknown flag accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  updated := public.set_product_feature_flag(
    'production', 'community_photo_uploads', false,
    'incident 42: specialist safeguard degraded'
  );
  IF updated.enabled OR updated.version <> 2 THEN
    RAISE EXCEPTION 'flag toggle did not apply or bump the version: %', updated;
  END IF;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product_feature_flag_changes change
    JOIN public.profiles actor ON actor.id = change.actor_id
    WHERE change.environment = 'production'
      AND change.flag_code = 'community_photo_uploads'
      AND change.previous_enabled = true AND change.next_enabled = false
      AND change.version = 2
      AND actor.auth_user_id = '57000000-0000-0000-0000-000000000001'
  ) THEN RAISE EXCEPTION 'flag change was not audited with its actor'; END IF;

  -- Other environments are untouched.
  IF NOT EXISTS (
    SELECT 1 FROM public.product_feature_flags
    WHERE environment = 'preview' AND flag_code = 'community_photo_uploads' AND enabled
  ) THEN RAISE EXCEPTION 'a production change leaked into preview'; END IF;

  BEGIN
    DELETE FROM public.product_feature_flag_changes WHERE flag_code = 'community_photo_uploads';
    RAISE EXCEPTION 'FAIL - flag change history was deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END
$$;

ROLLBACK;
