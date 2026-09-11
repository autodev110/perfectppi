-- Plan 15.4: permission-aware sharing. Share links are the canonical pages
-- (/community/posts/<id>, /profile/<username>, /community/groups/<slug>,
-- /vehicle/<id>); nothing is a bearer token, so a link to content that later
-- becomes hidden or private simply stops resolving.
--
-- Link previews are fetched by crawlers with no session, so the preview
-- functions answer for the *anonymous* audience only: content the author
-- already made public to everyone. They never return private-group text,
-- friends-only posts, VINs, plates, locations, report reasons, or anything
-- from a suspended or private account. Everything is service-only and
-- re-checked on every call.

BEGIN;

CREATE FUNCTION public.community_post_share_preview(p_post_id uuid)
RETURNS TABLE(
  post_id uuid,
  author_label text,
  author_username text,
  post_type public.community_post_type,
  excerpt text,
  media_count integer,
  vehicle_label text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    post.id,
    COALESCE(NULLIF(btrim(author.display_name), ''), author.username, 'PerfectPPI member'),
    author.username,
    post.post_type,
    left(regexp_replace(btrim(post.content), '\s+', ' ', 'g'), 160),
    (SELECT count(*)::integer FROM public.community_post_media media
     WHERE media.post_id = post.id AND media.moderation_status = 'active'),
    CASE WHEN vehicle.id IS NOT NULL
      THEN NULLIF(btrim(concat_ws(' ', vehicle.year::text, vehicle.make, vehicle.model)), '')
      ELSE NULL END,
    post.created_at
  FROM public.community_posts post
  JOIN public.profiles author ON author.id = post.author_id
  LEFT JOIN public.vehicles vehicle ON vehicle.id = post.vehicle_id
  WHERE post.id = p_post_id
    AND post.status = 'active'
    AND post.moderation_status = 'active'
    AND post.group_id IS NULL
    AND post.audience = 'public'
    AND author.is_public
    AND public.social_profile_is_available(author.id)
    AND (post.vehicle_id IS NULL OR (vehicle.visibility = 'public' AND vehicle.owner_id = author.id));
$$;

-- Public and private groups may be discovered; unlisted groups never preview.
CREATE FUNCTION public.community_group_share_preview(p_slug text)
RETURNS TABLE(
  group_id uuid,
  slug text,
  name text,
  description text,
  visibility public.community_group_visibility,
  member_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT community_group.id, community_group.slug, community_group.name, community_group.description, community_group.visibility,
         (SELECT count(*)::integer FROM public.community_group_memberships membership
          WHERE membership.group_id = community_group.id AND membership.status = 'active')
  FROM public.community_groups community_group
  WHERE community_group.slug = lower(btrim(p_slug))
    AND community_group.status = 'active'
    AND community_group.visibility IN ('public', 'private');
$$;

-- A public, lookup-enabled, available profile: name, handle, bio, avatar.
CREATE FUNCTION public.profile_share_preview(p_username text)
RETURNS TABLE(
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  is_technician boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.id, profile.username, profile.display_name, profile.avatar_url, profile.bio,
         EXISTS (SELECT 1 FROM public.technician_profiles technician WHERE technician.profile_id = profile.id)
  FROM public.profiles profile
  WHERE profile.username_normalized = lower(btrim(p_username))
    AND profile.username_state = 'claimed'
    AND profile.is_public
    AND profile.allow_exact_username_lookup
    AND public.social_profile_is_available(profile.id);
$$;

REVOKE ALL ON FUNCTION public.community_post_share_preview(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_group_share_preview(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profile_share_preview(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_post_share_preview(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_group_share_preview(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.profile_share_preview(text) TO service_role;

COMMIT;
