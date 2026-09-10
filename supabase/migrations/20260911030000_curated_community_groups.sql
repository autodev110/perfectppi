BEGIN;

-- Phase 1A groups are staff-created, public, and open to join. The broader
-- enum values are stored now so later phases can add private/invite flows
-- without rewriting historical rows; no launch RPC can create those states.
CREATE TYPE public.community_group_visibility AS ENUM ('public', 'private', 'unlisted');
CREATE TYPE public.community_group_join_policy AS ENUM ('open', 'request_approval', 'invite_only');
CREATE TYPE public.community_group_status AS ENUM ('active', 'archived');
CREATE TYPE public.community_group_role AS ENUM ('owner', 'moderator', 'member');
CREATE TYPE public.community_group_membership_status AS ENUM ('active', 'left', 'removed', 'banned');
CREATE TYPE public.community_group_post_status AS ENUM ('active', 'group_removed');

CREATE TABLE public.community_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 64),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  category text NOT NULL CHECK (category IN (
    'make_model', 'technical', 'detailing', 'off_road', 'restoration',
    'track', 'classics', 'ev', 'local_club', 'general'
  )),
  rules text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(rules) <= 12),
  avatar_url text,
  cover_url text,
  visibility public.community_group_visibility NOT NULL DEFAULT 'public',
  join_policy public.community_group_join_policy NOT NULL DEFAULT 'open',
  status public.community_group_status NOT NULL DEFAULT 'active',
  is_staff_curated boolean NOT NULL DEFAULT true,
  vehicle_make text,
  vehicle_model text,
  year_start integer CHECK (year_start IS NULL OR year_start BETWEEN 1886 AND 2100),
  year_end integer CHECK (year_end IS NULL OR year_end BETWEEN 1886 AND 2100),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (year_start IS NULL OR year_end IS NULL OR year_start <= year_end),
  CHECK (visibility <> 'private' OR join_policy <> 'open')
);

CREATE UNIQUE INDEX community_groups_slug_unique_idx ON public.community_groups(lower(slug));
CREATE INDEX community_groups_directory_idx
  ON public.community_groups(status, visibility, name, id)
  WHERE is_staff_curated;
CREATE INDEX community_groups_vehicle_tags_idx
  ON public.community_groups(lower(vehicle_make), lower(vehicle_model), status)
  WHERE vehicle_make IS NOT NULL;

CREATE TABLE public.community_group_memberships (
  group_id uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.community_group_role NOT NULL DEFAULT 'member',
  status public.community_group_membership_status NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, profile_id)
);

CREATE UNIQUE INDEX community_group_one_active_owner_idx
  ON public.community_group_memberships(group_id)
  WHERE role = 'owner' AND status = 'active';
CREATE INDEX community_group_memberships_profile_idx
  ON public.community_group_memberships(profile_id, status, updated_at DESC);

CREATE TRIGGER community_groups_updated_at
  BEFORE UPDATE ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER community_group_memberships_updated_at
  BEFORE UPDATE ON public.community_group_memberships
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_group_memberships ENABLE ROW LEVEL SECURITY;

-- Community clients use authenticated application routes. Keeping raw tables
-- service-only prevents future RLS drift from becoming a discovery or role-
-- assignment bypass.
REVOKE ALL ON public.community_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.community_group_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.community_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_group_memberships TO service_role;

ALTER TABLE public.community_posts
  ADD COLUMN group_id uuid REFERENCES public.community_groups(id) ON DELETE SET NULL,
  ADD COLUMN group_status public.community_group_post_status NOT NULL DEFAULT 'active';
CREATE INDEX community_posts_group_created_idx
  ON public.community_posts(group_id, created_at DESC, id DESC)
  WHERE group_id IS NOT NULL AND group_status = 'active';

-- Personal public posts still require a public profile. A public-group post is
-- authorized by group membership instead and may be written by a member whose
-- personal profile remains private.
CREATE OR REPLACE FUNCTION public.guard_community_post_audience()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.group_id IS NULL AND NEW.audience = 'public' AND NOT EXISTS (
    SELECT 1 FROM public.profiles author
    WHERE author.id = NEW.author_id AND author.is_public
  ) THEN
    RAISE EXCEPTION 'private profiles cannot publish public posts';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER community_posts_guard_audience ON public.community_posts;
CREATE TRIGGER community_posts_guard_audience
  BEFORE INSERT OR UPDATE OF audience, author_id, group_id ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_post_audience();

ALTER TABLE public.community_post_revisions
  ADD COLUMN group_id uuid,
  ADD COLUMN group_status public.community_group_post_status NOT NULL DEFAULT 'active';

CREATE OR REPLACE FUNCTION public.capture_community_post_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
  v_is_edit boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.active_revision_id := COALESCE(NEW.active_revision_id, gen_random_uuid());
    RETURN NEW;
  END IF;

  v_is_edit := NEW.content IS DISTINCT FROM OLD.content
    OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
    OR NEW.marketplace_listing_id IS DISTINCT FROM OLD.marketplace_listing_id
    OR NEW.group_id IS DISTINCT FROM OLD.group_id
    OR (
      NEW.audience IS DISTINCT FROM OLD.audience
      AND NOT (OLD.audience = 'public' AND NEW.audience = 'friends')
    );

  IF NEW.active_revision_id IS DISTINCT FROM OLD.active_revision_id AND NOT v_is_edit THEN
    RAISE EXCEPTION 'active revision is managed by the revision trigger';
  END IF;

  IF v_is_edit THEN
    IF OLD.status <> 'active' OR OLD.moderation_status <> 'active' THEN
      RAISE EXCEPTION 'content under review or removal cannot be edited';
    END IF;
    SELECT revision_number + 1 INTO v_revision_number
    FROM public.community_post_revisions
    WHERE id = OLD.active_revision_id;
    IF v_revision_number IS NULL THEN
      RAISE EXCEPTION 'active post revision is unavailable';
    END IF;
    NEW.active_revision_id := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

-- Going private narrows personal public posts only. Public-group posts retain
-- their group-owned audience and remain protected by group visibility rules.
CREATE OR REPLACE FUNCTION public.set_own_social_privacy(
  p_is_public boolean,
  p_default_post_audience public.community_post_audience,
  p_discoverable boolean DEFAULT true,
  p_allow_exact_username_lookup boolean DEFAULT true,
  p_friend_request_policy text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE auth_user_id = auth.uid() AND username_state = 'claimed'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT p_is_public AND p_default_post_audience <> 'friends' THEN
    RAISE EXCEPTION 'private profiles can only default to friends';
  END IF;
  IF p_friend_request_policy IS NOT NULL
     AND p_friend_request_policy NOT IN ('everyone', 'friends_of_friends', 'nobody') THEN
    RAISE EXCEPTION 'invalid friend request policy' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.profiles
  SET is_public = p_is_public,
      default_post_audience = p_default_post_audience,
      discoverable = p_discoverable,
      allow_exact_username_lookup = p_allow_exact_username_lookup,
      friend_request_policy = COALESCE(p_friend_request_policy, friend_request_policy)
  WHERE id = v_profile.id
  RETURNING * INTO v_profile;

  IF NOT p_is_public THEN
    UPDATE public.community_posts
    SET audience = 'friends'
    WHERE author_id = v_profile.id
      AND group_id IS NULL
      AND audience = 'public';
  END IF;
  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_community_post_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_revision_number := 1;
  ELSE
    IF NEW.active_revision_id IS NOT DISTINCT FROM OLD.active_revision_id THEN
      RETURN NEW;
    END IF;
    SELECT revision_number + 1 INTO v_revision_number
    FROM public.community_post_revisions
    WHERE id = OLD.active_revision_id;
  END IF;

  INSERT INTO public.community_post_revisions (
    id, post_id, revision_number, content, audience, vehicle_id,
    marketplace_listing_id, author_id, group_id, group_status
  ) VALUES (
    NEW.active_revision_id, NEW.id, v_revision_number, NEW.content, NEW.audience,
    NEW.vehicle_id, NEW.marketplace_listing_id, NEW.author_id, NEW.group_id, NEW.group_status
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER community_posts_capture_revision ON public.community_posts;
DROP TRIGGER community_posts_persist_revision ON public.community_posts;
CREATE TRIGGER community_posts_capture_revision
  BEFORE INSERT OR UPDATE OF content, audience, vehicle_id, marketplace_listing_id,
    group_id, group_status, active_revision_id
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.capture_community_post_revision();
CREATE TRIGGER community_posts_persist_revision
  AFTER INSERT OR UPDATE OF content, audience, vehicle_id, marketplace_listing_id,
    group_id, group_status, active_revision_id
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.persist_community_post_revision();

CREATE OR REPLACE FUNCTION public.guard_community_group_post()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
  IF NOT EXISTS (
    SELECT 1 FROM public.community_groups community_group
    WHERE community_group.id = NEW.group_id
      AND community_group.status = 'active'
      AND community_group.visibility = 'public'
      AND community_group.join_policy = 'open'
      AND community_group.is_staff_curated
  ) THEN
    RAISE EXCEPTION 'group unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_group_memberships membership
    WHERE membership.group_id = NEW.group_id
      AND membership.profile_id = NEW.author_id
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active group membership required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_posts_guard_group
  BEFORE INSERT OR UPDATE OF group_id, group_status, author_id, audience
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_group_post();

CREATE OR REPLACE FUNCTION public.guard_community_group_comment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT post.group_id
  INTO v_group_id
  FROM public.community_posts post
  WHERE post.id = NEW.post_id;

  IF v_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.community_groups community_group
    JOIN public.community_group_memberships membership
      ON membership.group_id = community_group.id
    WHERE community_group.id = v_group_id
      AND community_group.status = 'active'
      AND community_group.visibility = 'public'
      AND community_group.is_staff_curated
      AND membership.profile_id = NEW.author_id
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active group membership required to comment';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER community_comments_guard_group
  BEFORE INSERT OR UPDATE OF post_id, author_id
  ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_group_comment();

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
          AND EXISTS (
            SELECT 1 FROM public.community_groups community_group
            WHERE community_group.id = post.group_id
              AND community_group.status = 'active'
              AND community_group.visibility = 'public'
              AND community_group.is_staff_curated
          )
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

DROP FUNCTION public.social_visible_community_post_ids(uuid, integer, integer, uuid);
CREATE FUNCTION public.social_visible_community_post_ids(
  p_viewer_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_vehicle_id uuid DEFAULT NULL,
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
  WHERE (p_vehicle_id IS NULL OR post.vehicle_id = p_vehicle_id)
    AND (p_include_group_posts OR post.group_id IS NULL)
    AND public.social_can_view_community_post(p_viewer_id, post.id, false)
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

CREATE FUNCTION public.social_visible_community_group_post_ids(
  p_viewer_id uuid,
  p_group_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(post_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT post.id
  FROM public.community_posts post
  WHERE post.group_id = p_group_id
    AND public.social_can_view_community_post(p_viewer_id, post.id, false)
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

CREATE FUNCTION public.create_curated_community_group(
  p_actor_profile_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_category text,
  p_rules text[] DEFAULT ARRAY[]::text[],
  p_vehicle_make text DEFAULT NULL,
  p_vehicle_model text DEFAULT NULL,
  p_year_start integer DEFAULT NULL,
  p_year_end integer DEFAULT NULL
)
RETURNS public.community_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.community_groups;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles profile
       WHERE profile.id = p_actor_profile_id AND profile.role = 'admin'
     ) THEN
    RAISE EXCEPTION 'active administrator required';
  END IF;

  INSERT INTO public.community_groups (
    slug, name, description, category, rules, visibility, join_policy,
    is_staff_curated, vehicle_make, vehicle_model, year_start, year_end, created_by
  ) VALUES (
    lower(btrim(p_slug)), btrim(p_name), btrim(p_description), p_category,
    COALESCE(p_rules, ARRAY[]::text[]), 'public', 'open', true,
    NULLIF(btrim(p_vehicle_make), ''), NULLIF(btrim(p_vehicle_model), ''),
    p_year_start, p_year_end, p_actor_profile_id
  ) RETURNING * INTO v_group;

  INSERT INTO public.community_group_memberships (group_id, profile_id, role, status)
  VALUES (v_group.id, p_actor_profile_id, 'owner', 'active');
  RETURN v_group;
END;
$$;

CREATE FUNCTION public.join_curated_community_group(
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
      AND community_group.is_staff_curated
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

CREATE FUNCTION public.leave_curated_community_group(
  p_actor_profile_id uuid,
  p_group_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_membership public.community_group_memberships;
BEGIN
  SELECT * INTO v_membership
  FROM public.community_group_memberships membership
  WHERE membership.group_id = p_group_id AND membership.profile_id = p_actor_profile_id
  FOR UPDATE;
  IF NOT FOUND OR v_membership.status <> 'active' THEN
    RETURN false;
  END IF;
  IF v_membership.role = 'owner' THEN
    RAISE EXCEPTION 'group owner must transfer or archive the group before leaving';
  END IF;
  UPDATE public.community_group_memberships
  SET status = 'left', updated_at = now()
  WHERE group_id = p_group_id AND profile_id = p_actor_profile_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.prevent_active_group_owner_deletion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.community_group_memberships membership
    JOIN public.community_groups community_group ON community_group.id = membership.group_id
    WHERE membership.profile_id = OLD.id
      AND membership.role = 'owner'
      AND membership.status = 'active'
      AND community_group.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active group ownership must be transferred or archived before account deletion';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER profiles_prevent_active_group_owner_deletion
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_active_group_owner_deletion();

-- Add the immutable destination fields to every newly captured moderation
-- evidence snapshot without duplicating the large report transaction.
CREATE FUNCTION public.augment_group_moderation_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_group_status public.community_group_post_status;
BEGIN
  IF NEW.content_snapshot->>'entityType' = 'community_post' THEN
    SELECT revision.group_id, revision.group_status
    INTO v_group_id, v_group_status
    FROM public.community_post_revisions revision
    WHERE revision.id = NEW.revision_id;
    NEW.content_snapshot := NEW.content_snapshot || jsonb_build_object(
      'groupId', v_group_id,
      'groupStatus', v_group_status
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER moderation_evidence_augment_group
  BEFORE INSERT ON public.moderation_evidence
  FOR EACH ROW EXECUTE FUNCTION public.augment_group_moderation_evidence();

REVOKE ALL ON FUNCTION public.social_can_view_community_post(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_visible_community_post_ids(uuid, integer, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_visible_community_group_post_ids(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_curated_community_group(uuid, text, text, text, text, text[], text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_curated_community_group(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leave_curated_community_group(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_community_group_comment() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.social_can_view_community_post(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_visible_community_post_ids(uuid, integer, integer, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_visible_community_group_post_ids(uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_curated_community_group(uuid, text, text, text, text, text[], text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.join_curated_community_group(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.leave_curated_community_group(uuid, uuid) TO service_role;

COMMENT ON TABLE public.community_groups IS
  'Staff-curated Phase 1A groups. User-created and non-public groups remain disabled.';
COMMENT ON COLUMN public.community_posts.group_status IS
  'Destination-level state independent from global content moderation status.';

COMMIT;
