-- Device tokens for native push notifications (APNs initially; FCM-ready)

CREATE TYPE device_platform AS ENUM ('ios', 'android');
CREATE TYPE device_env AS ENUM ('prod', 'sandbox');

CREATE TABLE device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform device_platform NOT NULL,
  env device_env NOT NULL DEFAULT 'prod',
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, token)
);

CREATE INDEX device_tokens_profile_id_idx ON device_tokens(profile_id);
CREATE INDEX device_tokens_token_idx ON device_tokens(token);

-- RLS — owners can read/write only their own rows; service role bypasses.
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_tokens_owner_select ON device_tokens
  FOR SELECT
  USING (profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY device_tokens_owner_insert ON device_tokens
  FOR INSERT
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY device_tokens_owner_delete ON device_tokens
  FOR DELETE
  USING (profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY device_tokens_owner_update ON device_tokens
  FOR UPDATE
  USING (profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
