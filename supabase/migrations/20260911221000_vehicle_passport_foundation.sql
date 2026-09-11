-- Phase 2: Vehicle Passport specifications, friend visibility, and safe sold
-- vehicle handling (plan sections 23.2-23.4 and 29.6).

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER TABLE public.vehicles
  ADD COLUMN engine text,
  ADD COLUMN drivetrain text,
  ADD COLUMN transmission text,
  ADD COLUMN body_style text,
  ADD COLUMN sold_at timestamptz,
  ADD CONSTRAINT vehicles_engine_check CHECK (engine IS NULL OR char_length(btrim(engine)) BETWEEN 1 AND 100),
  ADD CONSTRAINT vehicles_drivetrain_check CHECK (drivetrain IS NULL OR char_length(btrim(drivetrain)) BETWEEN 1 AND 100),
  ADD CONSTRAINT vehicles_transmission_check CHECK (transmission IS NULL OR char_length(btrim(transmission)) BETWEEN 1 AND 100),
  ADD CONSTRAINT vehicles_body_style_check CHECK (body_style IS NULL OR char_length(btrim(body_style)) BETWEEN 1 AND 100),
  ADD CONSTRAINT vehicles_sold_state_check CHECK (sold_at IS NULL OR ownership_state = 'previously_owned');

CREATE TABLE public.vehicle_ownership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('marked_previously_owned')),
  kept_public_history boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vehicle_ownership_events_vehicle_created_idx
  ON public.vehicle_ownership_events(vehicle_id, created_at DESC);

ALTER TABLE public.vehicle_ownership_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_ownership_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_ownership_events TO service_role;

CREATE FUNCTION private.social_can_view_vehicle(
  p_viewer_id uuid,
  p_vehicle_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vehicles vehicle
    WHERE vehicle.id = p_vehicle_id
      AND vehicle.owner_id IS NOT NULL
      AND (
        vehicle.owner_id = p_viewer_id
        OR (
          public.social_can_view_profile(p_viewer_id, vehicle.owner_id)
          AND (
            vehicle.visibility = 'public'
            OR (
              vehicle.visibility = 'friends'
              AND public.social_profiles_are_friends(p_viewer_id, vehicle.owner_id)
            )
          )
        )
      )
  );
$$;

CREATE FUNCTION public.social_can_current_user_view_vehicle(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT private.social_can_view_vehicle(public.get_my_profile_id(), p_vehicle_id);
$$;

-- Server-only arbitrary-viewer projection. It deliberately remains separate
-- from vehicle RLS because a readable vehicle row would expose non-redactable
-- fields such as the full VIN to direct Data API clients.
CREATE FUNCTION public.social_can_view_vehicle(
  p_viewer_id uuid,
  p_vehicle_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT private.social_can_view_vehicle(p_viewer_id, p_vehicle_id);
$$;

-- Direct authenticated updates may leave a sold state, but entering it must
-- use the atomic flow below so listing closure and the owner's privacy choice
-- cannot diverge. Service jobs and admins remain able to repair data.
CREATE FUNCTION public.guard_vehicle_sold_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.ownership_state = 'previously_owned'
     AND OLD.ownership_state <> 'previously_owned'
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'use mark_vehicle_previously_owned()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.ownership_state <> 'previously_owned' THEN
    NEW.sold_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicles_guard_sold_transition
  BEFORE UPDATE OF ownership_state, sold_at
  ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_sold_transition();

CREATE FUNCTION public.normalize_vehicle_specs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.engine := NULLIF(btrim(NEW.engine), '');
  NEW.drivetrain := NULLIF(btrim(NEW.drivetrain), '');
  NEW.transmission := NULLIF(btrim(NEW.transmission), '');
  NEW.body_style := NULLIF(btrim(NEW.body_style), '');
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicles_normalize_specs_insert
  BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_vehicle_specs();
CREATE TRIGGER vehicles_normalize_specs_update
  BEFORE UPDATE OF engine, drivetrain, transmission, body_style ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_vehicle_specs();

CREATE FUNCTION private.mark_vehicle_previously_owned(
  p_vehicle_id uuid,
  p_keep_public_history boolean
)
RETURNS public.vehicles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vehicle public.vehicles%ROWTYPE;
  v_actor_profile_id uuid := public.get_my_profile_id();
BEGIN
  IF v_actor_profile_id IS NULL
     OR NOT public.social_profile_is_available(v_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_vehicle
  FROM public.vehicles vehicle
  WHERE vehicle.id = p_vehicle_id
    AND vehicle.owner_id = v_actor_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vehicle unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Network retries must not create duplicate history events or change the
  -- owner's original sold-vehicle privacy choice.
  IF v_vehicle.ownership_state = 'previously_owned'
     AND v_vehicle.sold_at IS NOT NULL THEN
    RETURN v_vehicle;
  END IF;

  IF v_vehicle.ownership_state NOT IN ('owned', 'project') THEN
    RAISE EXCEPTION 'only owned or project vehicles can be marked as sold'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.marketplace_listings listing
  SET status = 'sold'
  WHERE listing.vehicle_id = p_vehicle_id
    AND listing.seller_id = v_actor_profile_id
    AND listing.status = 'active';

  UPDATE public.vehicles vehicle
  SET ownership_state = 'previously_owned',
      sold_at = COALESCE(vehicle.sold_at, now()),
      visibility = CASE
        WHEN p_keep_public_history THEN 'public'::public.vehicle_visibility
        ELSE 'private'::public.vehicle_visibility
      END
  WHERE vehicle.id = p_vehicle_id
  RETURNING * INTO v_vehicle;

  INSERT INTO public.vehicle_ownership_events (
    vehicle_id, profile_id, event_type, kept_public_history
  ) VALUES (
    p_vehicle_id, v_actor_profile_id, 'marked_previously_owned', p_keep_public_history
  );

  RETURN v_vehicle;
END;
$$;

CREATE FUNCTION public.mark_vehicle_previously_owned(
  p_vehicle_id uuid,
  p_keep_public_history boolean
)
RETURNS public.vehicles
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT private.mark_vehicle_previously_owned(p_vehicle_id, p_keep_public_history);
$$;

REVOKE ALL ON FUNCTION private.social_can_view_vehicle(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_can_view_vehicle(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_can_current_user_view_vehicle(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.social_can_view_vehicle(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.social_can_view_vehicle(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.social_can_current_user_view_vehicle(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_vehicle_sold_transition()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_vehicle_specs()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.mark_vehicle_previously_owned(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.mark_vehicle_previously_owned(uuid, boolean)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_vehicle_previously_owned(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_vehicle_previously_owned(uuid, boolean)
  TO authenticated, service_role;

COMMENT ON COLUMN public.vehicles.sold_at IS
  'When the owner marked this Garage record previously owned; never implies a transfer to another account.';
COMMENT ON TABLE public.vehicle_ownership_events IS
  'Owner-private record of sold-vehicle privacy choices. Vehicle ownership is never inferred or transferred automatically.';

COMMIT;
