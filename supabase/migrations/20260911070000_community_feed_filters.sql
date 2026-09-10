BEGIN;

CREATE TYPE public.community_feed_filter AS ENUM ('all', 'friends', 'my_cars');

CREATE FUNCTION public.social_filtered_community_post_ids(
  p_viewer_id uuid,
  p_filter public.community_feed_filter DEFAULT 'all',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_include_group_posts boolean DEFAULT true
)
RETURNS TABLE(post_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT post.id
  FROM public.community_posts post
  WHERE public.social_can_view_community_post(p_viewer_id, post.id, false)
    AND (
      post.group_id IS NULL
      OR (
        p_include_group_posts
        AND EXISTS (
          SELECT 1
          FROM public.community_group_memberships membership
          WHERE membership.group_id = post.group_id
            AND membership.profile_id = p_viewer_id
            AND membership.status = 'active'
        )
      )
    )
    AND CASE p_filter
      WHEN 'all' THEN true
      WHEN 'friends' THEN public.social_profiles_are_friends(
        p_viewer_id, post.author_id
      )
      WHEN 'my_cars' THEN EXISTS (
        SELECT 1
        FROM public.vehicles garage_vehicle
        JOIN public.vehicles tagged_vehicle ON tagged_vehicle.id = post.vehicle_id
        WHERE garage_vehicle.owner_id = p_viewer_id
          AND (
            garage_vehicle.id = tagged_vehicle.id
            OR (
              nullif(lower(btrim(garage_vehicle.make)), '') =
                nullif(lower(btrim(tagged_vehicle.make)), '')
              AND (
                nullif(lower(btrim(garage_vehicle.model)), '') IS NULL
                OR nullif(lower(btrim(tagged_vehicle.model)), '') IS NULL
                OR nullif(lower(btrim(garage_vehicle.model)), '') =
                  nullif(lower(btrim(tagged_vehicle.model)), '')
              )
            )
          )
      )
    END
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.social_filtered_community_post_ids(
  uuid, public.community_feed_filter, integer, integer, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_filtered_community_post_ids(
  uuid, public.community_feed_filter, integer, integer, boolean
) TO service_role;

COMMENT ON FUNCTION public.social_filtered_community_post_ids(
  uuid, public.community_feed_filter, integer, integer, boolean
) IS 'Visibility-first, chronological IDs for Community feed modes; joined-group posts follow the server feature flag.';

COMMIT;
