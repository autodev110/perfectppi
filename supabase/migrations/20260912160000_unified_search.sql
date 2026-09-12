-- Plan 27.2: unified Community search. One query, separate result tabs
-- (people, groups, posts, vehicles, listings, technicians). The functions
-- understand structured automotive data — make aliases, years, diagnostic
-- codes — and every result is delivered only after the canonical visibility
-- rules pass (private profiles' shells only, private/unlisted groups for
-- members only, blocks both ways, hidden content never). Service-only.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Query understanding
-- ---------------------------------------------------------------------------
CREATE TABLE public.vehicle_make_aliases (
  alias text PRIMARY KEY CHECK (alias = lower(alias) AND char_length(alias) BETWEEN 2 AND 40),
  canonical text NOT NULL CHECK (char_length(canonical) BETWEEN 2 AND 40)
);
ALTER TABLE public.vehicle_make_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_make_aliases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vehicle_make_aliases TO service_role;

INSERT INTO public.vehicle_make_aliases (alias, canonical) VALUES
  ('chevy', 'chevrolet'), ('chev', 'chevrolet'),
  ('vw', 'volkswagen'), ('dub', 'volkswagen'),
  ('bimmer', 'bmw'), ('beemer', 'bmw'), ('beamer', 'bmw'),
  ('merc', 'mercedes-benz'), ('mercedes', 'mercedes-benz'), ('benz', 'mercedes-benz'), ('mb', 'mercedes-benz'),
  ('subie', 'subaru'), ('scooby', 'subaru'),
  ('lambo', 'lamborghini'),
  ('porsche', 'porsche'), ('pcar', 'porsche'),
  ('landrover', 'land rover'),
  ('alfa', 'alfa romeo'),
  ('aston', 'aston martin'),
  ('rolls', 'rolls-royce'),
  ('caddy', 'cadillac'),
  ('mopar', 'dodge'),
  ('mazda', 'mazda'), ('toyota', 'toyota'), ('honda', 'honda'), ('nissan', 'nissan'),
  ('acura', 'acura'), ('lexus', 'lexus'), ('infiniti', 'infiniti'),
  ('tesla', 'tesla'), ('ford', 'ford'), ('jeep', 'jeep'), ('ram', 'ram'), ('gmc', 'gmc'),
  ('audi', 'audi'), ('mini', 'mini'), ('volvo', 'volvo'), ('kia', 'kia'), ('hyundai', 'hyundai'),
  ('genesis', 'genesis'), ('jaguar', 'jaguar'), ('ferrari', 'ferrari'), ('mclaren', 'mclaren'),
  ('bmw', 'bmw'), ('chevrolet', 'chevrolet'), ('volkswagen', 'volkswagen'), ('subaru', 'subaru'),
  ('lamborghini', 'lamborghini'), ('cadillac', 'cadillac'), ('dodge', 'dodge'), ('chrysler', 'chrysler'),
  ('buick', 'buick'), ('lincoln', 'lincoln'), ('mitsubishi', 'mitsubishi'), ('fiat', 'fiat'), ('lotus', 'lotus');

-- Splits a query into lowercase terms and pulls out the structured parts.
-- `terms` keeps plain words (2..40 chars, LIKE-escaped); makes are the
-- canonical names any term resolved to; years and OBD-II codes are exact.
CREATE FUNCTION public.community_search_terms(p_query text)
RETURNS TABLE(terms text[], makes text[], years integer[], codes text[])
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_terms text[] := ARRAY[]::text[];
  v_makes text[] := ARRAY[]::text[];
  v_years integer[] := ARRAY[]::integer[];
  v_codes text[] := ARRAY[]::text[];
  v_canonical text;
BEGIN
  FOR v_token IN
    SELECT DISTINCT lower(t)
    FROM regexp_split_to_table(btrim(COALESCE(p_query, '')), '[\s,;]+') AS t
    WHERE char_length(t) BETWEEN 2 AND 40
    LIMIT 8
  LOOP
    IF v_token ~ '^[pbcu][0-9]{4}$' THEN
      v_codes := array_append(v_codes, upper(v_token));
      v_terms := array_append(v_terms, v_token);
      CONTINUE;
    END IF;
    IF v_token ~ '^(18[89][0-9]|19[0-9]{2}|20[0-9]{2}|2100)$' THEN
      v_years := array_append(v_years, v_token::integer);
      CONTINUE;
    END IF;
    SELECT alias.canonical INTO v_canonical FROM public.vehicle_make_aliases alias WHERE alias.alias = v_token;
    IF v_canonical IS NOT NULL THEN
      v_makes := array_append(v_makes, v_canonical);
      v_terms := array_append(v_terms, v_canonical);
    ELSE
      v_terms := array_append(v_terms, replace(replace(replace(v_token, '\', '\\'), '%', '\%'), '_', '\_'));
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_terms, v_makes, v_years, v_codes;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Result tabs. Every function: text match first, canonical visibility
--    second, nothing hidden/rejected/held, blocks both ways.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.search_community_posts(p_viewer_id uuid, p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE(post_id uuid, rank integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
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
  )
  SELECT scored.id, scored.matched + scored.year_matches
  FROM scored
  WHERE scored.matched + scored.year_matches > 0
    AND (cardinality(q.terms) = 0 OR scored.matched > 0)
    AND public.social_can_view_community_post(p_viewer_id, scored.id, false)
  ORDER BY scored.matched + scored.year_matches DESC, scored.created_at DESC, scored.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE FUNCTION public.search_community_groups(p_viewer_id uuid, p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE(group_id uuid, rank integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
  SELECT * INTO q FROM public.community_search_terms(p_query);
  IF cardinality(q.terms) = 0 AND cardinality(q.years) = 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT g.id, g.name,
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
  )
  SELECT scored.id, scored.matched + scored.year_matches
  FROM scored
  WHERE scored.matched + scored.year_matches > 0
    AND (cardinality(q.terms) = 0 OR scored.matched > 0)
    -- Search is general discovery (13.3): unlisted groups appear only for
    -- their members, invitees, and requesters — the directory rule, not the
    -- direct-link shell rule.
    AND scored.id IN (SELECT visible.group_id FROM public.list_visible_group_ids(p_viewer_id) visible)
  ORDER BY scored.matched + scored.year_matches DESC, scored.name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- Vehicles/builds: public cars, friends' friends-only cars, and the viewer's
-- own; private cars never. Redaction (no VIN) happens in the projection.
CREATE FUNCTION public.search_vehicles(p_viewer_id uuid, p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE(vehicle_id uuid, rank integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
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
  )
  SELECT scored.id, scored.matched + scored.year_matches
  FROM scored
  WHERE scored.matched + scored.year_matches > 0
    AND (cardinality(q.terms) = 0 OR scored.matched > 0)
    AND private.social_can_view_vehicle(p_viewer_id, scored.id)
  ORDER BY scored.matched + scored.year_matches DESC, scored.updated_at DESC, scored.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE FUNCTION public.search_marketplace_listings(p_viewer_id uuid, p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE(listing_id uuid, rank integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
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
  )
  SELECT scored.id, scored.matched + scored.year_matches
  FROM scored
  WHERE scored.matched + scored.year_matches > 0
    AND (cardinality(q.terms) = 0 OR scored.matched > 0)
    AND public.social_profile_is_available(scored.seller_id)
    AND NOT public.social_profiles_are_blocked(p_viewer_id, scored.seller_id)
  ORDER BY scored.matched + scored.year_matches DESC, scored.created_at DESC, scored.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- Technicians: listed (public profile) technicians by name, specialty, area.
CREATE FUNCTION public.search_technicians(p_viewer_id uuid, p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE(technician_id uuid, profile_id uuid, rank integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
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
  SELECT scored.id, scored.profile_id, scored.matched
  FROM scored
  WHERE scored.matched > 0
    AND public.social_can_view_profile(p_viewer_id, scored.profile_id)
  ORDER BY scored.matched DESC, scored.total_inspections DESC, scored.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- Helpful no-result suggestions: makes that look like a misspelled term.
CREATE FUNCTION public.search_make_suggestions(p_query text)
RETURNS TABLE(suggestion text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT initcap(alias.canonical)
  FROM regexp_split_to_table(lower(btrim(COALESCE(p_query, ''))), '[\s,;]+') term
  JOIN public.vehicle_make_aliases alias
    ON extensions.similarity(alias.alias, term) >= 0.4
   AND alias.alias <> term
  WHERE char_length(term) >= 3
    -- Only when the term itself is not a known alias (no suggestion needed).
    AND NOT EXISTS (SELECT 1 FROM public.vehicle_make_aliases known WHERE known.alias = term)
  GROUP BY alias.canonical
  ORDER BY max(extensions.similarity(alias.alias, term)) DESC
  LIMIT 3;
$$;

REVOKE ALL ON FUNCTION public.community_search_terms(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_community_posts(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_community_groups(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_vehicles(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_marketplace_listings(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_technicians(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_make_suggestions(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_search_terms(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_community_posts(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_community_groups(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_vehicles(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_marketplace_listings(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_technicians(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_make_suggestions(text) TO service_role;

COMMIT;
