-- Phase 2 Vehicle Passport: structured build and maintenance timelines.
-- These tables are intentionally service-routed. Public projections are made
-- by the application only after vehicle visibility has been checked, and omit
-- cost/private notes even when an entry is shared.
BEGIN;

CREATE TYPE public.vehicle_build_status AS ENUM (
  'planned',
  'installed',
  'removed',
  'sold'
);

CREATE TYPE public.vehicle_installation_kind AS ENUM (
  'unknown',
  'self_installed',
  'shop_installed'
);

CREATE TYPE public.vehicle_fitment_confidence AS ENUM (
  'owner_reported',
  'community_confirmed',
  'manufacturer_verified'
);

CREATE TABLE public.vehicle_build_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  manufacturer text,
  part_number text,
  vehicle_configuration text,
  wheel_size text,
  wheel_width numeric(5,2),
  wheel_offset_mm numeric(5,1),
  tire_size text,
  suspension_drop text,
  installed_on date,
  mileage integer,
  installation_kind public.vehicle_installation_kind NOT NULL DEFAULT 'unknown',
  shop_name text,
  cost_cents integer,
  public_notes text,
  private_notes text,
  status public.vehicle_build_status NOT NULL DEFAULT 'installed',
  fitment_confidence public.vehicle_fitment_confidence NOT NULL DEFAULT 'owner_reported',
  is_public boolean NOT NULL DEFAULT false,
  related_post_id uuid REFERENCES public.community_posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(btrim(category)) BETWEEN 1 AND 80),
  CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  CHECK (manufacturer IS NULL OR char_length(btrim(manufacturer)) BETWEEN 1 AND 120),
  CHECK (part_number IS NULL OR char_length(btrim(part_number)) BETWEEN 1 AND 100),
  CHECK (vehicle_configuration IS NULL OR char_length(btrim(vehicle_configuration)) BETWEEN 1 AND 500),
  CHECK (wheel_size IS NULL OR char_length(btrim(wheel_size)) BETWEEN 1 AND 40),
  CHECK (wheel_width IS NULL OR wheel_width > 0),
  CHECK (tire_size IS NULL OR char_length(btrim(tire_size)) BETWEEN 1 AND 40),
  CHECK (suspension_drop IS NULL OR char_length(btrim(suspension_drop)) BETWEEN 1 AND 80),
  CHECK (mileage IS NULL OR mileage >= 0),
  CHECK (shop_name IS NULL OR char_length(btrim(shop_name)) BETWEEN 1 AND 160),
  CHECK (cost_cents IS NULL OR cost_cents >= 0),
  CHECK (public_notes IS NULL OR char_length(public_notes) <= 5000),
  CHECK (private_notes IS NULL OR char_length(private_notes) <= 5000)
);

CREATE TABLE public.vehicle_maintenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  serviced_on date NOT NULL,
  mileage integer,
  parts_fluids text,
  provider text,
  cost_cents integer,
  public_notes text,
  private_notes text,
  next_due_on date,
  next_due_mileage integer,
  is_public boolean NOT NULL DEFAULT false,
  related_post_id uuid REFERENCES public.community_posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(btrim(service_type)) BETWEEN 1 AND 160),
  CHECK (mileage IS NULL OR mileage >= 0),
  CHECK (parts_fluids IS NULL OR char_length(parts_fluids) <= 3000),
  CHECK (provider IS NULL OR char_length(btrim(provider)) BETWEEN 1 AND 160),
  CHECK (cost_cents IS NULL OR cost_cents >= 0),
  CHECK (public_notes IS NULL OR char_length(public_notes) <= 5000),
  CHECK (private_notes IS NULL OR char_length(private_notes) <= 5000),
  CHECK (next_due_mileage IS NULL OR next_due_mileage >= 0)
);

CREATE INDEX vehicle_build_entries_vehicle_date_idx
  ON public.vehicle_build_entries(vehicle_id, installed_on DESC NULLS LAST, created_at DESC);
CREATE INDEX vehicle_build_entries_public_idx
  ON public.vehicle_build_entries(vehicle_id, installed_on DESC NULLS LAST)
  WHERE is_public;
CREATE INDEX vehicle_maintenance_events_vehicle_date_idx
  ON public.vehicle_maintenance_events(vehicle_id, serviced_on DESC, created_at DESC);
CREATE INDEX vehicle_maintenance_events_public_idx
  ON public.vehicle_maintenance_events(vehicle_id, serviced_on DESC)
  WHERE is_public;

ALTER TABLE public.vehicle_build_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_maintenance_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_build_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vehicle_maintenance_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_build_entries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_maintenance_events TO service_role;

CREATE FUNCTION public.guard_vehicle_timeline_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
    RAISE EXCEPTION 'timeline ownership is immutable' USING ERRCODE = 'check_violation';
  END IF;

  SELECT vehicle.owner_id INTO v_owner_id
  FROM public.vehicles vehicle
  WHERE vehicle.id = NEW.vehicle_id;

  IF v_owner_id IS NULL OR NEW.owner_id IS DISTINCT FROM v_owner_id THEN
    RAISE EXCEPTION 'timeline owner must own the vehicle'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicle_build_entries_guard_owner
  BEFORE INSERT OR UPDATE OF vehicle_id, owner_id
  ON public.vehicle_build_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_timeline_owner();
CREATE TRIGGER vehicle_maintenance_events_guard_owner
  BEFORE INSERT OR UPDATE OF vehicle_id, owner_id
  ON public.vehicle_maintenance_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_timeline_owner();

CREATE TRIGGER vehicle_build_entries_updated_at
  BEFORE UPDATE ON public.vehicle_build_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER vehicle_maintenance_events_updated_at
  BEFORE UPDATE ON public.vehicle_maintenance_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

REVOKE ALL ON FUNCTION public.guard_vehicle_timeline_owner()
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.vehicle_build_entries IS
  'Owner-managed structured build journal. Public projection must always omit cost_cents and private_notes.';
COMMENT ON TABLE public.vehicle_maintenance_events IS
  'Owner-managed service timeline. Receipts and private notes never become public through is_public.';
COMMENT ON COLUMN public.vehicle_build_entries.fitment_confidence IS
  'Defaults to owner_reported; only trusted server workflows may assign stronger provenance later.';

COMMIT;
