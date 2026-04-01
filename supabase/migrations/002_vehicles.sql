-- ============================================================================
-- Migration 002: Vehicles
-- Domain B: Vehicles
-- ============================================================================

CREATE TYPE public.vehicle_visibility AS ENUM ('public', 'private');
CREATE TYPE public.media_type AS ENUM ('image', 'video');

-- Vehicles table
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vin text,
  year integer,
  make text,
  model text,
  trim text,
  mileage integer,
  visibility public.vehicle_visibility NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_owner ON public.vehicles(owner_id);
CREATE INDEX idx_vehicles_vin ON public.vehicles(vin) WHERE vin IS NOT NULL;

CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Vehicle media (general photos, not inspection-specific)
CREATE TABLE public.vehicle_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  url text NOT NULL,
  media_type public.media_type NOT NULL DEFAULT 'image',
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicle_media_vehicle ON public.vehicle_media(vehicle_id);
