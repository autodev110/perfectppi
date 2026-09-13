BEGIN;

-- Stable keyset pagination for the ranked unified-search tabs. The original
-- offset functions remain available to the server while installed clients
-- transition to the cursor contract.
CREATE FUNCTION public.search_community_posts_cursor(
  p_viewer_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_before_rank integer DEFAULT NULL,
  p_before_sort_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE(post_id uuid, rank integer, sort_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
  IF num_nonnulls(p_before_rank, p_before_sort_at, p_before_id) NOT IN (0, 3) THEN RETURN; END IF;
  SELECT * INTO q FROM public.community_search_terms(p_query);
  IF cardinality(q.terms) = 0 AND cardinality(q.years) = 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT post.id, post.created_at,
      (SELECT count(*)::integer FROM unnest(q.terms) term
       WHERE post.content ILIKE '%' || term || '%'
          OR post.details::text ILIKE '%' || term || '%'
          OR vehicle.make ILIKE term || '%'
          OR vehicle.model ILIKE term || '%'
          OR vehicle.trim ILIKE '%' || term || '%'
          OR community_group.name ILIKE '%' || term || '%') AS matched,
      (SELECT count(*)::integer FROM unnest(q.years) y WHERE vehicle.year = y) AS year_matches
    FROM public.community_posts post
    LEFT JOIN public.vehicles vehicle ON vehicle.id = post.vehicle_id
    LEFT JOIN public.community_groups community_group ON community_group.id = post.group_id
    WHERE post.status = 'active' AND post.moderation_status = 'active'
  ), visible AS (
    SELECT scored.id, scored.created_at, scored.matched + scored.year_matches AS result_rank
    FROM scored
    WHERE scored.matched + scored.year_matches > 0
      AND (cardinality(q.terms) = 0 OR scored.matched > 0)
      AND public.social_can_view_community_post(p_viewer_id, scored.id, false)
  )
  SELECT visible.id, visible.result_rank, visible.created_at
  FROM visible
  WHERE p_before_rank IS NULL
     OR (visible.result_rank, visible.created_at, visible.id) < (p_before_rank, p_before_sort_at, p_before_id)
  ORDER BY visible.result_rank DESC, visible.created_at DESC, visible.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
END;
$$;

CREATE FUNCTION public.search_community_groups_cursor(
  p_viewer_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_before_rank integer DEFAULT NULL,
  p_before_sort_text text DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE(group_id uuid, rank integer, sort_text text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
  IF num_nonnulls(p_before_rank, p_before_sort_text, p_before_id) NOT IN (0, 3) THEN RETURN; END IF;
  SELECT * INTO q FROM public.community_search_terms(p_query);
  IF cardinality(q.terms) = 0 AND cardinality(q.years) = 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT g.id, lower(g.name) AS name_key,
      (SELECT count(*)::integer FROM unnest(q.terms) term
       WHERE g.name ILIKE '%' || term || '%'
          OR g.description ILIKE '%' || term || '%'
          OR g.vehicle_make ILIKE term || '%'
          OR g.vehicle_model ILIKE term || '%'
          OR g.location_region ILIKE '%' || term || '%'
          OR g.category ILIKE term || '%') AS matched,
      (SELECT count(*)::integer FROM unnest(q.years) y
       WHERE g.year_start IS NOT NULL AND y BETWEEN g.year_start AND COALESCE(g.year_end, 2100)) AS year_matches
    FROM public.community_groups g
    WHERE g.status = 'active'
  ), visible AS (
    SELECT scored.id, scored.name_key, scored.matched + scored.year_matches AS result_rank
    FROM scored
    WHERE scored.matched + scored.year_matches > 0
      AND (cardinality(q.terms) = 0 OR scored.matched > 0)
      AND scored.id IN (SELECT listed.group_id FROM public.list_visible_group_ids(p_viewer_id) listed)
  )
  SELECT visible.id, visible.result_rank, visible.name_key
  FROM visible
  WHERE p_before_rank IS NULL
     OR visible.result_rank < p_before_rank
     OR (visible.result_rank = p_before_rank AND visible.name_key > p_before_sort_text)
     OR (visible.result_rank = p_before_rank AND visible.name_key = p_before_sort_text AND visible.id > p_before_id)
  ORDER BY visible.result_rank DESC, visible.name_key ASC, visible.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
END;
$$;

CREATE FUNCTION public.search_vehicles_cursor(
  p_viewer_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_before_rank integer DEFAULT NULL,
  p_before_sort_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE(vehicle_id uuid, rank integer, sort_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
  IF num_nonnulls(p_before_rank, p_before_sort_at, p_before_id) NOT IN (0, 3) THEN RETURN; END IF;
  SELECT * INTO q FROM public.community_search_terms(p_query);
  IF cardinality(q.terms) = 0 AND cardinality(q.years) = 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT v.id, v.updated_at,
      (SELECT count(*)::integer FROM unnest(q.terms) term
       WHERE v.make ILIKE term || '%'
          OR v.model ILIKE term || '%'
          OR v.trim ILIKE '%' || term || '%'
          OR v.nickname ILIKE '%' || term || '%'
          OR v.engine ILIKE '%' || term || '%'
          OR v.body_style ILIKE term || '%') AS matched,
      (SELECT count(*)::integer FROM unnest(q.years) y WHERE v.year = y) AS year_matches
    FROM public.vehicles v
    WHERE v.owner_id IS NOT NULL AND v.visibility <> 'private'
  ), visible AS (
    SELECT scored.id, scored.updated_at, scored.matched + scored.year_matches AS result_rank
    FROM scored
    WHERE scored.matched + scored.year_matches > 0
      AND (cardinality(q.terms) = 0 OR scored.matched > 0)
      AND private.social_can_view_vehicle(p_viewer_id, scored.id)
  )
  SELECT visible.id, visible.result_rank, visible.updated_at
  FROM visible
  WHERE p_before_rank IS NULL
     OR (visible.result_rank, visible.updated_at, visible.id) < (p_before_rank, p_before_sort_at, p_before_id)
  ORDER BY visible.result_rank DESC, visible.updated_at DESC, visible.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
END;
$$;

CREATE FUNCTION public.search_marketplace_listings_cursor(
  p_viewer_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_before_rank integer DEFAULT NULL,
  p_before_sort_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE(listing_id uuid, rank integer, sort_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
  IF num_nonnulls(p_before_rank, p_before_sort_at, p_before_id) NOT IN (0, 3) THEN RETURN; END IF;
  SELECT * INTO q FROM public.community_search_terms(p_query);
  IF cardinality(q.terms) = 0 AND cardinality(q.years) = 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT listing.id, listing.created_at, listing.seller_id,
      (SELECT count(*)::integer FROM unnest(q.terms) term
       WHERE listing.title ILIKE '%' || term || '%'
          OR listing.description ILIKE '%' || term || '%'
          OR listing.location ILIKE '%' || term || '%'
          OR vehicle.make ILIKE term || '%'
          OR vehicle.model ILIKE term || '%'
          OR vehicle.trim ILIKE '%' || term || '%') AS matched,
      (SELECT count(*)::integer FROM unnest(q.years) y WHERE vehicle.year = y) AS year_matches
    FROM public.marketplace_listings listing
    JOIN public.vehicles vehicle ON vehicle.id = listing.vehicle_id
    WHERE listing.status = 'active'
      AND vehicle.visibility = 'public'
      AND vehicle.owner_id = listing.seller_id
  ), visible AS (
    SELECT scored.id, scored.created_at, scored.matched + scored.year_matches AS result_rank
    FROM scored
    WHERE scored.matched + scored.year_matches > 0
      AND (cardinality(q.terms) = 0 OR scored.matched > 0)
      AND public.social_profile_is_available(scored.seller_id)
      AND NOT public.social_profiles_are_blocked(p_viewer_id, scored.seller_id)
  )
  SELECT visible.id, visible.result_rank, visible.created_at
  FROM visible
  WHERE p_before_rank IS NULL
     OR (visible.result_rank, visible.created_at, visible.id) < (p_before_rank, p_before_sort_at, p_before_id)
  ORDER BY visible.result_rank DESC, visible.created_at DESC, visible.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
END;
$$;

CREATE FUNCTION public.search_technicians_cursor(
  p_viewer_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_before_rank integer DEFAULT NULL,
  p_before_sort_count integer DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE(technician_id uuid, profile_id uuid, rank integer, sort_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
  IF num_nonnulls(p_before_rank, p_before_sort_count, p_before_id) NOT IN (0, 3) THEN RETURN; END IF;
  SELECT * INTO q FROM public.community_search_terms(p_query);
  IF cardinality(q.terms) = 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT technician.id, technician.profile_id, technician.total_inspections,
      (SELECT count(*)::integer FROM unnest(q.terms) term
       WHERE profile.display_name ILIKE '%' || term || '%'
          OR profile.username_normalized LIKE term || '%'
          OR technician.service_area ILIKE '%' || term || '%'
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(technician.specialties, ARRAY[]::text[])) s WHERE s ILIKE '%' || term || '%')) AS matched
    FROM public.technician_profiles technician
    JOIN public.profiles profile ON profile.id = technician.profile_id
    WHERE profile.is_public AND profile.username_state = 'claimed'
  )
  SELECT scored.id, scored.profile_id, scored.matched, scored.total_inspections
  FROM scored
  WHERE scored.matched > 0
    AND public.social_can_view_profile(p_viewer_id, scored.profile_id)
    AND (
      p_before_rank IS NULL
      OR scored.matched < p_before_rank
      OR (scored.matched = p_before_rank AND scored.total_inspections < p_before_sort_count)
      OR (scored.matched = p_before_rank AND scored.total_inspections = p_before_sort_count AND scored.id > p_before_id)
    )
  ORDER BY scored.matched DESC, scored.total_inspections DESC, scored.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
END;
$$;

CREATE FUNCTION public.search_profiles_cursor(
  p_viewer_profile_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_before_exact_match boolean DEFAULT NULL,
  p_before_username_prefix boolean DEFAULT NULL,
  p_before_sort_text text DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE(
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_public boolean,
  exact_match boolean,
  relationship_state text,
  mutual_friend_count integer,
  sort_prefix boolean,
  sort_text text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := p_viewer_profile_id;
  v_q text := lower(regexp_replace(COALESCE(p_query, ''), '^\s*@', ''));
BEGIN
  v_q := btrim(v_q);
  IF v_me IS NULL OR length(v_q) < 2 OR length(v_q) > 64 THEN RETURN; END IF;
  IF NOT public.social_profile_is_available(v_me) THEN RETURN; END IF;
  IF num_nonnulls(p_before_exact_match, p_before_username_prefix, p_before_sort_text, p_before_id) NOT IN (0, 4) THEN RETURN; END IF;
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  WITH candidates AS (
    SELECT
      profile.id, profile.username, profile.display_name, profile.avatar_url, profile.is_public,
      (profile.username_normalized = v_q) AS is_exact,
      (profile.username_normalized LIKE v_q || '%') AS is_prefix,
      lower(COALESCE(profile.display_name, profile.username, '')) AS name_key
    FROM public.profiles profile
    WHERE profile.id <> v_me
      AND profile.username_state = 'claimed'
      AND (
        (profile.allow_exact_username_lookup AND profile.username_normalized = v_q)
        OR (
          profile.discoverable
          AND (
            profile.username_normalized LIKE v_q || '%'
            OR lower(profile.display_name) LIKE v_q || '%'
            OR lower(profile.display_name) LIKE '% ' || v_q || '%'
          )
        )
      )
  )
  SELECT
    candidate.id, candidate.username, candidate.display_name, candidate.avatar_url, candidate.is_public,
    candidate.is_exact,
    public.friend_relationship_state(v_me, candidate.id),
    (SELECT count(*)::integer FROM public.friend_mutual_ids(v_me, candidate.id)),
    candidate.is_prefix,
    candidate.name_key
  FROM candidates candidate
  WHERE public.social_can_view_profile(v_me, candidate.id)
    AND (
      p_before_exact_match IS NULL
      OR candidate.is_exact < p_before_exact_match
      OR (candidate.is_exact = p_before_exact_match AND candidate.is_prefix < p_before_username_prefix)
      OR (candidate.is_exact = p_before_exact_match AND candidate.is_prefix = p_before_username_prefix AND candidate.name_key > p_before_sort_text)
      OR (candidate.is_exact = p_before_exact_match AND candidate.is_prefix = p_before_username_prefix AND candidate.name_key = p_before_sort_text AND candidate.id > p_before_id)
    )
  ORDER BY candidate.is_exact DESC, candidate.is_prefix DESC, candidate.name_key ASC, candidate.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 25);
END;
$$;

CREATE FUNCTION public.search_community_events_cursor(
  p_viewer_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_before_sort_rank integer DEFAULT NULL,
  p_before_sort_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE(event_id uuid, sort_rank integer, sort_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF num_nonnulls(p_before_sort_rank, p_before_sort_at, p_before_id) NOT IN (0, 3) THEN RETURN; END IF;

  RETURN QUERY
  WITH visible AS (
    SELECT
      event.id,
      CASE WHEN lower(event.title) LIKE lower(btrim(p_query)) || '%' THEN 0 ELSE 1 END AS title_rank,
      event.starts_at
    FROM public.community_events event
    WHERE char_length(btrim(COALESCE(p_query, ''))) BETWEEN 2 AND 100
      AND event.ends_at >= now()
      AND public.social_can_view_community_event(p_viewer_id, event.id, true)
      AND concat_ws(' ', event.title, event.general_location, replace(event.event_type::text, '_', ' '))
        ILIKE '%' || btrim(p_query) || '%'
  )
  SELECT visible.id, visible.title_rank, visible.starts_at
  FROM visible
  WHERE p_before_sort_rank IS NULL
     OR (visible.title_rank, visible.starts_at, visible.id) > (p_before_sort_rank, p_before_sort_at, p_before_id)
  ORDER BY visible.title_rank ASC, visible.starts_at ASC, visible.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.search_community_posts_cursor(uuid, text, integer, integer, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_community_groups_cursor(uuid, text, integer, integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_vehicles_cursor(uuid, text, integer, integer, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_marketplace_listings_cursor(uuid, text, integer, integer, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_technicians_cursor(uuid, text, integer, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_profiles_cursor(uuid, text, integer, boolean, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_community_events_cursor(uuid, text, integer, integer, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_community_posts_cursor(uuid, text, integer, integer, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_community_groups_cursor(uuid, text, integer, integer, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_vehicles_cursor(uuid, text, integer, integer, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_marketplace_listings_cursor(uuid, text, integer, integer, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_technicians_cursor(uuid, text, integer, integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_profiles_cursor(uuid, text, integer, boolean, boolean, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_community_events_cursor(uuid, text, integer, integer, timestamptz, uuid) TO service_role;

COMMIT;
