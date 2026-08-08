-- ============================================================================
-- Migration 036: Let inspectors remove their own inspection photos
--
-- ppi_media shipped with SELECT/INSERT policies but no DELETE, so a technician
-- who captured a bad shot had no way to take it back — the delete silently
-- affected zero rows for everyone except admins.
--
-- Scoped to the performer of the submission, and only while the submission is
-- still being worked on: once it is submitted or completed the photos are part
-- of a report someone relies on and must stay put.
-- ============================================================================

DROP POLICY IF EXISTS ppi_media_delete ON public.ppi_media;
CREATE POLICY ppi_media_delete ON public.ppi_media
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.ppi_sections sec
      JOIN public.ppi_submissions s ON s.id = sec.ppi_submission_id
      WHERE sec.id = ppi_media.ppi_section_id
        AND s.performer_id = public.get_my_profile_id()
        AND s.status IN ('draft', 'in_progress')
    )
  );
