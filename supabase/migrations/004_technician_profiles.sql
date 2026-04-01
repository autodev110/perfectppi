-- ============================================================================
-- Migration 004: Technician Profiles + Organization Memberships
-- Domain F: Technician & Organization (part 2)
-- ============================================================================

CREATE TYPE public.certification_level AS ENUM (
  'none',
  'ase',
  'master',
  'oem_qualified'
);

CREATE TYPE public.org_member_role AS ENUM ('technician', 'manager');

-- Technician profiles — extended profile for tech role
CREATE TABLE public.technician_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  certification_level public.certification_level NOT NULL DEFAULT 'none',
  specialties text[] DEFAULT '{}',
  is_independent boolean NOT NULL DEFAULT true,
  total_inspections integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Future Rate My Tech: ALTER TABLE ADD COLUMN avg_rating, reputation_score — no migration needed

CREATE INDEX idx_tech_profiles_profile ON public.technician_profiles(profile_id);
CREATE INDEX idx_tech_profiles_org ON public.technician_profiles(organization_id)
  WHERE organization_id IS NOT NULL;
CREATE INDEX idx_tech_profiles_certification ON public.technician_profiles(certification_level);

CREATE TRIGGER technician_profiles_updated_at
  BEFORE UPDATE ON public.technician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Organization memberships — tech ↔ org affiliation
CREATE TABLE public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_profile_id uuid NOT NULL REFERENCES public.technician_profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.org_member_role NOT NULL DEFAULT 'technician',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(technician_profile_id, organization_id)
);

CREATE INDEX idx_org_memberships_tech ON public.organization_memberships(technician_profile_id);
CREATE INDEX idx_org_memberships_org ON public.organization_memberships(organization_id);
