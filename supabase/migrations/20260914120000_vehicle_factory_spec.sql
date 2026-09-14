BEGIN;

-- ============================================================================
-- Factory Spec vs Current Build (Renditions doc).
--
-- `factory_spec` is the VIN-decoded OEM record (make, model, trim/series,
-- body class, drive type, engine, transmission, plant). It is written only by
-- the server after a decode and is never edited by owners: the owner-facing
-- engine/transmission/drivetrain/body_style/trim columns are the *current*
-- build layer. When the VIN changes, the stale factory record is dropped so
-- a re-decode has to establish the new identity.
-- ============================================================================

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS factory_spec jsonb,
  ADD COLUMN IF NOT EXISTS factory_spec_decoded_at timestamptz;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_factory_spec_shape CHECK (
    factory_spec IS NULL
    OR (
      jsonb_typeof(factory_spec) = 'object'
      AND factory_spec ? 'vin'
      AND factory_spec->>'source' = 'nhtsa_vpic'
    )
  );

COMMENT ON COLUMN public.vehicles.factory_spec IS
  'VIN-decoded factory (OEM) specification from NHTSA vPIC. Server-written after a decode; never overwritten by owner edits. Owner-facing spec columns describe the current build.';

CREATE OR REPLACE FUNCTION public.guard_vehicle_factory_spec()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Only the server writes the factory layer.
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND (NEW.factory_spec IS NOT NULL OR NEW.factory_spec_decoded_at IS NOT NULL) THEN
      RAISE EXCEPTION 'factory_spec_server_managed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW.factory_spec IS DISTINCT FROM OLD.factory_spec
      OR NEW.factory_spec_decoded_at IS DISTINCT FROM OLD.factory_spec_decoded_at
    ) THEN
      RAISE EXCEPTION 'factory_spec_server_managed' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- A factory record only ever describes the VIN it was decoded from.
  IF NEW.factory_spec IS NOT NULL AND (
    NEW.vin IS NULL OR upper(btrim(NEW.vin)) <> upper(NEW.factory_spec->>'vin')
  ) THEN
    NEW.factory_spec := NULL;
    NEW.factory_spec_decoded_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicles_guard_factory_spec ON public.vehicles;
CREATE TRIGGER vehicles_guard_factory_spec
  BEFORE INSERT OR UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_factory_spec();

REVOKE ALL ON FUNCTION public.guard_vehicle_factory_spec() FROM PUBLIC, anon, authenticated;

COMMIT;
