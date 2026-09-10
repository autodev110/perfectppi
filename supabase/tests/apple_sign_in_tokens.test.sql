\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('62000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'apple-user@example.test', '',
   '{"provider":"apple","providers":["apple"]}', '{}', now(), now());
SELECT set_config('test.profile_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '62000000-0000-0000-0000-000000000001'), true);

-- An Apple sign-in lands as a pending profile: the username gate applies
-- identically to Apple and Google (plan 8.2 / 36.1).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = current_setting('test.profile_id')::uuid AND username_state = 'pending' AND username IS NULL) THEN
    RAISE EXCEPTION 'Apple sign-in did not leave the profile pending a username';
  END IF;
END
$$;

INSERT INTO public.apple_sign_in_tokens (profile_id, apple_user_id, refresh_token_ciphertext)
VALUES (current_setting('test.profile_id')::uuid, '001234.abcdef', 'v1.iv.tag.ciphertext');

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.apple_sign_in_tokens', 'SELECT')
     OR has_table_privilege('anon', 'public.apple_sign_in_tokens', 'SELECT') THEN
    RAISE EXCEPTION 'Apple token custody must be service-only';
  END IF;
  BEGIN
    UPDATE public.apple_sign_in_tokens SET revoke_outcome = 'maybe' WHERE apple_user_id = '001234.abcdef';
    RAISE EXCEPTION 'FAIL - invalid revoke outcome accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

-- The row does not outlive the account: revocation runs before deletion
-- (fulfillment.ts), then the cascade removes custody.
DELETE FROM auth.users WHERE id = '62000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.apple_sign_in_tokens WHERE apple_user_id = '001234.abcdef') THEN
    RAISE EXCEPTION 'Apple token row survived account deletion';
  END IF;
END
$$;

ROLLBACK;
