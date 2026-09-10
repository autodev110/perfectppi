-- Social privacy, audience, friendship, block, and mute foundation.
-- Ordinary reads remain server-rendered DTOs. These tables/functions provide
-- one authoritative decision for every server path and defense-in-depth RLS.

DO $$
BEGIN
  CREATE TYPE public.community_post_audience AS ENUM ('public', 'friends');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_post_audience public.community_post_audience,
  ADD COLUMN IF NOT EXISTS discoverable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_exact_username_lookup boolean NOT NULL DEFAULT true;

UPDATE public.profiles
SET default_post_audience = CASE
  WHEN is_public THEN 'public'::public.community_post_audience
  ELSE 'friends'::public.community_post_audience
END
WHERE default_post_audience IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN default_post_audience SET NOT NULL,
  ALTER COLUMN default_post_audience SET DEFAULT 'friends';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_private_default_audience_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_private_default_audience_check
  CHECK (is_public OR default_post_audience = 'friends') NOT VALID;
ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_private_default_audience_check;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS audience public.community_post_audience;

UPDATE public.community_posts post
SET audience = CASE
  WHEN author.is_public THEN 'public'::public.community_post_audience
  ELSE 'friends'::public.community_post_audience
END
FROM public.profiles author
WHERE author.id = post.author_id
  AND post.audience IS NULL;

ALTER TABLE public.community_posts
  ALTER COLUMN audience SET NOT NULL,
  ALTER COLUMN audience SET DEFAULT 'friends';

CREATE INDEX IF NOT EXISTS community_posts_audience_created_idx
  ON public.community_posts(audience, created_at DESC)
  WHERE status = 'active' AND moderation_status = 'active';

CREATE TABLE IF NOT EXISTS public.friend_relationships (
  profile_low_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_high_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'friends')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_low_id, profile_high_id),
  CHECK (profile_low_id < profile_high_id),
  CHECK (requested_by IN (profile_low_id, profile_high_id)),
  CHECK (
    (status = 'pending' AND responded_at IS NULL)
    OR (status = 'friends' AND responded_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.profile_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.profile_mutes (
  muter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mute_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id),
  CHECK (muter_id <> muted_id)
);

CREATE INDEX IF NOT EXISTS profile_blocks_blocked_idx
  ON public.profile_blocks(blocked_id, blocker_id);
CREATE INDEX IF NOT EXISTS profile_mutes_muted_idx
  ON public.profile_mutes(muted_id, muter_id);
CREATE INDEX IF NOT EXISTS friend_relationships_status_idx
  ON public.friend_relationships(status, profile_low_id, profile_high_id);

ALTER TABLE public.friend_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friend_relationships_select_member ON public.friend_relationships;
CREATE POLICY friend_relationships_select_member
  ON public.friend_relationships FOR SELECT TO authenticated
  USING (public.get_my_profile_id() IN (profile_low_id, profile_high_id));

DROP POLICY IF EXISTS profile_blocks_select_owner ON public.profile_blocks;
CREATE POLICY profile_blocks_select_owner
  ON public.profile_blocks FOR SELECT TO authenticated
  USING (blocker_id = public.get_my_profile_id());

DROP POLICY IF EXISTS profile_mutes_select_owner ON public.profile_mutes;
CREATE POLICY profile_mutes_select_owner
  ON public.profile_mutes FOR SELECT TO authenticated
  USING (muter_id = public.get_my_profile_id());

REVOKE ALL ON public.friend_relationships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.profile_blocks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.profile_mutes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.friend_relationships TO authenticated;
GRANT SELECT ON public.profile_blocks TO authenticated;
GRANT SELECT ON public.profile_mutes TO authenticated;
GRANT ALL ON public.friend_relationships TO service_role;
GRANT ALL ON public.profile_blocks TO service_role;
GRANT ALL ON public.profile_mutes TO service_role;

CREATE OR REPLACE FUNCTION public.social_profiles_are_blocked(
  p_first_id uuid,
  p_second_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_first_id IS NOT NULL
    AND p_second_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profile_blocks block
      WHERE (block.blocker_id = p_first_id AND block.blocked_id = p_second_id)
         OR (block.blocker_id = p_second_id AND block.blocked_id = p_first_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.social_profiles_are_friends(
  p_first_id uuid,
  p_second_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_first_id IS NOT NULL
    AND p_second_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.friend_relationships friendship
      WHERE friendship.profile_low_id = LEAST(p_first_id, p_second_id)
        AND friendship.profile_high_id = GREATEST(p_first_id, p_second_id)
        AND friendship.status = 'friends'
    );
$$;

CREATE OR REPLACE FUNCTION public.social_profile_is_available(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_profile_id
      AND profile.username_state = 'claimed'
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_enforcement_actions action
        WHERE action.profile_id = profile.id
          AND action.action_type IN ('suspension', 'ban')
          AND action.starts_at <= now()
          AND (action.ends_at IS NULL OR action.ends_at > now())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.social_can_view_profile(
  p_viewer_id uuid,
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_viewer_id IS NOT NULL
    AND public.social_profile_is_available(p_viewer_id)
    AND public.social_profile_is_available(p_profile_id)
    AND NOT public.social_profiles_are_blocked(p_viewer_id, p_profile_id);
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
          SELECT 1
          FROM public.profile_mutes mute
          WHERE mute.muter_id = p_viewer_id
            AND mute.muted_id = author.id
        )
      )
      AND (
        author.id = p_viewer_id
        OR (
          post.audience = 'public'
          AND author.is_public
        )
        OR (
          post.audience = 'friends'
          AND public.social_profiles_are_friends(p_viewer_id, author.id)
        )
      )
      AND (
        post.vehicle_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.vehicles vehicle
          WHERE vehicle.id = post.vehicle_id
            AND vehicle.visibility = 'public'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.social_visible_community_post_ids(
  p_viewer_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_vehicle_id uuid DEFAULT NULL
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
    AND public.social_can_view_community_post(p_viewer_id, post.id, false)
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.social_can_current_user_view_community_post(
  p_post_id uuid,
  p_include_muted boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.social_can_view_community_post(
    public.get_my_profile_id(),
    p_post_id,
    p_include_muted
  );
$$;

CREATE OR REPLACE FUNCTION public.social_current_user_is_blocked_with(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.social_profiles_are_blocked(public.get_my_profile_id(), p_profile_id);
$$;

CREATE OR REPLACE FUNCTION public.social_current_user_can_view_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.social_can_view_profile(public.get_my_profile_id(), p_profile_id);
$$;

CREATE OR REPLACE FUNCTION public.set_own_social_privacy(
  p_is_public boolean,
  p_default_post_audience public.community_post_audience,
  p_discoverable boolean DEFAULT true,
  p_allow_exact_username_lookup boolean DEFAULT true
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
  WHERE auth_user_id = auth.uid()
    AND username_state = 'claimed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT p_is_public AND p_default_post_audience <> 'friends' THEN
    RAISE EXCEPTION 'private profiles can only default to friends';
  END IF;

  UPDATE public.profiles
  SET is_public = p_is_public,
      default_post_audience = p_default_post_audience,
      discoverable = p_discoverable,
      allow_exact_username_lookup = p_allow_exact_username_lookup
  WHERE id = v_profile.id
  RETURNING * INTO v_profile;

  IF NOT p_is_public THEN
    UPDATE public.community_posts
    SET audience = 'friends'
    WHERE author_id = v_profile.id
      AND audience = 'public';
  END IF;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_own_profile_block(
  p_target_profile_id uuid,
  p_blocked boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid := public.get_my_profile_id();
BEGIN
  IF v_profile_id IS NULL OR p_target_profile_id IS NULL OR v_profile_id = p_target_profile_id THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_blocked AND NOT public.social_profile_is_available(p_target_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_blocked THEN
    INSERT INTO public.profile_blocks (blocker_id, blocked_id)
    VALUES (v_profile_id, p_target_profile_id)
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

    DELETE FROM public.friend_relationships friendship
    WHERE friendship.profile_low_id = LEAST(v_profile_id, p_target_profile_id)
      AND friendship.profile_high_id = GREATEST(v_profile_id, p_target_profile_id);

    DELETE FROM public.profile_mutes mute
    WHERE mute.muter_id = v_profile_id
      AND mute.muted_id = p_target_profile_id;

    DELETE FROM public.notifications notification
    WHERE notification.type = 'message_received'
      AND notification.user_id IN (v_profile_id, p_target_profile_id)
      AND EXISTS (
        SELECT 1
        FROM public.conversation_participants first_member
        JOIN public.conversation_participants second_member
          ON second_member.conversation_id = first_member.conversation_id
        WHERE first_member.profile_id = v_profile_id
          AND second_member.profile_id = p_target_profile_id
          AND notification.data->>'conversation_id' = first_member.conversation_id::text
      );
  ELSE
    DELETE FROM public.profile_blocks block
    WHERE block.blocker_id = v_profile_id
      AND block.blocked_id = p_target_profile_id;
  END IF;

  RETURN p_blocked;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_own_profile_mute(
  p_target_profile_id uuid,
  p_muted boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid := public.get_my_profile_id();
BEGIN
  IF v_profile_id IS NULL OR p_target_profile_id IS NULL OR v_profile_id = p_target_profile_id THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_muted AND (
    NOT public.social_profile_is_available(p_target_profile_id)
    OR public.social_profiles_are_blocked(v_profile_id, p_target_profile_id)
  ) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_muted THEN
    INSERT INTO public.profile_mutes (muter_id, muted_id)
    VALUES (v_profile_id, p_target_profile_id)
    ON CONFLICT (muter_id, muted_id) DO UPDATE
      SET mute_notifications = EXCLUDED.mute_notifications;
  ELSE
    DELETE FROM public.profile_mutes mute
    WHERE mute.muter_id = v_profile_id
      AND mute.muted_id = p_target_profile_id;
  END IF;

  RETURN p_muted;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_social_privacy_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR public.get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_public IS DISTINCT FROM OLD.is_public
     OR NEW.default_post_audience IS DISTINCT FROM OLD.default_post_audience
     OR NEW.discoverable IS DISTINCT FROM OLD.discoverable
     OR NEW.allow_exact_username_lookup IS DISTINCT FROM OLD.allow_exact_username_lookup THEN
    RAISE EXCEPTION 'use set_own_social_privacy()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_social_privacy_change ON public.profiles;
CREATE TRIGGER profiles_guard_social_privacy_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_social_privacy_change();

-- Existing clients cannot create public posts for a private profile even if
-- they reach a stale server instance during rollout.
CREATE OR REPLACE FUNCTION public.guard_community_post_audience()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.audience = 'public' AND NOT EXISTS (
    SELECT 1 FROM public.profiles author
    WHERE author.id = NEW.author_id AND author.is_public
  ) THEN
    RAISE EXCEPTION 'private profiles cannot publish public posts';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_guard_audience ON public.community_posts;
CREATE TRIGGER community_posts_guard_audience
  BEFORE INSERT OR UPDATE OF audience, author_id ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_post_audience();

REVOKE ALL ON FUNCTION public.social_profiles_are_blocked(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_profiles_are_friends(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_profile_is_available(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_can_view_profile(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_can_view_community_post(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_visible_community_post_ids(uuid, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_can_current_user_view_community_post(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_current_user_is_blocked_with(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_current_user_can_view_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_own_social_privacy(boolean, public.community_post_audience, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_own_profile_block(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_own_profile_mute(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.social_profiles_are_blocked(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_profiles_are_friends(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_profile_is_available(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_can_view_profile(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_can_view_community_post(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_visible_community_post_ids(uuid, integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_can_current_user_view_community_post(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_current_user_is_blocked_with(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.social_current_user_can_view_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_own_social_privacy(boolean, public.community_post_audience, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_own_profile_block(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_own_profile_mute(uuid, boolean) TO authenticated;

-- Messaging is server-mediated. A block immediately makes an ordinary direct
-- conversation unreadable/unwritable to both participants without deleting
-- evidence or transaction history.
CREATE OR REPLACE FUNCTION public.am_i_in_conversation(conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants mine
    WHERE mine.conversation_id = conv_id
      AND mine.profile_id = public.get_my_profile_id()
      AND NOT EXISTS (
        SELECT 1
        FROM public.conversation_participants other
        WHERE other.conversation_id = conv_id
          AND other.profile_id <> mine.profile_id
          AND public.social_profiles_are_blocked(mine.profile_id, other.profile_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.am_i_in_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_i_in_conversation(uuid) TO authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE ON public.conversations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_participants FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.messages FROM authenticated;

-- Replace broad active-read policies with authenticated, viewer-aware rules.
-- Raw table SELECT remains revoked by the prior migration; these policies are
-- defense in depth for future grants and database-internal joins.
DROP POLICY IF EXISTS community_posts_select_active ON public.community_posts;
CREATE POLICY community_posts_select_active
  ON public.community_posts FOR SELECT TO authenticated
  USING (public.social_can_current_user_view_community_post(id, false));

DROP POLICY IF EXISTS community_comments_select_active ON public.community_comments;
CREATE POLICY community_comments_select_active
  ON public.community_comments FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND moderation_status = 'active'
    AND public.social_can_current_user_view_community_post(post_id, false)
    AND NOT public.social_current_user_is_blocked_with(author_id)
  );

DROP POLICY IF EXISTS community_post_media_select_visible ON public.community_post_media;
CREATE POLICY community_post_media_select_visible
  ON public.community_post_media FOR SELECT TO authenticated
  USING (
    public.social_can_current_user_view_community_post(post_id, false)
    OR uploader_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
CREATE POLICY profiles_select_public
  ON public.profiles FOR SELECT TO authenticated
  USING (
    is_public
    AND username_state = 'claimed'
    AND public.social_current_user_can_view_profile(id)
  );

DROP POLICY IF EXISTS vehicles_select_public ON public.vehicles;
CREATE POLICY vehicles_select_public
  ON public.vehicles FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    AND owner_id IS NOT NULL
    AND public.social_current_user_can_view_profile(owner_id)
  );

DROP POLICY IF EXISTS listings_select_active ON public.marketplace_listings;
CREATE POLICY listings_select_active
  ON public.marketplace_listings FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND public.social_current_user_can_view_profile(seller_id)
    AND EXISTS (
      SELECT 1 FROM public.vehicles vehicle
      WHERE vehicle.id = marketplace_listings.vehicle_id
        AND vehicle.visibility = 'public'
    )
  );

DROP POLICY IF EXISTS tech_profiles_select_public ON public.technician_profiles;
CREATE POLICY tech_profiles_select_public
  ON public.technician_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.id = technician_profiles.profile_id
        AND profile.is_public
        AND profile.discoverable
        AND profile.username_state = 'claimed'
        AND public.social_current_user_can_view_profile(profile.id)
    )
  );
