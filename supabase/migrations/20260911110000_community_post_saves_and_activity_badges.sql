BEGIN;

-- One-tap private Save/Unsave (plan Phase 1B, sections 7.4 and 27) and the
-- activity counts behind navigation badges (plan 7.1 / 22.2).
--
-- Saves are private: nobody else can see what a member saved, and saving
-- never notifies the author. A save row survives the post being hidden or
-- restored; the listing simply re-applies the canonical visibility policy,
-- so a removed post drops out of the saved list without leaking why.

CREATE TABLE public.community_post_saves (
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, profile_id)
);

CREATE INDEX community_post_saves_profile_idx
  ON public.community_post_saves(profile_id, created_at DESC, post_id DESC);

ALTER TABLE public.community_post_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_post_saves FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_post_saves TO service_role;

CREATE FUNCTION public.set_community_post_save(
  p_actor_profile_id uuid,
  p_post_id uuid,
  p_saved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_actor_profile_id IS NULL OR p_post_id IS NULL THEN
    RAISE EXCEPTION 'post unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_saved THEN
    -- Saving requires the post to be visible to the actor right now; the
    -- visibility function already covers account state, blocks, audience,
    -- moderation, and the vehicle attachment.
    IF NOT public.social_can_view_community_post(p_actor_profile_id, p_post_id, true) THEN
      RAISE EXCEPTION 'post unavailable' USING ERRCODE = 'insufficient_privilege';
    END IF;
    INSERT INTO public.community_post_saves (post_id, profile_id)
    VALUES (p_post_id, p_actor_profile_id)
    ON CONFLICT (post_id, profile_id) DO NOTHING;
  ELSE
    -- Unsaving is always allowed so a member can clear a post they can no
    -- longer see.
    DELETE FROM public.community_post_saves
    WHERE post_id = p_post_id AND profile_id = p_actor_profile_id;
  END IF;

  RETURN jsonb_build_object('postId', p_post_id, 'saved', p_saved);
END;
$$;

CREATE FUNCTION public.community_post_save_states(
  p_viewer_id uuid,
  p_post_ids uuid[]
)
RETURNS TABLE(post_id uuid, saved boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT requested.id,
         EXISTS (
           SELECT 1 FROM public.community_post_saves save
           WHERE save.post_id = requested.id AND save.profile_id = p_viewer_id
         )
  FROM (SELECT DISTINCT unnest(COALESCE(p_post_ids, ARRAY[]::uuid[])) AS id) requested;
$$;

-- Saved posts in save order, already reduced to what the viewer may see.
CREATE FUNCTION public.list_saved_community_post_ids(
  p_viewer_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(post_id uuid, saved_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT save.post_id, save.created_at
  FROM public.community_post_saves save
  WHERE save.profile_id = p_viewer_id
    AND public.social_can_view_community_post(p_viewer_id, save.post_id, true)
  ORDER BY save.created_at DESC, save.post_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Counts for navigation badges. Each count only includes items the member
-- can act on: notifications addressed to them, requests from members who are
-- still available to them, and unread messages from others in their threads.
CREATE FUNCTION public.member_activity_badges(p_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'unreadNotifications', (
      SELECT count(*) FROM public.notifications notification
      WHERE notification.user_id = p_profile_id AND notification.read_at IS NULL
    ),
    'pendingFriendRequests', (
      SELECT count(*)
      FROM public.friend_relationships rel
      WHERE rel.status = 'pending'
        AND p_profile_id IN (rel.profile_low_id, rel.profile_high_id)
        AND rel.requested_by <> p_profile_id
        AND public.social_can_view_profile(p_profile_id, rel.requested_by)
    ),
    'unreadMessages', (
      SELECT count(*)
      FROM public.messages message
      JOIN public.conversation_participants participant
        ON participant.conversation_id = message.conversation_id
       AND participant.profile_id = p_profile_id
      WHERE message.status = 'unread'
        AND message.sender_id <> p_profile_id
    )
  );
$$;

REVOKE ALL ON FUNCTION public.set_community_post_save(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_post_save_states(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_saved_community_post_ids(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_activity_badges(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_post_save(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_post_save_states(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_saved_community_post_ids(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.member_activity_badges(uuid) TO service_role;

COMMENT ON TABLE public.community_post_saves IS
  'Private per-member bookmarks. Never exposed to other members or authors.';

COMMIT;
