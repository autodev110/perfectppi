-- ============================================================================
-- Migration 019: RLS Policies for PPI Engine Tables
-- Covers: ppi_requests, ppi_submissions, ppi_sections, ppi_answers, ppi_media
-- Idempotent: safe to re-run (drops policies/function before recreating)
-- ============================================================================

-- Helper: check if current user can access a submission
-- (either as performer or as requester of the parent ppi_request)
DROP FUNCTION IF EXISTS public.can_access_submission(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.can_access_submission(submission_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ppi_submissions s
    JOIN public.ppi_requests r ON r.id = s.ppi_request_id
    WHERE s.id = submission_id
      AND (
        s.performer_id = public.get_my_profile_id()
        OR r.requester_id = public.get_my_profile_id()
      )
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- PPI REQUESTS
-- ============================================================================
ALTER TABLE public.ppi_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppi_requests_select_requester ON public.ppi_requests;
CREATE POLICY ppi_requests_select_requester ON public.ppi_requests
  FOR SELECT USING (requester_id = public.get_my_profile_id());

DROP POLICY IF EXISTS ppi_requests_select_tech ON public.ppi_requests;
CREATE POLICY ppi_requests_select_tech ON public.ppi_requests
  FOR SELECT USING (assigned_tech_id = public.get_my_profile_id());

DROP POLICY IF EXISTS ppi_requests_insert ON public.ppi_requests;
CREATE POLICY ppi_requests_insert ON public.ppi_requests
  FOR INSERT WITH CHECK (requester_id = public.get_my_profile_id());

DROP POLICY IF EXISTS ppi_requests_update_requester ON public.ppi_requests;
CREATE POLICY ppi_requests_update_requester ON public.ppi_requests
  FOR UPDATE USING (requester_id = public.get_my_profile_id())
  WITH CHECK (requester_id = public.get_my_profile_id());

DROP POLICY IF EXISTS ppi_requests_update_tech ON public.ppi_requests;
CREATE POLICY ppi_requests_update_tech ON public.ppi_requests
  FOR UPDATE USING (assigned_tech_id = public.get_my_profile_id())
  WITH CHECK (assigned_tech_id = public.get_my_profile_id());

DROP POLICY IF EXISTS ppi_requests_admin ON public.ppi_requests;
CREATE POLICY ppi_requests_admin ON public.ppi_requests
  FOR ALL USING (public.get_my_role() = 'admin');

-- ============================================================================
-- PPI SUBMISSIONS
-- ============================================================================
ALTER TABLE public.ppi_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppi_submissions_select_performer ON public.ppi_submissions;
CREATE POLICY ppi_submissions_select_performer ON public.ppi_submissions
  FOR SELECT USING (performer_id = public.get_my_profile_id());

DROP POLICY IF EXISTS ppi_submissions_select_requester ON public.ppi_submissions;
CREATE POLICY ppi_submissions_select_requester ON public.ppi_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ppi_requests r
      WHERE r.id = ppi_submissions.ppi_request_id
        AND r.requester_id = public.get_my_profile_id()
    )
  );

DROP POLICY IF EXISTS ppi_submissions_insert ON public.ppi_submissions;
CREATE POLICY ppi_submissions_insert ON public.ppi_submissions
  FOR INSERT WITH CHECK (performer_id = public.get_my_profile_id());

DROP POLICY IF EXISTS ppi_submissions_update ON public.ppi_submissions;
CREATE POLICY ppi_submissions_update ON public.ppi_submissions
  FOR UPDATE USING (performer_id = public.get_my_profile_id())
  WITH CHECK (performer_id = public.get_my_profile_id());

DROP POLICY IF EXISTS ppi_submissions_admin ON public.ppi_submissions;
CREATE POLICY ppi_submissions_admin ON public.ppi_submissions
  FOR ALL USING (public.get_my_role() = 'admin');

-- ============================================================================
-- PPI SECTIONS
-- ============================================================================
ALTER TABLE public.ppi_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppi_sections_select ON public.ppi_sections;
CREATE POLICY ppi_sections_select ON public.ppi_sections
  FOR SELECT USING (public.can_access_submission(ppi_submission_id));

DROP POLICY IF EXISTS ppi_sections_insert ON public.ppi_sections;
CREATE POLICY ppi_sections_insert ON public.ppi_sections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ppi_submissions s
      WHERE s.id = ppi_sections.ppi_submission_id
        AND s.performer_id = public.get_my_profile_id()
    )
  );

DROP POLICY IF EXISTS ppi_sections_update ON public.ppi_sections;
CREATE POLICY ppi_sections_update ON public.ppi_sections
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.ppi_submissions s
      WHERE s.id = ppi_sections.ppi_submission_id
        AND s.performer_id = public.get_my_profile_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ppi_submissions s
      WHERE s.id = ppi_sections.ppi_submission_id
        AND s.performer_id = public.get_my_profile_id()
    )
  );

DROP POLICY IF EXISTS ppi_sections_admin ON public.ppi_sections;
CREATE POLICY ppi_sections_admin ON public.ppi_sections
  FOR ALL USING (public.get_my_role() = 'admin');

-- ============================================================================
-- PPI ANSWERS
-- ============================================================================
ALTER TABLE public.ppi_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppi_answers_select ON public.ppi_answers;
CREATE POLICY ppi_answers_select ON public.ppi_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ppi_sections sec
      WHERE sec.id = ppi_answers.ppi_section_id
        AND public.can_access_submission(sec.ppi_submission_id)
    )
  );

DROP POLICY IF EXISTS ppi_answers_insert ON public.ppi_answers;
CREATE POLICY ppi_answers_insert ON public.ppi_answers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ppi_sections sec
      JOIN public.ppi_submissions s ON s.id = sec.ppi_submission_id
      WHERE sec.id = ppi_answers.ppi_section_id
        AND s.performer_id = public.get_my_profile_id()
    )
  );

DROP POLICY IF EXISTS ppi_answers_update ON public.ppi_answers;
CREATE POLICY ppi_answers_update ON public.ppi_answers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.ppi_sections sec
      JOIN public.ppi_submissions s ON s.id = sec.ppi_submission_id
      WHERE sec.id = ppi_answers.ppi_section_id
        AND s.performer_id = public.get_my_profile_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ppi_sections sec
      JOIN public.ppi_submissions s ON s.id = sec.ppi_submission_id
      WHERE sec.id = ppi_answers.ppi_section_id
        AND s.performer_id = public.get_my_profile_id()
    )
  );

DROP POLICY IF EXISTS ppi_answers_admin ON public.ppi_answers;
CREATE POLICY ppi_answers_admin ON public.ppi_answers
  FOR ALL USING (public.get_my_role() = 'admin');

-- ============================================================================
-- PPI MEDIA
-- ============================================================================
ALTER TABLE public.ppi_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppi_media_select ON public.ppi_media;
CREATE POLICY ppi_media_select ON public.ppi_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ppi_sections sec
      WHERE sec.id = ppi_media.ppi_section_id
        AND public.can_access_submission(sec.ppi_submission_id)
    )
  );

DROP POLICY IF EXISTS ppi_media_insert ON public.ppi_media;
CREATE POLICY ppi_media_insert ON public.ppi_media
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ppi_sections sec
      JOIN public.ppi_submissions s ON s.id = sec.ppi_submission_id
      WHERE sec.id = ppi_media.ppi_section_id
        AND s.performer_id = public.get_my_profile_id()
    )
  );

DROP POLICY IF EXISTS ppi_media_admin ON public.ppi_media;
CREATE POLICY ppi_media_admin ON public.ppi_media
  FOR ALL USING (public.get_my_role() = 'admin');
