BEGIN;

-- ---------------------------------------------------------------------------
-- Sign in with Apple token custody (plan 8.2 / 36.1; App Store 5.1.1(v)).
--
-- After a native Apple sign-in the app hands the server its one-time
-- authorization code; the server exchanges it for Apple's refresh token and
-- keeps it here, encrypted, solely so the token can be revoked when the
-- member deletes their account. Service-only: no client can read it.
-- ---------------------------------------------------------------------------
CREATE TABLE public.apple_sign_in_tokens (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  apple_user_id text NOT NULL,
  refresh_token_ciphertext text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoke_attempted_at timestamptz,
  revoke_outcome text CHECK (revoke_outcome IS NULL OR revoke_outcome IN ('revoked', 'already_invalid', 'failed')),
  last_error text
);
CREATE INDEX apple_sign_in_tokens_apple_user_idx ON public.apple_sign_in_tokens(apple_user_id);

ALTER TABLE public.apple_sign_in_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_sign_in_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apple_sign_in_tokens TO service_role;

COMMENT ON TABLE public.apple_sign_in_tokens IS
  'Encrypted Apple refresh tokens held only for revocation at account deletion.';

COMMIT;
