BEGIN;

CREATE TYPE public.vehicle_ownership_state AS ENUM (
  'owned',
  'previously_owned',
  'considering',
  'project'
);

ALTER TABLE public.vehicles
  ADD COLUMN nickname text,
  ADD COLUMN ownership_state public.vehicle_ownership_state NOT NULL DEFAULT 'owned',
  ADD COLUMN mileage_updated_at timestamptz,
  ADD CONSTRAINT vehicles_nickname_check CHECK (
    nickname IS NULL OR char_length(btrim(nickname)) BETWEEN 1 AND 60
  );

UPDATE public.vehicles
SET mileage_updated_at = updated_at
WHERE mileage IS NOT NULL AND mileage_updated_at IS NULL;

CREATE INDEX vehicles_owner_ownership_state_idx
  ON public.vehicles(owner_id, ownership_state, created_at DESC)
  WHERE owner_id IS NOT NULL;

CREATE FUNCTION public.maintain_vehicle_mileage_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.nickname := NULLIF(btrim(NEW.nickname), '');
    NEW.mileage_updated_at := CASE WHEN NEW.mileage IS NULL THEN NULL ELSE now() END;
    RETURN NEW;
  END IF;

  NEW.nickname := NULLIF(btrim(NEW.nickname), '');
  IF NEW.mileage IS DISTINCT FROM OLD.mileage THEN
    NEW.mileage_updated_at := CASE WHEN NEW.mileage IS NULL THEN NULL ELSE now() END;
  ELSE
    NEW.mileage_updated_at := OLD.mileage_updated_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicles_maintain_mileage_updated_at
  BEFORE INSERT OR UPDATE OF mileage, mileage_updated_at, nickname
  ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.maintain_vehicle_mileage_updated_at();

COMMENT ON COLUMN public.vehicles.nickname IS
  'Optional owner-selected Garage label; public only when the vehicle itself is public.';
COMMENT ON COLUMN public.vehicles.ownership_state IS
  'Owner-selected Garage relationship; marketplace listing state is tracked separately.';
COMMENT ON COLUMN public.vehicles.mileage_updated_at IS
  'Database-maintained timestamp of the latest mileage change.';

COMMIT;
