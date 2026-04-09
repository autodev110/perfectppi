-- ============================================================================
-- Migration 021: Fix recursive technician_profiles update policy
-- Replaces self-referential policy from migration 018 that caused:
-- "infinite recursion detected in policy for relation technician_profiles"
-- ============================================================================

-- Replace the org-manager update policy with a non-recursive variant.
-- Uses SECURITY DEFINER helpers from migration 015 instead of selecting
-- from technician_profiles inside a technician_profiles policy expression.
DROP POLICY IF EXISTS tech_profiles_update_org_by_manager ON public.technician_profiles;

CREATE POLICY tech_profiles_update_org_by_manager ON public.technician_profiles
  FOR UPDATE
  USING (
    public.get_my_role() = 'org_manager'
    AND (
      organization_id = public.get_my_org_id()
      OR organization_id IS NULL
    )
  )
  WITH CHECK (
    public.get_my_role() = 'org_manager'
    AND (
      organization_id = public.get_my_org_id()
      OR organization_id IS NULL
    )
  );
