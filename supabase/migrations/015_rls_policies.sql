-- ============================================================================
-- Migration 015: Row Level Security Policies
-- SECURITY DEFINER helpers defined first to avoid recursive RLS
-- ============================================================================

-- Helper: get current user's role from profiles
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: get current user's profile id
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS uuid AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: get current user's organization_id (from technician_profiles)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid AS $$
  SELECT tp.organization_id
  FROM public.technician_profiles tp
  JOIN public.profiles p ON p.id = tp.profile_id
  WHERE p.auth_user_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- PROFILES
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (auth_user_id = auth.uid());

-- Public profiles readable by anyone
CREATE POLICY profiles_select_public ON public.profiles
  FOR SELECT USING (is_public = true);

-- Users can update their own profile
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Admin can read all profiles
CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT USING (public.get_my_role() = 'admin');

-- Admin can update any profile
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE USING (public.get_my_role() = 'admin');

-- ============================================================================
-- VEHICLES
-- ============================================================================
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Owners can CRUD their own vehicles
CREATE POLICY vehicles_select_own ON public.vehicles
  FOR SELECT USING (owner_id = public.get_my_profile_id());

CREATE POLICY vehicles_insert_own ON public.vehicles
  FOR INSERT WITH CHECK (owner_id = public.get_my_profile_id());

CREATE POLICY vehicles_update_own ON public.vehicles
  FOR UPDATE USING (owner_id = public.get_my_profile_id())
  WITH CHECK (owner_id = public.get_my_profile_id());

CREATE POLICY vehicles_delete_own ON public.vehicles
  FOR DELETE USING (owner_id = public.get_my_profile_id());

-- Public vehicles readable by anyone
CREATE POLICY vehicles_select_public ON public.vehicles
  FOR SELECT USING (visibility = 'public');

-- Admin full access
CREATE POLICY vehicles_admin ON public.vehicles
  FOR ALL USING (public.get_my_role() = 'admin');

-- ============================================================================
-- VEHICLE MEDIA
-- ============================================================================
ALTER TABLE public.vehicle_media ENABLE ROW LEVEL SECURITY;

-- Owner of the vehicle can manage media
CREATE POLICY vehicle_media_select ON public.vehicle_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_media.vehicle_id
      AND (v.owner_id = public.get_my_profile_id() OR v.visibility = 'public')
    )
  );

CREATE POLICY vehicle_media_insert ON public.vehicle_media
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_media.vehicle_id
      AND v.owner_id = public.get_my_profile_id()
    )
  );

CREATE POLICY vehicle_media_delete ON public.vehicle_media
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_media.vehicle_id
      AND v.owner_id = public.get_my_profile_id()
    )
  );

CREATE POLICY vehicle_media_admin ON public.vehicle_media
  FOR ALL USING (public.get_my_role() = 'admin');

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organizations are publicly readable
CREATE POLICY organizations_select_all ON public.organizations
  FOR SELECT USING (true);

-- Org managers can update their own org
CREATE POLICY organizations_update_manager ON public.organizations
  FOR UPDATE USING (id = public.get_my_org_id() AND public.get_my_role() = 'org_manager');

-- Admin full access
CREATE POLICY organizations_admin ON public.organizations
  FOR ALL USING (public.get_my_role() = 'admin');

-- ============================================================================
-- TECHNICIAN PROFILES
-- ============================================================================
ALTER TABLE public.technician_profiles ENABLE ROW LEVEL SECURITY;

-- Public tech profiles readable by anyone (linked to public profiles)
CREATE POLICY tech_profiles_select_public ON public.technician_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = technician_profiles.profile_id AND p.is_public = true
    )
  );

-- Tech can read/update own profile
CREATE POLICY tech_profiles_select_own ON public.technician_profiles
  FOR SELECT USING (profile_id = public.get_my_profile_id());

CREATE POLICY tech_profiles_update_own ON public.technician_profiles
  FOR UPDATE USING (profile_id = public.get_my_profile_id())
  WITH CHECK (profile_id = public.get_my_profile_id());

-- Org managers can read techs in their org
CREATE POLICY tech_profiles_select_org ON public.technician_profiles
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() = 'org_manager'
  );

-- Admin full access
CREATE POLICY tech_profiles_admin ON public.technician_profiles
  FOR ALL USING (public.get_my_role() = 'admin');

-- ============================================================================
-- ORGANIZATION MEMBERSHIPS
-- ============================================================================
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

-- Members can see their own memberships
CREATE POLICY org_memberships_select_own ON public.organization_memberships
  FOR SELECT USING (
    technician_profile_id IN (
      SELECT id FROM public.technician_profiles
      WHERE profile_id = public.get_my_profile_id()
    )
  );

-- Org managers can see memberships in their org
CREATE POLICY org_memberships_select_org ON public.organization_memberships
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
    AND public.get_my_role() = 'org_manager'
  );

-- Admin full access
CREATE POLICY org_memberships_admin ON public.organization_memberships
  FOR ALL USING (public.get_my_role() = 'admin');
