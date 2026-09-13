-- Plan 29.8 / 33: stable keyset pagination for the mutable Community feed.
-- The older OFFSET function stays in place for installed app versions; new
-- clients opt in to this service-only cursor contract.

BEGIN;

CREATE INDEX community_posts_feed_cursor_idx
  ON public.community_posts(created_at DESC, id DESC)
  WHERE status = 'active' AND moderation_status = 'active';

-- Keep the canonical post visibility function as the authorization source.
-- This helper adds feed-only filters without exposing a second client API.
CREATE FUNCTION private.social_feed_post_is_eligible(
  p_viewer_id uuid,
  p_post_id uuid,
  p_filter public.community_feed_filter DEFAULT 'all',
  p_include_group_posts boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_posts post
    WHERE post.id = p_post_id
      AND public.social_can_view_community_post(p_viewer_id, post.id, false)
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
        WHEN 'friends' THEN public.social_profiles_are_friends(p_viewer_id, post.author_id)
        WHEN 'my_cars' THEN EXISTS (
          SELECT 1
          FROM public.vehicles garage_vehicle
          JOIN public.vehicles tagged_vehicle ON tagged_vehicle.id = post.vehicle_id
          WHERE garage_vehicle.owner_id = p_viewer_id
            AND (
              garage_vehicle.id = tagged_vehicle.id
              OR (
                public.community_feed_normalize_topic(garage_vehicle.make) =
                  public.community_feed_normalize_topic(tagged_vehicle.make)
                AND (
                  public.community_feed_normalize_topic(garage_vehicle.model) IS NULL
                  OR public.community_feed_normalize_topic(tagged_vehicle.model) IS NULL
                  OR public.community_feed_normalize_topic(garage_vehicle.model) =
                    public.community_feed_normalize_topic(tagged_vehicle.model)
                )
              )
            )
        )
      END
      AND NOT EXISTS (
        SELECT 1
        FROM public.community_feed_mutes mute
        WHERE mute.profile_id = p_viewer_id
          AND (
            (mute.scope = 'group' AND mute.group_id = post.group_id)
            OR (mute.scope = 'post_type' AND mute.post_type = post.post_type)
            OR (
              mute.scope = 'vehicle_topic'
              AND EXISTS (
                SELECT 1
                FROM public.vehicles topic_vehicle
                WHERE topic_vehicle.id = post.vehicle_id
                  AND public.community_feed_normalize_topic(topic_vehicle.make) = mute.vehicle_make
                  AND (
                    mute.vehicle_model IS NULL
                    OR public.community_feed_normalize_topic(topic_vehicle.model) = mute.vehicle_model
                  )
              )
            )
          )
      )
  );
$$;

CREATE FUNCTION public.social_cursor_community_post_ids(
  p_viewer_id uuid,
  p_filter public.community_feed_filter DEFAULT 'all',
  p_limit integer DEFAULT 20,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_post_id uuid DEFAULT NULL,
  p_include_group_posts boolean DEFAULT true
)
RETURNS TABLE(post_id uuid, collapsed_repost_count integer, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    post.id,
    GREATEST((
      SELECT count(*) - 1
      FROM public.community_posts repeated
      WHERE repeated.author_id = post.author_id
        AND repeated.feed_fingerprint = post.feed_fingerprint
        AND repeated.created_at >= (
          date_trunc('day', post.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        )
        AND repeated.created_at < (
          date_trunc('day', post.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        ) + interval '1 day'
        AND private.social_feed_post_is_eligible(
          p_viewer_id, repeated.id, p_filter, p_include_group_posts
        )
    ), 0)::integer AS collapsed_repost_count,
    post.created_at
  FROM public.community_posts post
  WHERE post.status = 'active'
    AND post.moderation_status = 'active'
    AND (
      (p_before_created_at IS NULL AND p_before_post_id IS NULL)
      OR (
        p_before_created_at IS NOT NULL
        AND p_before_post_id IS NOT NULL
        AND (post.created_at, post.id) < (p_before_created_at, p_before_post_id)
      )
    )
    AND private.social_feed_post_is_eligible(
      p_viewer_id, post.id, p_filter, p_include_group_posts
    )
    -- A newer eligible copy is the cluster representative. Looking it up via
    -- the repost-cluster index avoids ranking the viewer's entire feed.
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_posts newer
      WHERE newer.author_id = post.author_id
        AND newer.feed_fingerprint = post.feed_fingerprint
        AND newer.created_at >= (
          date_trunc('day', post.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        )
        AND newer.created_at < (
          date_trunc('day', post.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        ) + interval '1 day'
        AND (newer.created_at, newer.id) > (post.created_at, post.id)
        AND private.social_feed_post_is_eligible(
          p_viewer_id, newer.id, p_filter, p_include_group_posts
        )
    )
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 101);
$$;

REVOKE ALL ON FUNCTION private.social_feed_post_is_eligible(
  uuid, uuid, public.community_feed_filter, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_cursor_community_post_ids(
  uuid, public.community_feed_filter, integer, timestamptz, uuid, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.social_cursor_community_post_ids(
  uuid, public.community_feed_filter, integer, timestamptz, uuid, boolean
) TO service_role;

COMMENT ON FUNCTION public.social_cursor_community_post_ids(
  uuid, public.community_feed_filter, integer, timestamptz, uuid, boolean
) IS 'Service-only visibility-safe Community feed using a stable created_at/id keyset cursor.';

COMMIT;
