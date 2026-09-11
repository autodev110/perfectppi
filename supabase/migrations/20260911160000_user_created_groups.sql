BEGIN;

-- Phase 1C, first slice: member-created groups (plan 13.2 / 13.3 / 13.4).
--
-- Members may now create Public / Open groups behind the `group_creation`
-- flag (server-enforced). Private, unlisted, request-approval, and
-- invite-only groups stay off; the schema already carries those values.
-- Creation is gated by account age, active enforcement, and rate limits;
-- owners edit settings (never the slug); a group may restrict posting to
-- moderators (announcement groups). Every "is this group live" check stops
-- requiring staff curation — curation becomes a directory badge.

ALTER TABLE public.community_groups
  ADD COLUMN location_region text CHECK (location_region IS NULL OR char_length(btrim(location_region)) BETWEEN 2 AND 80),
  ADD COLUMN posting_policy text NOT NULL DEFAULT 'members' CHECK (posting_policy IN ('members', 'moderators'));

-- Directory index no longer keyed on curation.
DROP INDEX IF EXISTS public.community_groups_directory_idx;
CREATE INDEX community_groups_directory_idx
  ON public.community_groups(status, visibility, is_staff_curated DESC, name, id);

CREATE TABLE public.community_group_creation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.community_groups(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_group_creation_events_actor_idx
  ON public.community_group_creation_events(actor_id, created_at DESC);
ALTER TABLE public.community_group_creation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_group_creation_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.community_group_creation_events TO service_role;

-- ---------------------------------------------------------------------------
-- 1. "Live" helpers replace the staff-curated gates
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.community_group_is_live(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_groups community_group
    WHERE community_group.id = p_group_id
      AND community_group.status = 'active'
      AND community_group.visibility = 'public'
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_community_group_post()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group public.community_groups%ROWTYPE;
  v_role public.community_group_role;
BEGIN
  IF NEW.group_id IS NULL THEN
    IF NEW.group_status <> 'active' THEN
      RAISE EXCEPTION 'non-group post cannot have a group removal state';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.audience <> 'public' THEN
    RAISE EXCEPTION 'launch group posts must use the public group audience';
  END IF;

  SELECT * INTO v_group FROM public.community_groups WHERE id = NEW.group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id
     AND NEW.author_id IS NOT DISTINCT FROM OLD.author_id THEN
    RETURN NEW;
  END IF;

  IF v_group.status <> 'active' OR v_group.visibility <> 'public' OR v_group.join_policy <> 'open' THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;

  SELECT membership.role INTO v_role
  FROM public.community_group_memberships membership
  WHERE membership.group_id = NEW.group_id
    AND membership.profile_id = NEW.author_id
    AND membership.status = 'active';
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'active group membership required';
  END IF;
  -- Announcement groups: only owner/moderators publish posts (13.2 posting
  -- permissions); comments stay open to members.
  IF v_group.posting_policy = 'moderators' AND v_role = 'member' THEN
    RAISE EXCEPTION 'only group moderators can post here';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_community_group_comment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT post.group_id INTO v_group_id
  FROM public.community_posts post
  WHERE post.id = NEW.post_id;

  IF v_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.community_group_is_live(v_group_id) OR NOT EXISTS (
    SELECT 1 FROM public.community_group_memberships membership
    WHERE membership.group_id = v_group_id
      AND membership.profile_id = NEW.author_id
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active group membership required to comment';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.social_can_view_community_post(
  p_viewer_id uuid,
  p_post_id uuid,
  p_include_muted boolean DEFAULT false
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
    JOIN public.profiles author ON author.id = post.author_id
    WHERE post.id = p_post_id
      AND post.status = 'active'
      AND post.moderation_status = 'active'
      AND public.social_can_view_profile(p_viewer_id, author.id)
      AND (
        p_include_muted
        OR NOT EXISTS (
          SELECT 1 FROM public.profile_mutes mute
          WHERE mute.muter_id = p_viewer_id AND mute.muted_id = author.id
        )
      )
      AND (
        (
          post.group_id IS NULL
          AND (
            author.id = p_viewer_id
            OR (post.audience = 'public' AND author.is_public)
            OR (post.audience = 'friends' AND public.social_profiles_are_friends(p_viewer_id, author.id))
          )
        )
        OR (
          post.group_id IS NOT NULL
          AND post.group_status = 'active'
          AND public.community_group_is_live(post.group_id)
        )
      )
      AND (
        post.vehicle_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.vehicles vehicle
          WHERE vehicle.id = post.vehicle_id AND vehicle.visibility = 'public'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.join_curated_community_group(
  p_actor_profile_id uuid,
  p_group_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.community_group_memberships;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_groups community_group
    WHERE community_group.id = p_group_id
      AND community_group.status = 'active'
      AND community_group.visibility = 'public'
      AND community_group.join_policy = 'open'
  ) THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;

  SELECT * INTO v_existing
  FROM public.community_group_memberships membership
  WHERE membership.group_id = p_group_id AND membership.profile_id = p_actor_profile_id
  FOR UPDATE;

  IF FOUND AND v_existing.status = 'banned' THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;
  IF FOUND AND v_existing.status = 'active' THEN
    RETURN false;
  END IF;

  INSERT INTO public.community_group_memberships (group_id, profile_id, role, status, joined_at)
  VALUES (p_group_id, p_actor_profile_id, 'member', 'active', now())
  ON CONFLICT (group_id, profile_id) DO UPDATE
    SET role = 'member', status = 'active', joined_at = now(), updated_at = now();
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Member creation with account-age, enforcement, and rate limits (13.2)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.create_community_group(
  p_actor_profile_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_category text,
  p_rules text[] DEFAULT ARRAY[]::text[],
  p_vehicle_make text DEFAULT NULL,
  p_vehicle_model text DEFAULT NULL,
  p_year_start integer DEFAULT NULL,
  p_year_end integer DEFAULT NULL,
  p_location_region text DEFAULT NULL,
  p_posting_policy text DEFAULT 'members'
)
RETURNS public.community_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_group public.community_groups;
  v_recent integer;
  v_owned integer;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_actor_profile_id;
  IF NOT FOUND OR NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Brand-new accounts join groups before they create them.
  IF v_profile.role <> 'admin' AND v_profile.created_at > now() - interval '7 days' THEN
    RAISE EXCEPTION 'group_creation_account_too_new' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_enforcement_actions action
    WHERE action.profile_id = p_actor_profile_id
      AND action.action_type IN ('temporary_posting_hold', 'suspension', 'ban')
      AND action.starts_at <= now()
      AND (action.ends_at IS NULL OR action.ends_at > now())
  ) THEN
    RAISE EXCEPTION 'group_creation_restricted' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.community_group_creation_events
  WHERE actor_id = p_actor_profile_id AND created_at > now() - interval '24 hours';
  SELECT count(*) INTO v_owned
  FROM public.community_group_memberships membership
  JOIN public.community_groups community_group ON community_group.id = membership.group_id
  WHERE membership.profile_id = p_actor_profile_id
    AND membership.role = 'owner' AND membership.status = 'active'
    AND community_group.status = 'active';
  IF v_profile.role <> 'admin' AND (v_recent >= 2 OR v_owned >= 5) THEN
    RAISE EXCEPTION 'group_creation_rate_limited' USING ERRCODE = 'raise_exception';
  END IF;

  IF EXISTS (SELECT 1 FROM public.community_groups WHERE lower(slug) = lower(btrim(p_slug))) THEN
    RAISE EXCEPTION 'group_slug_taken' USING ERRCODE = 'unique_violation';
  END IF;
  IF p_posting_policy NOT IN ('members', 'moderators') THEN
    RAISE EXCEPTION 'invalid posting policy' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.community_groups (
    slug, name, description, category, rules, visibility, join_policy,
    is_staff_curated, vehicle_make, vehicle_model, year_start, year_end,
    location_region, posting_policy, created_by
  ) VALUES (
    lower(btrim(p_slug)), btrim(p_name), btrim(p_description), p_category,
    COALESCE(p_rules, ARRAY[]::text[]), 'public', 'open',
    false, NULLIF(btrim(p_vehicle_make), ''), NULLIF(btrim(p_vehicle_model), ''),
    p_year_start, p_year_end,
    NULLIF(btrim(p_location_region), ''), p_posting_policy, p_actor_profile_id
  ) RETURNING * INTO v_group;

  INSERT INTO public.community_group_memberships (group_id, profile_id, role, status)
  VALUES (v_group.id, p_actor_profile_id, 'owner', 'active');
  INSERT INTO public.community_group_creation_events (actor_id, group_id)
  VALUES (p_actor_profile_id, v_group.id);
  RETURN v_group;
END;
$$;

-- Owner-only settings. The slug is the group's stable identifier and never
-- changes; visibility/join policy stay fixed until Phase 1C enables them.
CREATE FUNCTION public.update_community_group_settings(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_rules text[],
  p_vehicle_make text,
  p_vehicle_model text,
  p_year_start integer,
  p_year_end integer,
  p_location_region text,
  p_posting_policy text
)
RETURNS public.community_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.community_group_role;
  v_group public.community_groups;
  v_before public.community_groups;
BEGIN
  v_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF v_role <> 'owner' THEN
    RAISE EXCEPTION 'only the owner can change group settings' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_posting_policy NOT IN ('members', 'moderators') THEN
    RAISE EXCEPTION 'invalid posting policy' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before FROM public.community_groups WHERE id = p_group_id FOR UPDATE;
  UPDATE public.community_groups
  SET name = btrim(p_name),
      description = btrim(p_description),
      category = p_category,
      rules = COALESCE(p_rules, ARRAY[]::text[]),
      vehicle_make = NULLIF(btrim(p_vehicle_make), ''),
      vehicle_model = NULLIF(btrim(p_vehicle_model), ''),
      year_start = p_year_start,
      year_end = p_year_end,
      location_region = NULLIF(btrim(p_location_region), ''),
      posting_policy = p_posting_policy
  WHERE id = p_group_id
  RETURNING * INTO v_group;

  PERFORM public.community_group_log(
    p_group_id, p_actor_profile_id, 'settings_changed', NULL, NULL, NULL,
    jsonb_build_object(
      'name', jsonb_build_array(v_before.name, v_group.name),
      'category', jsonb_build_array(v_before.category, v_group.category),
      'posting_policy', jsonb_build_array(v_before.posting_policy, v_group.posting_policy)
    )
  );
  RETURN v_group;
END;
$$;

ALTER TABLE public.community_group_moderation_events
  DROP CONSTRAINT community_group_moderation_events_action_check;
ALTER TABLE public.community_group_moderation_events
  ADD CONSTRAINT community_group_moderation_events_action_check CHECK (action IN (
    'post_pinned', 'post_unpinned', 'post_group_removed', 'post_group_restored',
    'member_removed', 'member_banned', 'member_unbanned', 'role_changed',
    'ownership_transferred', 'group_archived', 'settings_changed'
  ));

-- Member list: any live public group, not only curated ones.
CREATE OR REPLACE FUNCTION public.list_group_members(
  p_viewer_id uuid,
  p_group_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  role public.community_group_role,
  joined_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.id, profile.username, profile.display_name, profile.avatar_url, membership.role, membership.joined_at
  FROM public.community_group_memberships membership
  JOIN public.community_groups community_group ON community_group.id = membership.group_id
  JOIN public.profiles profile ON profile.id = membership.profile_id
  WHERE membership.group_id = p_group_id
    AND membership.status = 'active'
    AND p_viewer_id IS NOT NULL
    AND community_group.status = 'active'
    AND (community_group.visibility = 'public' OR public.community_group_role_of(p_viewer_id, p_group_id) IS NOT NULL)
    AND (profile.id = p_viewer_id OR public.social_can_view_profile(p_viewer_id, profile.id))
  ORDER BY CASE membership.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,
           membership.joined_at, profile.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- 3. Saved listings: hide listings whose seller is suspended or banned (the
--    marketplace already hides them; the saved list should agree).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_saved_marketplace_listing_ids(
  p_viewer_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(listing_id uuid, saved_at timestamptz, listing_status public.listing_status)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT save.listing_id, save.created_at, listing.status
  FROM public.marketplace_listing_saves save
  JOIN public.marketplace_listings listing ON listing.id = save.listing_id
  WHERE save.profile_id = p_viewer_id
    AND NOT public.social_profiles_are_blocked(p_viewer_id, listing.seller_id)
    AND public.social_profile_is_available(listing.seller_id)
  ORDER BY save.created_at DESC, save.listing_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.community_group_is_live(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_community_group(uuid, text, text, text, text, text[], text, text, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_community_group_settings(uuid, uuid, text, text, text, text[], text, text, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_group_is_live(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_community_group(uuid, text, text, text, text, text[], text, text, integer, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_community_group_settings(uuid, uuid, text, text, text, text[], text, text, integer, integer, text, text) TO service_role;

COMMENT ON COLUMN public.community_groups.is_staff_curated IS
  'Directory badge for PerfectPPI-curated groups; no longer a visibility or posting gate.';

COMMIT;
