BEGIN;

CREATE TYPE public.contact_identifier_kind AS ENUM ('email', 'phone');
CREATE TYPE public.vehicle_configuration_type AS ENUM ('stock', 'modified', 'custom_build');
CREATE TYPE public.vehicle_mileage_status AS ENUM ('actual', 'not_actual', 'unknown');

ALTER TABLE public.vehicles
  ADD COLUMN configuration_type public.vehicle_configuration_type NOT NULL DEFAULT 'stock',
  ADD COLUMN engine_original boolean NOT NULL DEFAULT true,
  ADD COLUMN transmission_original boolean NOT NULL DEFAULT true,
  ADD COLUMN drivetrain_original boolean NOT NULL DEFAULT true,
  ADD COLUMN mileage_status public.vehicle_mileage_status NOT NULL DEFAULT 'actual';

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_stock_configuration_consistent CHECK (
    configuration_type <> 'stock'
    OR (engine_original AND transmission_original AND drivetrain_original)
  );

COMMENT ON COLUMN public.vehicles.configuration_type IS
  'Owner-confirmed stock, modified, or custom-build state; custom build details live in vehicle_build_entries.';
COMMENT ON COLUMN public.vehicles.engine_original IS
  'Owner answer indicating whether the current engine is original to the vehicle.';
COMMENT ON COLUMN public.vehicles.transmission_original IS
  'Owner answer indicating whether the current transmission is original to the vehicle.';
COMMENT ON COLUMN public.vehicles.drivetrain_original IS
  'Owner answer indicating whether the current driven-wheel configuration is original to the vehicle.';
COMMENT ON COLUMN public.vehicles.mileage_status IS
  'Owner-reported confidence that mileage is actual, not actual, or unknown.';

CREATE TABLE public.profile_contact_identifiers (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind public.contact_identifier_kind NOT NULL,
  identifier_digest text NOT NULL CHECK (identifier_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, kind, identifier_digest),
  UNIQUE (kind, identifier_digest)
);

CREATE INDEX profile_contact_identifiers_digest_idx
  ON public.profile_contact_identifiers(kind, identifier_digest);

ALTER TABLE public.profile_contact_identifiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profile_contact_identifiers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.profile_contact_identifiers TO service_role;

COMMENT ON TABLE public.profile_contact_identifiers IS
  'Service-only SHA-256 contact lookup index. Raw emails, phone numbers, and address-book names are never stored here.';

CREATE FUNCTION public.normalized_contact_digest(
  p_kind public.contact_identifier_kind,
  p_value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_value IS NULL OR btrim(p_value) = '' THEN NULL
    WHEN p_kind = 'email' THEN encode(extensions.digest(lower(btrim(p_value)), 'sha256'), 'hex')
    ELSE encode(extensions.digest(regexp_replace(p_value, '[^0-9]', '', 'g'), 'sha256'), 'hex')
  END;
$$;

CREATE FUNCTION public.sync_auth_user_contact_identifiers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_phone text;
BEGIN
  SELECT profile.id INTO v_profile_id
  FROM public.profiles profile
  WHERE profile.auth_user_id = NEW.id;

  IF v_profile_id IS NULL THEN RETURN NEW; END IF;

  DELETE FROM public.profile_contact_identifiers identifier
  WHERE identifier.profile_id = v_profile_id;

  IF NULLIF(btrim(NEW.email), '') IS NOT NULL THEN
    INSERT INTO public.profile_contact_identifiers (profile_id, kind, identifier_digest)
    VALUES (v_profile_id, 'email', public.normalized_contact_digest('email', NEW.email))
    ON CONFLICT (kind, identifier_digest) DO NOTHING;
  END IF;

  -- Older local Auth schemas have no phone column. to_jsonb keeps this
  -- migration compatible while indexing verified phone values when present.
  v_phone := regexp_replace(COALESCE(to_jsonb(NEW)->>'phone', ''), '[^0-9]', '', 'g');
  IF char_length(v_phone) >= 7 THEN
    INSERT INTO public.profile_contact_identifiers (profile_id, kind, identifier_digest)
    VALUES (v_profile_id, 'phone', public.normalized_contact_digest('phone', v_phone))
    ON CONFLICT (kind, identifier_digest) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER zz_auth_user_contact_identifiers_sync
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_contact_identifiers();

INSERT INTO public.profile_contact_identifiers (profile_id, kind, identifier_digest)
SELECT profile.id, 'email', public.normalized_contact_digest('email', auth_user.email)
FROM auth.users auth_user
JOIN public.profiles profile ON profile.auth_user_id = auth_user.id
WHERE NULLIF(btrim(auth_user.email), '') IS NOT NULL
ON CONFLICT (kind, identifier_digest) DO NOTHING;

INSERT INTO public.profile_contact_identifiers (profile_id, kind, identifier_digest)
SELECT profile.id, 'phone', public.normalized_contact_digest('phone', to_jsonb(auth_user)->>'phone')
FROM auth.users auth_user
JOIN public.profiles profile ON profile.auth_user_id = auth_user.id
WHERE char_length(regexp_replace(COALESCE(to_jsonb(auth_user)->>'phone', ''), '[^0-9]', '', 'g')) >= 7
ON CONFLICT (kind, identifier_digest) DO NOTHING;

CREATE FUNCTION public.discover_contact_profiles(
  p_viewer_profile_id uuid,
  p_identifier_digests text[]
)
RETURNS TABLE(
  matched_digest text,
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_public boolean,
  relationship_state text,
  mutual_friend_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT ON (profile.id)
    identifier.identifier_digest,
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    profile.is_public,
    public.friend_relationship_state(p_viewer_profile_id, profile.id),
    (SELECT count(*)::integer FROM public.friend_mutual_ids(p_viewer_profile_id, profile.id))
  FROM public.profile_contact_identifiers identifier
  JOIN public.profiles profile ON profile.id = identifier.profile_id
  WHERE p_viewer_profile_id IS NOT NULL
    AND cardinality(COALESCE(p_identifier_digests, ARRAY[]::text[])) BETWEEN 1 AND 500
    AND identifier.identifier_digest = ANY(p_identifier_digests)
    AND identifier.identifier_digest ~ '^[0-9a-f]{64}$'
    AND profile.id <> p_viewer_profile_id
    AND profile.username_state = 'claimed'
    AND profile.discoverable
    AND public.social_can_view_profile(p_viewer_profile_id, profile.id)
    AND (
      profile.friend_request_policy <> 'nobody'
      OR public.friend_relationship_state(p_viewer_profile_id, profile.id) = 'friends'
    )
  ORDER BY profile.id, identifier.identifier_digest
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.normalized_contact_digest(public.contact_identifier_kind, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_auth_user_contact_identifiers()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discover_contact_profiles(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discover_contact_profiles(uuid, text[]) TO service_role;

COMMIT;
