-- ============================================================================
-- Migration 016: Phase A role setup insert policies
-- Allows authenticated users to provision their own technician/org structure
-- ============================================================================

-- Organizations can be created during self-serve org-manager onboarding
CREATE POLICY organizations_insert_authenticated ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Users can create their own technician profile row
CREATE POLICY tech_profiles_insert_own ON public.technician_profiles
  FOR INSERT WITH CHECK (profile_id = public.get_my_profile_id());

-- Users can create a manager membership for their own technician profile
-- once that technician profile has been attached to the organization.
CREATE POLICY org_memberships_insert_manager_self ON public.organization_memberships
  FOR INSERT WITH CHECK (
    role = 'manager'
    AND technician_profile_id IN (
      SELECT id FROM public.technician_profiles
      WHERE profile_id = public.get_my_profile_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.technician_profiles tp
      WHERE tp.id = organization_memberships.technician_profile_id
      AND tp.organization_id = organization_memberships.organization_id
    )
  );
