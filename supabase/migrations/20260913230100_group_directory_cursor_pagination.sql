-- Plan 33: stable keyset pagination for group posts, in-group search,
-- members, and FAQ resources. Legacy OFFSET functions remain available.

BEGIN;

CREATE INDEX IF NOT EXISTS community_posts_group_cursor_idx
  ON public.community_posts(group_id, created_at DESC, id DESC)
  WHERE status = 'active' AND moderation_status = 'active';

CREATE INDEX IF NOT EXISTS community_group_memberships_directory_cursor_idx
  ON public.community_group_memberships(
    group_id,
    (CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END),
    joined_at,
    profile_id
  )
  WHERE status = 'active';

CREATE FUNCTION public.social_visible_community_group_post_ids_cursor(
  p_viewer_id uuid,
  p_group_id uuid,
  p_limit integer DEFAULT 20,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_post_id uuid DEFAULT NULL,
  p_exclude_pinned boolean DEFAULT true
)
RETURNS TABLE(post_id uuid, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_viewer_id IS NULL OR p_group_id IS NULL
     OR num_nonnulls(p_before_created_at, p_before_post_id) NOT IN (0, 2) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT post.id, post.created_at
  FROM public.community_posts post
  WHERE post.group_id = p_group_id
    AND (NOT p_exclude_pinned OR post.group_pinned_at IS NULL)
    AND public.social_can_view_community_post(p_viewer_id, post.id, false)
    AND (
      p_before_created_at IS NULL
      OR (post.created_at, post.id) < (p_before_created_at, p_before_post_id)
    )
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
END;
$$;

CREATE FUNCTION public.search_group_posts_cursor(
  p_viewer_id uuid,
  p_group_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_post_id uuid DEFAULT NULL
)
RETURNS TABLE(post_id uuid, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_q text := btrim(COALESCE(p_query, ''));
BEGIN
  IF p_viewer_id IS NULL OR p_group_id IS NULL
     OR length(v_q) < 2 OR length(v_q) > 100
     OR num_nonnulls(p_before_created_at, p_before_post_id) NOT IN (0, 2) THEN
    RETURN;
  END IF;

  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  RETURN QUERY
  SELECT post.id, post.created_at
  FROM public.community_posts post
  WHERE post.group_id = p_group_id
    AND post.content ILIKE '%' || v_q || '%'
    AND public.social_can_view_community_post(p_viewer_id, post.id, false)
    AND (
      p_before_created_at IS NULL
      OR (post.created_at, post.id) < (p_before_created_at, p_before_post_id)
    )
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
END;
$$;

CREATE FUNCTION public.list_group_members_cursor(
  p_viewer_id uuid,
  p_group_id uuid,
  p_limit integer DEFAULT 50,
  p_before_role_rank integer DEFAULT NULL,
  p_before_joined_at timestamptz DEFAULT NULL,
  p_before_profile_id uuid DEFAULT NULL
)
RETURNS TABLE(
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  role public.community_group_role,
  joined_at timestamptz,
  posting_restricted_until timestamptz,
  role_rank integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_viewer_id IS NULL OR p_group_id IS NULL
     OR num_nonnulls(p_before_role_rank, p_before_joined_at, p_before_profile_id) NOT IN (0, 3)
     OR (p_before_role_rank IS NOT NULL AND p_before_role_rank NOT BETWEEN 0 AND 3) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT membership.*,
      CASE membership.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END AS member_role_rank
    FROM public.community_group_memberships membership
    WHERE membership.group_id = p_group_id AND membership.status = 'active'
  )
  SELECT profile.id, profile.username, profile.display_name, profile.avatar_url,
         ranked.role, ranked.joined_at,
         CASE WHEN public.community_group_role_of(p_viewer_id, p_group_id) IS NOT NULL
                   AND public.community_group_role_of(p_viewer_id, p_group_id) <> 'member'
              THEN ranked.posting_restricted_until ELSE NULL END,
         ranked.member_role_rank
  FROM ranked
  JOIN public.profiles profile ON profile.id = ranked.profile_id
  WHERE public.community_group_content_visible(p_viewer_id, p_group_id)
    AND (profile.id = p_viewer_id OR public.social_can_view_profile(p_viewer_id, profile.id))
    AND (
      p_before_role_rank IS NULL
      OR (ranked.member_role_rank, ranked.joined_at, profile.id) >
         (p_before_role_rank, p_before_joined_at, p_before_profile_id)
    )
  ORDER BY ranked.member_role_rank, ranked.joined_at, profile.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$$;

CREATE FUNCTION public.list_community_group_faq_cursor(
  p_viewer_id uuid,
  p_group_id uuid,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_before_updated_at timestamptz DEFAULT NULL,
  p_before_entry_id uuid DEFAULT NULL
)
RETURNS SETOF public.community_group_faq_entries
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_query text := btrim(COALESCE(p_query, ''));
BEGIN
  IF p_viewer_id IS NULL OR p_group_id IS NULL
     OR NOT public.community_group_content_visible(p_viewer_id, p_group_id)
     OR num_nonnulls(p_before_updated_at, p_before_entry_id) NOT IN (0, 2) THEN
    RETURN;
  END IF;
  IF char_length(v_query) > 100 THEN
    RAISE EXCEPTION 'faq query is too long' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT faq.*
  FROM public.community_group_faq_entries faq
  WHERE faq.group_id = p_group_id
    AND (v_query = '' OR strpos(lower(faq.question), lower(v_query)) > 0
      OR strpos(lower(faq.answer), lower(v_query)) > 0)
    AND (
      p_before_updated_at IS NULL
      OR (faq.updated_at, faq.id) < (p_before_updated_at, p_before_entry_id)
    )
  ORDER BY faq.updated_at DESC, faq.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.social_visible_community_group_post_ids_cursor(uuid, uuid, integer, timestamptz, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_group_posts_cursor(uuid, uuid, text, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_group_members_cursor(uuid, uuid, integer, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_community_group_faq_cursor(uuid, uuid, text, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.social_visible_community_group_post_ids_cursor(uuid, uuid, integer, timestamptz, uuid, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.search_group_posts_cursor(uuid, uuid, text, integer, timestamptz, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.list_group_members_cursor(uuid, uuid, integer, integer, timestamptz, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.list_community_group_faq_cursor(uuid, uuid, text, integer, timestamptz, uuid)
  TO service_role;

COMMIT;
