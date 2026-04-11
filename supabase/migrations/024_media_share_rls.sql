-- ============================================================================
-- Migration 024: RLS for media_packages and share_links
-- Domain E hardening: owner-only package/link management, admin full access
-- ============================================================================

-- ============================================================================
-- media_packages
-- ============================================================================
ALTER TABLE public.media_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_packages_select_own ON public.media_packages;
CREATE POLICY media_packages_select_own ON public.media_packages
  FOR SELECT USING (
    creator_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS media_packages_insert_own ON public.media_packages;
CREATE POLICY media_packages_insert_own ON public.media_packages
  FOR INSERT WITH CHECK (
    creator_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS media_packages_update_own ON public.media_packages;
CREATE POLICY media_packages_update_own ON public.media_packages
  FOR UPDATE USING (
    creator_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  )
  WITH CHECK (
    creator_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS media_packages_delete_own ON public.media_packages;
CREATE POLICY media_packages_delete_own ON public.media_packages
  FOR DELETE USING (
    creator_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

-- ============================================================================
-- share_links
-- ============================================================================
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.can_manage_share_target(public.share_target_type, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.can_manage_share_target(
  target_type_in public.share_target_type,
  media_package_id_in uuid,
  ppi_submission_id_in uuid,
  standardized_output_id_in uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() = 'admin' THEN
    RETURN true;
  END IF;

  IF target_type_in = 'media_package' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.media_packages mp
      WHERE mp.id = media_package_id_in
        AND mp.creator_id = public.get_my_profile_id()
    );
  END IF;

  IF target_type_in = 'inspection_result' THEN
    RETURN ppi_submission_id_in IS NOT NULL
      AND public.can_access_submission(ppi_submission_id_in);
  END IF;

  IF target_type_in = 'standardized_output' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.standardized_outputs so
      WHERE so.id = standardized_output_id_in
        AND public.can_access_submission(so.ppi_submission_id)
    );
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS share_links_select_own ON public.share_links;
CREATE POLICY share_links_select_own ON public.share_links
  FOR SELECT USING (
    public.can_manage_share_target(
      target_type,
      media_package_id,
      ppi_submission_id,
      standardized_output_id
    )
  );

DROP POLICY IF EXISTS share_links_insert_own ON public.share_links;
CREATE POLICY share_links_insert_own ON public.share_links
  FOR INSERT WITH CHECK (
    public.can_manage_share_target(
      target_type,
      media_package_id,
      ppi_submission_id,
      standardized_output_id
    )
  );

DROP POLICY IF EXISTS share_links_update_own ON public.share_links;
CREATE POLICY share_links_update_own ON public.share_links
  FOR UPDATE USING (
    public.can_manage_share_target(
      target_type,
      media_package_id,
      ppi_submission_id,
      standardized_output_id
    )
  )
  WITH CHECK (
    public.can_manage_share_target(
      target_type,
      media_package_id,
      ppi_submission_id,
      standardized_output_id
    )
  );

DROP POLICY IF EXISTS share_links_delete_own ON public.share_links;
CREATE POLICY share_links_delete_own ON public.share_links
  FOR DELETE USING (
    public.can_manage_share_target(
      target_type,
      media_package_id,
      ppi_submission_id,
      standardized_output_id
    )
  );
