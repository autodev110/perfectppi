-- ============================================================================
-- Migration 018: Org invite policies
-- Inlines profile/role/org lookups to avoid dependency on 015 helper functions
-- ============================================================================

-- Org managers can insert technician-role memberships for their own org
CREATE POLICY org_memberships_insert_tech_by_manager ON public.organization_memberships
  FOR INSERT WITH CHECK (
    role = 'technician'
    AND organization_id IN (
      SELECT tp.organization_id
      FROM public.technician_profiles tp
      JOIN public.profiles p ON p.id = tp.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid() AND role = 'org_manager'
    )
  );

-- Org managers can remove technicians from their org (cannot remove other managers)
CREATE POLICY org_memberships_delete_by_manager ON public.organization_memberships
  FOR DELETE USING (
    role = 'technician'
    AND organization_id IN (
      SELECT tp.organization_id
      FROM public.technician_profiles tp
      JOIN public.profiles p ON p.id = tp.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid() AND role = 'org_manager'
    )
  );

-- Org managers can update a technician_profile's organization_id to link them to the org
CREATE POLICY tech_profiles_update_org_by_manager ON public.technician_profiles
  FOR UPDATE USING (
    (organization_id IS NULL OR organization_id IN (
      SELECT tp2.organization_id
      FROM public.technician_profiles tp2
      JOIN public.profiles p ON p.id = tp2.profile_id
      WHERE p.auth_user_id = auth.uid()
    ))
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid() AND role = 'org_manager'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT tp2.organization_id
      FROM public.technician_profiles tp2
      JOIN public.profiles p ON p.id = tp2.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- Technicians can delete their own membership row (leave org)
CREATE POLICY org_memberships_delete_own ON public.organization_memberships
  FOR DELETE USING (
    role = 'technician'
    AND technician_profile_id IN (
      SELECT tp.id
      FROM public.technician_profiles tp
      JOIN public.profiles p ON p.id = tp.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
  );
