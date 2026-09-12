-- Post-event photos reuse moderated Community post/media infrastructure.
-- The association itself is service-only so event eligibility cannot be
-- bypassed by a direct Data API request.
BEGIN;

CREATE TABLE public.community_event_photo_posts (
  event_id uuid NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  post_id uuid NOT NULL UNIQUE REFERENCES public.community_posts(id) ON DELETE CASCADE,
  contributor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, post_id)
);

CREATE INDEX community_event_photo_posts_event_idx
  ON public.community_event_photo_posts(event_id, created_at DESC, post_id DESC);
CREATE INDEX community_event_photo_posts_contributor_idx
  ON public.community_event_photo_posts(contributor_id, created_at DESC);

ALTER TABLE public.community_event_photo_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_event_photo_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_event_photo_posts TO service_role;

CREATE FUNCTION public.can_contribute_community_event_photos(
  p_viewer_id uuid,
  p_event_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_events event
    WHERE event.id = p_event_id
      AND event.status IN ('scheduled', 'completed')
      AND event.starts_at <= now()
      AND now() <= event.ends_at + interval '90 days'
      AND public.social_can_view_community_event(p_viewer_id, event.id, false)
      AND (
        event.group_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.community_groups community_group
          JOIN public.community_group_memberships membership ON membership.group_id = community_group.id
          WHERE community_group.id = event.group_id
            AND community_group.status = 'active'
            AND membership.profile_id = p_viewer_id
            AND membership.status = 'active'
            AND (
              community_group.posting_policy = 'members'
              OR membership.role IN ('owner', 'admin', 'moderator')
            )
        )
      )
      AND (
        event.organizer_id = p_viewer_id
        OR EXISTS (
          SELECT 1
          FROM public.community_event_rsvps rsvp
          WHERE rsvp.event_id = event.id
            AND rsvp.profile_id = p_viewer_id
            AND rsvp.status = 'going'
        )
      )
  );
$$;

-- Event membership is an additional narrow audience for linked photo posts.
-- All normal profile, block, mute, moderation, group and vehicle checks remain.
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
            OR EXISTS (
              SELECT 1
              FROM public.community_event_photo_posts event_photo
              WHERE event_photo.post_id = post.id
                AND public.social_can_view_community_event(p_viewer_id, event_photo.event_id, true)
            )
          )
        )
        OR (
          post.group_id IS NOT NULL
          AND post.group_status = 'active'
          AND public.community_group_content_visible(p_viewer_id, post.group_id)
        )
      )
      AND (
        post.vehicle_id IS NULL
        OR private.social_can_view_vehicle(p_viewer_id, post.vehicle_id)
      )
  );
$$;

CREATE FUNCTION public.attach_community_event_photo_post(
  p_actor_profile_id uuid,
  p_event_id uuid,
  p_post_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.community_events%ROWTYPE;
BEGIN
  IF NOT public.can_contribute_community_event_photos(p_actor_profile_id, p_event_id) THEN
    RAISE EXCEPTION 'event_photo_contribution_unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_event
  FROM public.community_events event
  WHERE event.id = p_event_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.community_posts post
    JOIN public.community_post_assemblies assembly ON assembly.post_id = post.id
    WHERE post.id = p_post_id
      AND post.author_id = p_actor_profile_id
      AND post.group_id IS NOT DISTINCT FROM v_event.group_id
      AND post.post_type = 'general'
      AND post.status = 'hidden'
      AND post.moderation_status NOT IN ('rejected', 'legal_hold')
      AND assembly.owner_id = p_actor_profile_id
      AND assembly.expected_media_count BETWEEN 1 AND 10
      AND assembly.state IN ('assembling', 'submitted')
  ) THEN
    RAISE EXCEPTION 'event_photo_post_invalid' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.community_post_media media
    WHERE media.post_id = p_post_id AND media.media_type <> 'image'
  ) THEN
    RAISE EXCEPTION 'event_photo_images_only' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.community_event_photo_posts(event_id, post_id, contributor_id)
  VALUES (p_event_id, p_post_id, p_actor_profile_id)
  ON CONFLICT (post_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_event_photo_posts link
    WHERE link.event_id = p_event_id
      AND link.post_id = p_post_id
      AND link.contributor_id = p_actor_profile_id
  ) THEN
    RAISE EXCEPTION 'event_photo_post_conflict' USING ERRCODE = 'unique_violation';
  END IF;

  RETURN true;
END;
$$;

CREATE FUNCTION public.list_community_event_photo_post_ids(
  p_viewer_id uuid,
  p_event_id uuid
)
RETURNS TABLE(post_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT link.post_id
  FROM public.community_event_photo_posts link
  WHERE link.event_id = p_event_id
    AND public.social_can_view_community_event(p_viewer_id, p_event_id, true)
    AND public.social_can_view_community_post(p_viewer_id, link.post_id, false)
    AND EXISTS (
      SELECT 1 FROM public.community_post_media media
      WHERE media.post_id = link.post_id
        AND media.media_type = 'image'
        AND media.moderation_status = 'active'
    )
  ORDER BY link.created_at DESC, link.post_id DESC;
$$;

CREATE FUNCTION public.enforce_community_event_photo_images_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link public.community_event_photo_posts%ROWTYPE;
BEGIN
  SELECT * INTO v_link
  FROM public.community_event_photo_posts link
  WHERE link.post_id = NEW.post_id;

  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.media_type <> 'image' THEN
    RAISE EXCEPTION 'event_photo_images_only' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.uploader_id <> v_link.contributor_id THEN
    RAISE EXCEPTION 'event_photo_uploader_mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' AND NOT public.can_contribute_community_event_photos(NEW.uploader_id, v_link.event_id) THEN
    RAISE EXCEPTION 'event_photo_contribution_unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_post_media_event_images_only
  BEFORE INSERT OR UPDATE OF media_type, post_id ON public.community_post_media
  FOR EACH ROW EXECUTE FUNCTION public.enforce_community_event_photo_images_only();

REVOKE ALL ON FUNCTION public.can_contribute_community_event_photos(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_community_event_photo_post(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_community_event_photo_post_ids(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_community_event_photo_images_only() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.can_contribute_community_event_photos(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_community_event_photo_post(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_community_event_photo_post_ids(uuid, uuid) TO service_role;

COMMENT ON TABLE public.community_event_photo_posts IS
  'Links post-event photo submissions to events while media remains in the standard moderated Community pipeline.';

COMMIT;
