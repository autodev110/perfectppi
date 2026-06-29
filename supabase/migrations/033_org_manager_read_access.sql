-- ============================================================================
-- Migration 033: Allow org_managers to read PPI data for technicians in their org
-- Without these policies, org managers see "couldn't find records" when viewing
-- inspections their teammates submitted, because RLS only grants access to
-- performer/requester/admin.
-- Idempotent: drops policies before recreating.
-- ============================================================================

-- Helper: profile_ids of every technician in the caller's organization
-- (returns an empty set if caller is not an org_manager or not in any org).
DROP FUNCTION IF EXISTS public.my_org_tech_profile_ids() CASCADE;
CREATE OR REPLACE FUNCTION public.my_org_tech_profile_ids()
RETURNS TABLE (profile_id uuid) AS $$
  SELECT t.profile_id
  FROM public.technician_profiles t
  WHERE t.organization_id = (
    SELECT organization_id
    FROM public.technician_profiles
    WHERE profile_id = public.get_my_profile_id()
    LIMIT 1
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- PPI REQUESTS — org_manager sees any request assigned to or requested by an
-- org teammate
-- ============================================================================
DROP POLICY IF EXISTS ppi_requests_select_org_manager ON public.ppi_requests;
CREATE POLICY ppi_requests_select_org_manager ON public.ppi_requests
  FOR SELECT USING (
    public.get_my_role() = 'org_manager'
    AND (
      assigned_tech_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
      OR requester_id   IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
    )
  );

-- ============================================================================
-- PPI SUBMISSIONS — org_manager sees submissions performed by org teammates
-- ============================================================================
DROP POLICY IF EXISTS ppi_submissions_select_org_manager ON public.ppi_submissions;
CREATE POLICY ppi_submissions_select_org_manager ON public.ppi_submissions
  FOR SELECT USING (
    public.get_my_role() = 'org_manager'
    AND performer_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
  );

-- ============================================================================
-- PPI SECTIONS / ANSWERS / MEDIA — gated by the submission policy above
-- ============================================================================
DROP POLICY IF EXISTS ppi_sections_select_org_manager ON public.ppi_sections;
CREATE POLICY ppi_sections_select_org_manager ON public.ppi_sections
  FOR SELECT USING (
    public.get_my_role() = 'org_manager'
    AND EXISTS (
      SELECT 1 FROM public.ppi_submissions s
      WHERE s.id = ppi_sections.ppi_submission_id
        AND s.performer_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
    )
  );

DROP POLICY IF EXISTS ppi_answers_select_org_manager ON public.ppi_answers;
CREATE POLICY ppi_answers_select_org_manager ON public.ppi_answers
  FOR SELECT USING (
    public.get_my_role() = 'org_manager'
    AND EXISTS (
      SELECT 1 FROM public.ppi_sections sec
      JOIN public.ppi_submissions s ON s.id = sec.ppi_submission_id
      WHERE sec.id = ppi_answers.ppi_section_id
        AND s.performer_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
    )
  );

DROP POLICY IF EXISTS ppi_media_select_org_manager ON public.ppi_media;
CREATE POLICY ppi_media_select_org_manager ON public.ppi_media
  FOR SELECT USING (
    public.get_my_role() = 'org_manager'
    AND EXISTS (
      SELECT 1 FROM public.ppi_sections sec
      JOIN public.ppi_submissions s ON s.id = sec.ppi_submission_id
      WHERE sec.id = ppi_media.ppi_section_id
        AND s.performer_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
    )
  );

-- ============================================================================
-- STANDARDIZED + VSC OUTPUTS — gated by the underlying submission
-- ============================================================================
DROP POLICY IF EXISTS standardized_outputs_select_org_manager ON public.standardized_outputs;
CREATE POLICY standardized_outputs_select_org_manager ON public.standardized_outputs
  FOR SELECT USING (
    public.get_my_role() = 'org_manager'
    AND EXISTS (
      SELECT 1 FROM public.ppi_submissions s
      WHERE s.id = standardized_outputs.ppi_submission_id
        AND s.performer_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
    )
  );

DROP POLICY IF EXISTS vsc_outputs_select_org_manager ON public.vsc_outputs;
CREATE POLICY vsc_outputs_select_org_manager ON public.vsc_outputs
  FOR SELECT USING (
    public.get_my_role() = 'org_manager'
    AND EXISTS (
      SELECT 1 FROM public.ppi_submissions s
      WHERE s.id = vsc_outputs.ppi_submission_id
        AND s.performer_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
    )
  );
