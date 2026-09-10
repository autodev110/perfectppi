BEGIN;

-- Claimed, corrected, deleted, and platform-reserved names all stay here so a
-- public identity can never be silently recycled.
CREATE TABLE IF NOT EXISTS public.username_reservations (
  normalized_username text PRIMARY KEY,
  display_username text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN (
    'claimed', 'generated_backfill', 'legacy_tombstone',
    'admin_correction', 'platform_reserved', 'account_deleted'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.username_correction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_username text NOT NULL,
  new_username text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.username_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.username_correction_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.username_reservations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.username_correction_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.username_reservations TO service_role;
GRANT ALL ON public.username_correction_events TO service_role;

INSERT INTO public.username_reservations (
  normalized_username, display_username, reason
)
SELECT reserved_name, reserved_name, 'platform_reserved'
FROM unnest(ARRAY[
  'admin', 'administrator', 'api', 'billing', 'childsafety', 'compliance',
  'copyright', 'help', 'legal', 'moderation', 'moderator', 'perfectppi',
  'privacy', 'root', 'safety', 'security', 'staff', 'support', 'system',
  'trust', 'verified'
]) AS reserved_name
ON CONFLICT (normalized_username) DO NOTHING;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_normalized text,
  ADD COLUMN IF NOT EXISTS username_state text NOT NULL DEFAULT 'pending';

-- Preserve old links privately before replacing invalid or conflicting names.
INSERT INTO public.username_reservations (
  normalized_username, display_username, profile_id, reason
)
SELECT DISTINCT ON (lower(trim(username)))
  lower(trim(username)), username, id, 'legacy_tombstone'
FROM public.profiles
WHERE username IS NOT NULL AND trim(username) <> ''
ORDER BY lower(trim(username)), created_at, id
ON CONFLICT (normalized_username) DO NOTHING;

-- Existing accounts receive a valid non-identifying name. Valid legacy names
-- are kept when their case-insensitive reservation belongs to that profile.
DO $$
DECLARE
  profile_record record;
  candidate text;
  candidate_normalized text;
  reservation_owner uuid;
  inserted_count integer;
BEGIN
  FOR profile_record IN
    SELECT id, username FROM public.profiles ORDER BY created_at, id
  LOOP
    candidate := trim(profile_record.username);
    candidate_normalized := lower(candidate);

    SELECT profile_id INTO reservation_owner
    FROM public.username_reservations
    WHERE normalized_username = candidate_normalized;

    IF candidate ~ '^[A-Za-z0-9_]{4,16}$'
       AND reservation_owner = profile_record.id THEN
      UPDATE public.username_reservations
      SET display_username = candidate, reason = 'claimed'
      WHERE normalized_username = candidate_normalized;
    ELSE
      LOOP
        candidate := 'driver' || substring(
          replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 10
        );
        candidate_normalized := lower(candidate);
        INSERT INTO public.username_reservations (
          normalized_username, display_username, profile_id, reason
        ) VALUES (
          candidate_normalized, candidate, profile_record.id, 'generated_backfill'
        )
        ON CONFLICT (normalized_username) DO NOTHING;
        GET DIAGNOSTICS inserted_count = ROW_COUNT;
        EXIT WHEN inserted_count = 1;
      END LOOP;
    END IF;

    UPDATE public.profiles
    SET username = candidate,
        username_normalized = candidate_normalized,
        username_state = 'claimed'
    WHERE id = profile_record.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_normalized_unique
  ON public.profiles(username_normalized)
  WHERE username_normalized IS NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_lifecycle_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_lifecycle_check CHECK (
    (
      username_state = 'pending'
      AND username IS NULL
      AND username_normalized IS NULL
    ) OR (
      username_state = 'claimed'
      AND username IS NOT NULL
      AND username ~ '^[A-Za-z0-9_]{4,16}$'
      AND username_normalized = lower(username)
    )
  );

-- Most existing RLS policies use these helpers. Returning no identity for a
-- pending profile prevents it from reading or mutating ordinary product data.
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id
  FROM public.profiles
  WHERE auth_user_id = auth.uid()
    AND username_state = 'claimed';
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role
  FROM public.profiles
  WHERE auth_user_id = auth.uid()
    AND username_state = 'claimed';
$$;

CREATE OR REPLACE FUNCTION public.set_profile_username_internal(
  p_profile_id uuid,
  p_username text,
  p_reason text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  display_value text := trim(p_username);
  normalized_value text := lower(trim(p_username));
  updated_profile public.profiles%ROWTYPE;
  inserted_count integer;
  previous_write_setting text := current_setting('app.username_write', true);
BEGIN
  IF display_value IS NULL OR display_value !~ '^[A-Za-z0-9_]{4,16}$' THEN
    RAISE EXCEPTION 'Username must be 4-16 characters using letters, numbers, and underscores only'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.username_reservations (
    normalized_username, display_username, profile_id, reason
  ) VALUES (
    normalized_value, display_value, p_profile_id, p_reason
  )
  ON CONFLICT (normalized_username) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 0 THEN
    SELECT * INTO updated_profile
    FROM public.profiles
    WHERE id = p_profile_id
      AND username_normalized = normalized_value
      AND username_state = 'claimed';
    IF FOUND THEN
      PERFORM set_config('app.username_write', 'allowed', true);
      UPDATE public.profiles
      SET username = display_value,
          username_normalized = normalized_value
      WHERE id = p_profile_id
      RETURNING * INTO updated_profile;
      UPDATE public.username_reservations
      SET display_username = display_value,
          reason = p_reason
      WHERE normalized_username = normalized_value;
      PERFORM set_config('app.username_write', COALESCE(previous_write_setting, ''), true);
      RETURN updated_profile;
    END IF;

    RAISE EXCEPTION 'Username is unavailable'
      USING ERRCODE = '23505', CONSTRAINT = 'username_reservations_pkey';
  END IF;

  PERFORM set_config('app.username_write', 'allowed', true);
  UPDATE public.profiles
  SET username = display_value,
      username_normalized = normalized_value,
      username_state = 'claimed'
  WHERE id = p_profile_id
  RETURNING * INTO updated_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.username_write', COALESCE(previous_write_setting, ''), true);
  RETURN updated_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_own_username(p_username text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  profile_record public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile_record
  FROM public.profiles
  WHERE auth_user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF profile_record.username_state <> 'pending' THEN
    RAISE EXCEPTION 'Username has already been claimed' USING ERRCODE = '23505';
  END IF;

  RETURN public.set_profile_username_internal(profile_record.id, p_username, 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT trim(p_username) ~ '^[A-Za-z0-9_]{4,16}$'
    AND NOT EXISTS (
      SELECT 1 FROM public.username_reservations
      WHERE normalized_username = lower(trim(p_username))
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_correct_username(
  p_profile_id uuid,
  p_username text,
  p_reason text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_profile_id uuid := public.get_my_profile_id();
  previous_profile public.profiles%ROWTYPE;
  updated_profile public.profiles%ROWTYPE;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF char_length(trim(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A correction reason between 10 and 500 characters is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO previous_profile
  FROM public.profiles
  WHERE id = p_profile_id
  FOR UPDATE;
  IF NOT FOUND OR previous_profile.username_state <> 'claimed' THEN
    RAISE EXCEPTION 'Profile is not eligible for correction' USING ERRCODE = 'P0002';
  END IF;

  updated_profile := public.set_profile_username_internal(
    p_profile_id, p_username, 'admin_correction'
  );

  INSERT INTO public.username_correction_events (
    actor_id, profile_id, previous_username, new_username, reason
  ) VALUES (
    actor_profile_id, p_profile_id, previous_profile.username,
    updated_profile.username, trim(p_reason)
  );

  RETURN updated_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_username_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       NEW.username IS DISTINCT FROM OLD.username
       OR NEW.username_normalized IS DISTINCT FROM OLD.username_normalized
       OR NEW.username_state IS DISTINCT FROM OLD.username_state
     )
     AND current_setting('app.username_write', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'Username cannot be changed through profile updates'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_username_change ON public.profiles;
CREATE TRIGGER profiles_guard_username_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_username_change();

-- New email accounts can provide a username in signup metadata. OAuth accounts
-- remain pending and are routed through the one-time claim screen.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  profile_id_value uuid;
  requested_username text;
BEGIN
  INSERT INTO public.profiles (
    auth_user_id, display_name, avatar_url, username_state
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'pending'
  )
  RETURNING id INTO profile_id_value;

  requested_username := NULLIF(trim(NEW.raw_user_meta_data->>'username'), '');
  IF requested_username IS NOT NULL THEN
    PERFORM public.set_profile_username_internal(
      profile_id_value, requested_username, 'claimed'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_username_internal(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_own_username(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_username_available(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_correct_username(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_username_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_profile_username_internal(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_own_username(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_username_available(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_correct_username(uuid, text, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_profile_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon, authenticated;

COMMIT;
