BEGIN;

-- ---------------------------------------------------------------------------
-- Server-authoritative product feature flags (plan section 30.2).
--
-- Service-only records keyed by environment and stable flag code, plus an
-- append-only change log. The server reads these for every mutation; clients
-- receive a derived, read-only /api/capabilities view for presentation only.
-- ---------------------------------------------------------------------------
CREATE TABLE public.product_feature_flags (
  environment text NOT NULL CHECK (environment IN ('production', 'preview', 'development')),
  flag_code text NOT NULL CHECK (flag_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  enabled boolean NOT NULL,
  rollout_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, flag_code)
);

CREATE TABLE public.product_feature_flag_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL,
  flag_code text NOT NULL,
  previous_enabled boolean,
  next_enabled boolean NOT NULL,
  reason text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_feature_flag_changes_flag_idx
  ON public.product_feature_flag_changes(environment, flag_code, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_feature_flag_change_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'feature flag change history is immutable';
END;
$$;
CREATE TRIGGER product_feature_flag_changes_immutable
  BEFORE UPDATE OR DELETE ON public.product_feature_flag_changes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_feature_flag_change_mutation();

-- Launch configuration (plan section 3.6), identical in every environment
-- until an audited change says otherwise.
INSERT INTO public.product_feature_flags (environment, flag_code, enabled, reason)
SELECT environment, flag.code, flag.enabled, 'launch default (plan section 3.6)'
FROM unnest(ARRAY['production', 'preview', 'development']) AS environment
CROSS JOIN (VALUES
  ('social_profiles',            true),
  ('friends_discovery',          false),
  ('groups',                     false),
  ('group_creation',             false),
  ('community_text_posts',       true),
  ('community_photo_uploads',    true),
  ('community_video_uploads',    false),
  ('automated_post_moderation',  false),
  ('specialist_image_safeguard', true),
  ('report_auto_hide',           true),
  ('events',                     false)
) AS flag(code, enabled);

-- Admin-only, audited toggle. Uses IS DISTINCT FROM so a NULL role (pending
-- account) can never satisfy the gate. A narrower release/safety capability
-- should replace the plain admin check once moderation_role_grants exists.
CREATE OR REPLACE FUNCTION public.set_product_feature_flag(
  p_environment text,
  p_flag_code text,
  p_enabled boolean,
  p_reason text
)
RETURNS public.product_feature_flags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := public.get_my_profile_id();
  v_previous public.product_feature_flags%ROWTYPE;
  v_next public.product_feature_flags%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(trim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason between 10 and 500 characters is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_previous
  FROM public.product_feature_flags
  WHERE environment = p_environment AND flag_code = p_flag_code
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown feature flag' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.product_feature_flags
  SET enabled = p_enabled,
      reason = trim(p_reason),
      updated_by = v_actor_id,
      version = version + 1,
      updated_at = now()
  WHERE environment = p_environment AND flag_code = p_flag_code
  RETURNING * INTO v_next;

  INSERT INTO public.product_feature_flag_changes (
    environment, flag_code, previous_enabled, next_enabled, reason, actor_id, version
  ) VALUES (
    p_environment, p_flag_code, v_previous.enabled, p_enabled, trim(p_reason),
    v_actor_id, v_next.version
  );

  RETURN v_next;
END;
$$;

ALTER TABLE public.product_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_feature_flag_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_feature_flags FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.product_feature_flag_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.product_feature_flags TO service_role;
GRANT SELECT, INSERT ON public.product_feature_flag_changes TO service_role;

REVOKE ALL ON FUNCTION public.prevent_feature_flag_change_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_product_feature_flag(text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_feature_flag(text, text, boolean, text)
  TO authenticated, service_role;

COMMENT ON TABLE public.product_feature_flags IS
  'Server-authoritative launch capabilities per environment. Change only through set_product_feature_flag().';
COMMENT ON TABLE public.product_feature_flag_changes IS
  'Append-only audit of every feature flag change.';

COMMIT;
