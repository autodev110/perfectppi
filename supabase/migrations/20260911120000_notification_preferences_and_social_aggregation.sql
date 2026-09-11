-- Notification categories, per-category preferences, and social activity
-- aggregation (plan 22.1 / 22.2).
--
-- * Every notification type maps to one category. Members can switch
--   in-app and push delivery per category, except safety and account
--   notices, which cannot be fully disabled.
-- * In-app preferences are enforced where the row is created: a BEFORE
--   INSERT trigger on notifications drops a disabled notice, so every
--   producer (RPCs, triggers, workers) obeys the same switch.
-- * Comments and likes on a member's post become one notice per post per
--   day ("8 people liked your post"), updated in place while it is unread.

-- New enum values must commit before a function body evaluates them.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'post_comment';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'post_likes';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Categories
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.notification_category(p_type public.notification_type)
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
    WHEN 'answer_accepted' THEN 'social'
    WHEN 'accepted_answer_unavailable' THEN 'social'
    WHEN 'message_received' THEN 'messages'
    WHEN 'listing_inspection_requested' THEN 'marketplace'
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

-- Categories a member may switch off. Safety and account notices always
-- deliver (plan 22.1).
CREATE FUNCTION public.notification_category_optional(p_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_category IN ('social', 'messages', 'marketplace', 'inspections');
$$;

CREATE TABLE public.notification_preferences (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('social', 'messages', 'marketplace', 'inspections', 'safety', 'account')),
  in_app boolean NOT NULL DEFAULT true,
  push boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, category),
  -- The locked categories can exist as rows (for auditing) but never off.
  CHECK (public.notification_category_optional(category) OR (in_app AND push))
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO service_role;

-- Missing row = enabled. Locked categories are always enabled.
CREATE FUNCTION public.notification_allowed(
  p_profile_id uuid,
  p_type public.notification_type,
  p_channel text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT public.notification_category_optional(public.notification_category(p_type)) THEN true
    ELSE COALESCE((
      SELECT CASE p_channel WHEN 'push' THEN pref.push ELSE pref.in_app END
      FROM public.notification_preferences pref
      WHERE pref.profile_id = p_profile_id
        AND pref.category = public.notification_category(p_type)
    ), true)
  END;
$$;

CREATE FUNCTION public.set_notification_preference(
  p_actor_profile_id uuid,
  p_category text,
  p_in_app boolean,
  p_push boolean
)
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.notification_preferences%ROWTYPE;
BEGIN
  IF p_actor_profile_id IS NULL OR NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.notification_category_optional(p_category) THEN
    RAISE EXCEPTION 'this notification category cannot be changed' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.notification_preferences (profile_id, category, in_app, push)
  VALUES (p_actor_profile_id, p_category, p_in_app, p_push)
  ON CONFLICT (profile_id, category) DO UPDATE
    SET in_app = EXCLUDED.in_app, push = EXCLUDED.push, updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Effective preferences for every category, defaults filled in.
CREATE FUNCTION public.list_notification_preferences(p_actor_profile_id uuid)
RETURNS TABLE(category text, in_app boolean, push boolean, locked boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT cat.category,
         COALESCE(pref.in_app, true),
         COALESCE(pref.push, true),
         NOT public.notification_category_optional(cat.category)
  FROM unnest(ARRAY['social', 'messages', 'marketplace', 'inspections', 'safety', 'account']) AS cat(category)
  LEFT JOIN public.notification_preferences pref
    ON pref.profile_id = p_actor_profile_id AND pref.category = cat.category
  ORDER BY array_position(ARRAY['social', 'messages', 'marketplace', 'inspections', 'safety', 'account'], cat.category);
$$;

-- Enforcement point for in-app delivery: a disabled optional category
-- simply never gets a row. Producers need no knowledge of preferences.
CREATE FUNCTION public.apply_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT public.notification_allowed(NEW.user_id, NEW.type, 'in_app') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notifications_apply_preferences
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.apply_notification_preferences();

-- ---------------------------------------------------------------------------
-- 2. Aggregated social activity on a member's post (plan 22.1 / 22.2:
--    group repeated activity by post and day). One unread notice per post
--    per UTC day is updated in place; once read, fresh activity starts a
--    new notice. Previews carry the actor's public handle only.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.notification_actor_label(p_actor_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(profile.display_name, ''), '@' || profile.username, 'A member')
  FROM public.profiles profile WHERE profile.id = p_actor_id;
$$;

CREATE FUNCTION public.upsert_post_activity_notification(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_post_id uuid,
  p_type public.notification_type,
  p_comment_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_existing public.notifications%ROWTYPE;
  v_count integer;
  v_actor text := public.notification_actor_label(p_actor_id);
  v_others integer;
  v_noun text := CASE p_type WHEN 'post_likes' THEN 'liked' ELSE 'commented on' END;
BEGIN
  IF p_recipient_id IS NULL OR p_recipient_id = p_actor_id THEN RETURN; END IF;
  -- A muted member's activity stays silent for the muter (plan 11).
  IF EXISTS (
    SELECT 1 FROM public.profile_mutes
    WHERE muter_id = p_recipient_id AND muted_id = p_actor_id AND mute_notifications
  ) THEN RETURN; END IF;
  IF public.social_profiles_are_blocked(p_recipient_id, p_actor_id) THEN RETURN; END IF;

  SELECT * INTO v_existing
  FROM public.notifications
  WHERE user_id = p_recipient_id
    AND type = p_type
    AND read_at IS NULL
    AND data->>'post_id' = p_post_id::text
    AND (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Count distinct actors so the same person is not counted twice.
    v_count := COALESCE(jsonb_array_length(v_existing.data->'actor_ids'), 0);
    IF NOT (v_existing.data->'actor_ids' ? p_actor_id::text) THEN
      v_count := v_count + 1;
    END IF;
    v_others := v_count - 1;
    UPDATE public.notifications
    SET body = CASE
          WHEN v_others <= 0 THEN v_actor || ' ' || v_noun || ' your post'
          WHEN v_others = 1 THEN v_actor || ' and 1 other ' || v_noun || ' your post'
          ELSE v_actor || ' and ' || v_others || ' others ' || v_noun || ' your post'
        END,
        title = CASE p_type
          WHEN 'post_likes' THEN v_count || ' like' || CASE WHEN v_count = 1 THEN '' ELSE 's' END || ' on your post'
          ELSE v_count || ' comment' || CASE WHEN v_count = 1 THEN '' ELSE 's' END || ' on your post'
        END,
        data = v_existing.data
          || jsonb_build_object('count', v_count, 'latest_actor_id', p_actor_id, 'comment_id', p_comment_id)
          || CASE WHEN v_existing.data->'actor_ids' ? p_actor_id::text
               THEN '{}'::jsonb
               ELSE jsonb_build_object('actor_ids', (v_existing.data->'actor_ids') || to_jsonb(p_actor_id::text))
             END,
        created_at = now()
    WHERE id = v_existing.id;
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_recipient_id,
    p_type,
    CASE p_type WHEN 'post_likes' THEN 'New like on your post' ELSE 'New comment on your post' END,
    v_actor || ' ' || v_noun || ' your post',
    jsonb_build_object(
      'post_id', p_post_id,
      'comment_id', p_comment_id,
      'count', 1,
      'latest_actor_id', p_actor_id,
      'actor_ids', jsonb_build_array(p_actor_id::text)
    )
  );
END;
$$;

CREATE FUNCTION public.notify_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author uuid;
BEGIN
  -- Fire once: when an active comment is inserted, or when a scanned
  -- comment becomes active.
  IF NEW.status <> 'active' OR NEW.moderation_status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.moderation_status = 'active' THEN RETURN NEW; END IF;

  SELECT post.author_id INTO v_author
  FROM public.community_posts post
  WHERE post.id = NEW.post_id AND post.status = 'active' AND post.moderation_status = 'active';
  IF v_author IS NULL THEN RETURN NEW; END IF;

  PERFORM public.upsert_post_activity_notification(v_author, NEW.author_id, NEW.post_id, 'post_comment', NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_comments_notify_author
  AFTER INSERT OR UPDATE OF status, moderation_status ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_comment();

CREATE FUNCTION public.notify_post_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_author uuid;
BEGIN
  SELECT post.author_id INTO v_author
  FROM public.community_posts post
  WHERE post.id = NEW.post_id AND post.status = 'active' AND post.moderation_status = 'active';
  IF v_author IS NULL THEN RETURN NEW; END IF;
  PERFORM public.upsert_post_activity_notification(v_author, NEW.profile_id, NEW.post_id, 'post_likes');
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_post_likes_notify_author
  AFTER INSERT ON public.community_post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_like();

-- Mark every unread notice read in one call (plan 22.2 "Mark All as Read").
CREATE FUNCTION public.mark_all_notifications_read(p_actor_profile_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE user_id = p_actor_profile_id AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_allowed(uuid, public.notification_type, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_notification_preference(uuid, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_notification_preferences(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_post_activity_notification(uuid, uuid, uuid, public.notification_type, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_actor_label(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_post_comment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_post_like() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_notification_preferences() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_allowed(uuid, public.notification_type, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_notification_preference(uuid, text, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_notification_preferences(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(uuid) TO service_role;

COMMIT;
