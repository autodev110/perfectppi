-- Phase 1C: privacy-aware Community mentions (plan sections 9.3, 11, 12,
-- 22.1, and 31.3). The notification enum value is committed by the preceding
-- migration before this migration uses it in function bodies.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN mention_policy text NOT NULL DEFAULT 'friends_and_groups'
    CHECK (mention_policy IN ('everyone', 'friends_and_groups', 'friends', 'nobody'));

CREATE TABLE public.community_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentioned_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rendered_username text NOT NULL CHECK (rendered_username ~ '^[A-Za-z0-9_]{4,16}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL)::integer + (comment_id IS NOT NULL)::integer = 1),
  CHECK (author_id <> mentioned_profile_id)
);

CREATE UNIQUE INDEX community_mentions_post_profile_unique_idx
  ON public.community_mentions(post_id, mentioned_profile_id)
  WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX community_mentions_comment_profile_unique_idx
  ON public.community_mentions(comment_id, mentioned_profile_id)
  WHERE comment_id IS NOT NULL;
CREATE INDEX community_mentions_profile_created_idx
  ON public.community_mentions(mentioned_profile_id, created_at DESC);
CREATE INDEX community_mentions_author_rate_idx
  ON public.community_mentions(author_id, created_at DESC);

ALTER TABLE public.community_mentions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_mentions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_mentions TO service_role;

-- Keep profile privacy in one authenticated RPC so a direct profile update
-- cannot bypass mention policy or the existing audience/message controls.
DROP FUNCTION IF EXISTS public.set_own_social_privacy(
  boolean,
  public.community_post_audience,
  boolean,
  boolean,
  text,
  boolean,
  boolean
);

CREATE FUNCTION public.set_own_social_privacy(
  p_is_public boolean,
  p_default_post_audience public.community_post_audience,
  p_discoverable boolean DEFAULT true,
  p_allow_exact_username_lookup boolean DEFAULT true,
  p_friend_request_policy text DEFAULT NULL,
  p_allow_friend_messages boolean DEFAULT NULL,
  p_allow_group_message_requests boolean DEFAULT NULL,
  p_mention_policy text DEFAULT NULL
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
  IF p_mention_policy IS NOT NULL
     AND p_mention_policy NOT IN ('everyone', 'friends_and_groups', 'friends', 'nobody') THEN
    RAISE EXCEPTION 'invalid mention policy' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.profiles
  SET is_public = p_is_public,
      default_post_audience = p_default_post_audience,
      discoverable = p_discoverable,
      allow_exact_username_lookup = p_allow_exact_username_lookup,
      friend_request_policy = COALESCE(p_friend_request_policy, friend_request_policy),
      allow_friend_messages = COALESCE(p_allow_friend_messages, allow_friend_messages),
      allow_group_message_requests = COALESCE(p_allow_group_message_requests, allow_group_message_requests),
      mention_policy = COALESCE(p_mention_policy, mention_policy)
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

REVOKE ALL ON FUNCTION public.set_own_social_privacy(
  boolean,
  public.community_post_audience,
  boolean,
  boolean,
  text,
  boolean,
  boolean,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_social_privacy(
  boolean,
  public.community_post_audience,
  boolean,
  boolean,
  text,
  boolean,
  boolean,
  text
) TO authenticated, service_role;

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
     OR NEW.allow_exact_username_lookup IS DISTINCT FROM OLD.allow_exact_username_lookup
     OR NEW.friend_request_policy IS DISTINCT FROM OLD.friend_request_policy
     OR NEW.allow_friend_messages IS DISTINCT FROM OLD.allow_friend_messages
     OR NEW.allow_group_message_requests IS DISTINCT FROM OLD.allow_group_message_requests
     OR NEW.mention_policy IS DISTINCT FROM OLD.mention_policy THEN
    RAISE EXCEPTION 'use set_own_social_privacy()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_category(p_type public.notification_type)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_type::text
    WHEN 'friend_request' THEN 'social'
    WHEN 'friend_request_accepted' THEN 'social'
    WHEN 'post_comment' THEN 'social'
    WHEN 'post_likes' THEN 'social'
    WHEN 'post_mention' THEN 'social'
    WHEN 'answer_accepted' THEN 'social'
    WHEN 'accepted_answer_unavailable' THEN 'social'
    WHEN 'group_post_removed' THEN 'groups'
    WHEN 'group_role_changed' THEN 'groups'
    WHEN 'group_invitation' THEN 'groups'
    WHEN 'group_join_request' THEN 'groups'
    WHEN 'group_join_decision' THEN 'groups'
    WHEN 'message_received' THEN 'messages'
    WHEN 'listing_inspection_requested' THEN 'marketplace'
    WHEN 'saved_listing_updated' THEN 'marketplace'
    WHEN 'tech_request_new' THEN 'inspections'
    WHEN 'tech_request_accepted' THEN 'inspections'
    WHEN 'inspection_submitted' THEN 'inspections'
    WHEN 'inspection_updated' THEN 'inspections'
    WHEN 'warranty_available' THEN 'inspections'
    WHEN 'payment_completed' THEN 'account'
    WHEN 'moderation_decision' THEN 'safety'
    WHEN 'moderation_case' THEN 'safety'
    WHEN 'report_received' THEN 'safety'
    ELSE 'account'
  END;
$$;

CREATE FUNCTION public.sync_community_mentions(
  p_post_id uuid,
  p_comment_id uuid,
  p_author_id uuid,
  p_content text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_match text[];
  v_target public.profiles%ROWTYPE;
  v_target_ids uuid[] := ARRAY[]::uuid[];
  v_rendered_usernames text[] := ARRAY[]::text[];
  v_new_count integer := 0;
  v_recent_count integer := 0;
  v_index integer;
  v_mention_id uuid;
BEGIN
  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'invalid mention destination' USING ERRCODE = 'check_violation';
  END IF;

  SELECT post.group_id INTO v_group_id
  FROM public.community_posts post
  WHERE post.id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mention destination unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serialize each author's mention budget so simultaneous posts cannot
  -- exceed the anti-spam ceiling.
  PERFORM pg_advisory_xact_lock(hashtextextended('community-mentions:' || p_author_id::text, 0));

  FOR v_match IN
    SELECT matched.captures
    FROM regexp_matches(
      p_content,
      '(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{4,16})(?![A-Za-z0-9_])',
      'g'
    ) AS matched(captures)
  LOOP
    SELECT * INTO v_target
    FROM public.profiles profile
    WHERE profile.username_normalized = lower(v_match[2])
      AND profile.username_state = 'claimed'
      AND profile.id <> p_author_id;

    IF NOT FOUND OR v_target.id = ANY(v_target_ids) THEN
      CONTINUE;
    END IF;
    IF NOT public.social_profile_is_available(v_target.id)
       OR public.social_profiles_are_blocked(p_author_id, v_target.id)
       OR NOT public.social_can_view_community_post(v_target.id, p_post_id, false)
       OR EXISTS (
         SELECT 1 FROM public.profile_mutes mute
         WHERE mute.muter_id = v_target.id
           AND mute.muted_id = p_author_id
           AND mute.mute_notifications
       ) THEN
      CONTINUE;
    END IF;
    IF v_target.mention_policy = 'nobody'
       OR (
         v_target.mention_policy = 'friends'
         AND NOT public.social_profiles_are_friends(p_author_id, v_target.id)
       )
       OR (
         v_target.mention_policy = 'friends_and_groups'
         AND NOT public.social_profiles_are_friends(p_author_id, v_target.id)
         AND NOT EXISTS (
           SELECT 1
           FROM public.community_group_memberships author_membership
           JOIN public.community_group_memberships target_membership
             ON target_membership.group_id = author_membership.group_id
            AND target_membership.profile_id = v_target.id
            AND target_membership.status = 'active'
           JOIN public.community_groups community_group
             ON community_group.id = author_membership.group_id
            AND community_group.status = 'active'
           WHERE author_membership.profile_id = p_author_id
             AND author_membership.status = 'active'
             AND (v_group_id IS NULL OR author_membership.group_id = v_group_id)
         )
       ) THEN
      CONTINUE;
    END IF;

    v_target_ids := array_append(v_target_ids, v_target.id);
    v_rendered_usernames := array_append(v_rendered_usernames, v_match[2]);
  END LOOP;

  IF cardinality(v_target_ids) > 10 THEN
    RAISE EXCEPTION 'posts and comments can mention up to 10 people'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_new_count
  FROM unnest(v_target_ids) candidate(profile_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.community_mentions mention
    WHERE mention.mentioned_profile_id = candidate.profile_id
      AND (
        (p_comment_id IS NULL AND mention.post_id = p_post_id)
        OR (p_comment_id IS NOT NULL AND mention.comment_id = p_comment_id)
      )
  );
  SELECT count(*) INTO v_recent_count
  FROM public.community_mentions mention
  WHERE mention.author_id = p_author_id
    AND mention.created_at >= now() - interval '1 hour';
  IF v_recent_count + v_new_count > 30 THEN
    RAISE EXCEPTION 'mention rate limit exceeded' USING ERRCODE = 'program_limit_exceeded';
  END IF;

  DELETE FROM public.community_mentions mention
  WHERE (
      (p_comment_id IS NULL AND mention.post_id = p_post_id)
      OR (p_comment_id IS NOT NULL AND mention.comment_id = p_comment_id)
    )
    AND NOT (mention.mentioned_profile_id = ANY(v_target_ids));

  IF cardinality(v_target_ids) = 0 THEN
    RETURN;
  END IF;

  FOR v_index IN 1..cardinality(v_target_ids) LOOP
    v_mention_id := NULL;
    INSERT INTO public.community_mentions (
      post_id,
      comment_id,
      author_id,
      mentioned_profile_id,
      rendered_username
    ) VALUES (
      CASE WHEN p_comment_id IS NULL THEN p_post_id ELSE NULL END,
      p_comment_id,
      p_author_id,
      v_target_ids[v_index],
      v_rendered_usernames[v_index]
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_mention_id;

    IF v_mention_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_target_ids[v_index],
        'post_mention',
        public.notification_actor_label(p_author_id) || ' mentioned you',
        CASE WHEN p_comment_id IS NULL
          THEN 'Open PerfectPPI to view the post.'
          ELSE 'Open PerfectPPI to view the comment.'
        END,
        jsonb_strip_nulls(jsonb_build_object(
          'post_id', p_post_id,
          'comment_id', p_comment_id,
          'mention_id', v_mention_id,
          'actor_id', p_author_id
        ))
      );
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.sync_community_post_mentions_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.moderation_status = 'active' THEN
    PERFORM public.sync_community_mentions(NEW.id, NULL, NEW.author_id, NEW.content);
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.sync_community_comment_mentions_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.moderation_status = 'active' THEN
    PERFORM public.sync_community_mentions(NEW.post_id, NEW.id, NEW.author_id, NEW.content);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_posts_sync_mentions
  AFTER INSERT OR UPDATE OF content, status, moderation_status
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.sync_community_post_mentions_trigger();

CREATE TRIGGER community_comments_sync_mentions
  AFTER INSERT OR UPDATE OF content, status, moderation_status
  ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_community_comment_mentions_trigger();

-- Blocking is immediate in both directions: historical text remains plain,
-- while resolved links and unread mention notices between the pair disappear.
CREATE FUNCTION public.cleanup_mentions_on_profile_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.notifications notification
  WHERE notification.type = 'post_mention'
    AND (
      (notification.user_id = NEW.blocker_id
       AND notification.data->>'actor_id' = NEW.blocked_id::text)
      OR
      (notification.user_id = NEW.blocked_id
       AND notification.data->>'actor_id' = NEW.blocker_id::text)
    );

  DELETE FROM public.community_mentions mention
  WHERE (mention.author_id = NEW.blocker_id AND mention.mentioned_profile_id = NEW.blocked_id)
     OR (mention.author_id = NEW.blocked_id AND mention.mentioned_profile_id = NEW.blocker_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_blocks_cleanup_mentions
  AFTER INSERT ON public.profile_blocks
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_mentions_on_profile_block();

REVOKE ALL ON FUNCTION public.sync_community_mentions(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_community_post_mentions_trigger()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_community_comment_mentions_trigger()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_mentions_on_profile_block()
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.community_mentions IS
  'Resolved Community mentions. Account IDs remain authoritative when a corrected username changes.';
COMMENT ON COLUMN public.profiles.mention_policy IS
  'Who may create a linked/notification-generating Community mention: everyone, friends and active group peers, friends, or nobody.';

COMMIT;
