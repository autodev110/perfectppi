-- Plan 33: stable keyset pagination for private saved posts and listings.
-- Existing OFFSET functions remain for installed clients during rollout.

BEGIN;

CREATE INDEX IF NOT EXISTS community_post_saves_profile_cursor_idx
  ON public.community_post_saves(profile_id, created_at DESC, post_id DESC);

CREATE INDEX IF NOT EXISTS marketplace_listing_saves_profile_cursor_idx
  ON public.marketplace_listing_saves(profile_id, created_at DESC, listing_id DESC);

CREATE FUNCTION public.list_saved_community_post_ids_cursor(
  p_viewer_id uuid,
  p_limit integer DEFAULT 20,
  p_before_saved_at timestamptz DEFAULT NULL,
  p_before_post_id uuid DEFAULT NULL
)
RETURNS TABLE(post_id uuid, saved_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_viewer_id IS NULL
     OR num_nonnulls(p_before_saved_at, p_before_post_id) NOT IN (0, 2) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT save.post_id, save.created_at
  FROM public.community_post_saves save
  WHERE save.profile_id = p_viewer_id
    AND public.social_can_view_community_post(p_viewer_id, save.post_id, true)
    AND (
      p_before_saved_at IS NULL
      OR (save.created_at, save.post_id) < (p_before_saved_at, p_before_post_id)
    )
  ORDER BY save.created_at DESC, save.post_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
END;
$$;

CREATE FUNCTION public.list_saved_marketplace_listing_ids_cursor(
  p_viewer_id uuid,
  p_limit integer DEFAULT 20,
  p_before_saved_at timestamptz DEFAULT NULL,
  p_before_listing_id uuid DEFAULT NULL
)
RETURNS TABLE(listing_id uuid, saved_at timestamptz, listing_status public.listing_status)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_viewer_id IS NULL
     OR num_nonnulls(p_before_saved_at, p_before_listing_id) NOT IN (0, 2) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT save.listing_id, save.created_at, listing.status
  FROM public.marketplace_listing_saves save
  JOIN public.marketplace_listings listing ON listing.id = save.listing_id
  WHERE save.profile_id = p_viewer_id
    AND NOT public.social_profiles_are_blocked(p_viewer_id, listing.seller_id)
    AND public.social_profile_is_available(listing.seller_id)
    AND (
      p_before_saved_at IS NULL
      OR (save.created_at, save.listing_id) < (p_before_saved_at, p_before_listing_id)
    )
  ORDER BY save.created_at DESC, save.listing_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.list_saved_community_post_ids_cursor(uuid, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_saved_marketplace_listing_ids_cursor(uuid, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_saved_community_post_ids_cursor(uuid, integer, timestamptz, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.list_saved_marketplace_listing_ids_cursor(uuid, integer, timestamptz, uuid)
  TO service_role;

COMMENT ON FUNCTION public.list_saved_community_post_ids_cursor(uuid, integer, timestamptz, uuid) IS
  'Service-only stable pagination over a member private saved Community posts.';
COMMENT ON FUNCTION public.list_saved_marketplace_listing_ids_cursor(uuid, integer, timestamptz, uuid) IS
  'Service-only stable pagination over a member private saved Marketplace listings.';

COMMIT;
