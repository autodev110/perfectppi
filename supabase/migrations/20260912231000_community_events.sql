-- Phase 3 free events/meets. Paid events, ticketing, escrow and live attendee
-- location are intentionally excluded until their separate policy review.
BEGIN;

CREATE TYPE public.community_event_type AS ENUM (
  'car_meet', 'track_day', 'car_show', 'shop_event', 'group_drive'
);
CREATE TYPE public.community_event_status AS ENUM (
  'scheduled', 'cancelled', 'completed', 'removed'
);
CREATE TYPE public.community_event_rsvp_status AS ENUM (
  'going', 'interested', 'not_going'
);

CREATE TABLE public.community_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  announcement_post_id uuid NOT NULL UNIQUE REFERENCES public.community_posts(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.community_groups(id) ON DELETE SET NULL,
  event_type public.community_event_type NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  general_location text NOT NULL CHECK (char_length(btrim(general_location)) BETWEEN 2 AND 120),
  exact_location text NOT NULL CHECK (char_length(btrim(exact_location)) BETWEEN 2 AND 500),
  capacity integer CHECK (capacity IS NULL OR capacity BETWEEN 2 AND 1000),
  requirements text CHECK (requirements IS NULL OR char_length(btrim(requirements)) BETWEEN 1 AND 1000),
  cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents = 0),
  status public.community_event_status NOT NULL DEFAULT 'scheduled',
  cancellation_reason text CHECK (cancellation_reason IS NULL OR char_length(btrim(cancellation_reason)) BETWEEN 3 AND 500),
  client_request_id uuid NOT NULL,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  CHECK (ends_at - starts_at <= interval '7 days'),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  UNIQUE (organizer_id, client_request_id)
);

CREATE TABLE public.community_event_rsvps (
  event_id uuid NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.community_event_rsvp_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, profile_id)
);

-- An organizer update is an ordinary moderated/reportable comment on the
-- event announcement. This table only marks it as an official update.
CREATE TABLE public.community_event_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL UNIQUE REFERENCES public.community_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_events_discovery_idx
  ON public.community_events(status, starts_at, id)
  WHERE status IN ('scheduled', 'cancelled');
CREATE INDEX community_events_group_idx
  ON public.community_events(group_id, starts_at, id)
  WHERE group_id IS NOT NULL AND status <> 'removed';
CREATE INDEX community_event_rsvps_profile_idx
  ON public.community_event_rsvps(profile_id, status, updated_at DESC);
CREATE INDEX community_event_rsvps_going_idx
  ON public.community_event_rsvps(event_id, profile_id)
  WHERE status = 'going';
CREATE INDEX community_event_updates_event_idx
  ON public.community_event_updates(event_id, created_at DESC, id DESC);

CREATE TRIGGER community_events_updated_at
  BEFORE UPDATE ON public.community_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER community_event_rsvps_updated_at
  BEFORE UPDATE ON public.community_event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_event_updates ENABLE ROW LEVEL SECURITY;

-- All event access is routed through authenticated application endpoints and
-- the service-only policy functions below. Exact instructions never reach a
-- raw client query, even if a future RLS policy drifts.
REVOKE ALL ON public.community_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.community_event_rsvps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.community_event_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.community_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_event_rsvps TO service_role;
GRANT SELECT, INSERT ON public.community_event_updates TO service_role;

CREATE FUNCTION public.social_can_view_community_event(
  p_viewer_id uuid,
  p_event_id uuid,
  p_include_cancelled boolean DEFAULT true
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
      AND event.status IN ('scheduled', 'cancelled', 'completed')
      AND (p_include_cancelled OR event.status <> 'cancelled')
      AND public.social_profile_is_available(p_viewer_id)
      AND public.social_profile_is_available(event.organizer_id)
      AND NOT public.social_profiles_are_blocked(p_viewer_id, event.organizer_id)
      AND (
        public.social_can_view_community_post(p_viewer_id, event.announcement_post_id, true)
        OR (
          event.organizer_id = p_viewer_id
          AND EXISTS (
            SELECT 1 FROM public.community_posts announcement
            WHERE announcement.id = event.announcement_post_id
              AND announcement.author_id = p_viewer_id
              AND announcement.status <> 'archived'
              AND announcement.moderation_status NOT IN ('rejected', 'legal_hold')
          )
        )
      )
  );
$$;

CREATE FUNCTION public.list_visible_community_event_ids(
  p_viewer_id uuid,
  p_group_id uuid DEFAULT NULL,
  p_include_past boolean DEFAULT false
)
RETURNS TABLE(event_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT event.id
  FROM public.community_events event
  WHERE (p_group_id IS NULL OR event.group_id = p_group_id)
    AND (p_include_past OR event.ends_at >= now())
    AND public.social_can_view_community_event(p_viewer_id, event.id, true)
  ORDER BY event.starts_at, event.id;
$$;

CREATE FUNCTION public.community_event_exact_location(
  p_viewer_id uuid,
  p_event_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN event.organizer_id = p_viewer_id OR EXISTS (
      SELECT 1 FROM public.community_event_rsvps rsvp
      WHERE rsvp.event_id = event.id
        AND rsvp.profile_id = p_viewer_id
        AND rsvp.status = 'going'
    ) THEN event.exact_location
    ELSE NULL
  END
  FROM public.community_events event
  WHERE event.id = p_event_id
    AND public.social_can_view_community_event(p_viewer_id, event.id, true);
$$;

CREATE FUNCTION public.community_event_rsvp_summaries(
  p_viewer_id uuid,
  p_event_ids uuid[]
)
RETURNS TABLE(
  event_id uuid,
  going_count integer,
  interested_count integer,
  viewer_status public.community_event_rsvp_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT event.id,
         count(rsvp.profile_id) FILTER (WHERE rsvp.status = 'going')::integer,
         count(rsvp.profile_id) FILTER (WHERE rsvp.status = 'interested')::integer,
         (max(rsvp.status::text) FILTER (WHERE rsvp.profile_id = p_viewer_id))::public.community_event_rsvp_status
  FROM public.community_events event
  LEFT JOIN public.community_event_rsvps rsvp
    ON rsvp.event_id = event.id
   AND public.social_profile_is_available(rsvp.profile_id)
   AND NOT public.social_profiles_are_blocked(p_viewer_id, rsvp.profile_id)
  WHERE event.id = ANY(COALESCE(p_event_ids, ARRAY[]::uuid[]))
    AND public.social_can_view_community_event(p_viewer_id, event.id, true)
  GROUP BY event.id;
$$;

CREATE FUNCTION public.search_community_events(
  p_viewer_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(event_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT event.id
  FROM public.community_events event
  WHERE char_length(btrim(COALESCE(p_query, ''))) BETWEEN 2 AND 100
    AND event.ends_at >= now()
    AND public.social_can_view_community_event(p_viewer_id, event.id, true)
    AND concat_ws(' ', event.title, event.general_location, replace(event.event_type::text, '_', ' '))
      ILIKE '%' || btrim(p_query) || '%'
  ORDER BY
    CASE WHEN lower(event.title) LIKE lower(btrim(p_query)) || '%' THEN 0 ELSE 1 END,
    event.starts_at,
    event.id
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

CREATE FUNCTION public.create_community_event(
  p_actor_profile_id uuid,
  p_announcement_post_id uuid,
  p_client_request_id uuid,
  p_group_id uuid,
  p_event_type public.community_event_type,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_general_location text,
  p_exact_location text,
  p_capacity integer,
  p_requirements text
)
RETURNS public.community_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.community_events%ROWTYPE;
  v_post public.community_posts%ROWTYPE;
BEGIN
  IF p_actor_profile_id IS NULL OR NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'event_profile_unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_enforcement_actions action
    WHERE action.profile_id = p_actor_profile_id
      AND action.action_type IN ('temporary_posting_hold', 'suspension', 'ban')
      AND action.starts_at <= now()
      AND (action.ends_at IS NULL OR action.ends_at > now())
  ) THEN
    RAISE EXCEPTION 'event_creation_restricted' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serialize retries before checking idempotency so concurrent requests cannot
  -- create two events for the same client request.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_profile_id::text, 803));

  SELECT * INTO v_event
  FROM public.community_events event
  WHERE event.organizer_id = p_actor_profile_id
    AND event.client_request_id = p_client_request_id;
  IF FOUND THEN RETURN v_event; END IF;

  SELECT * INTO v_post
  FROM public.community_posts post
  WHERE post.id = p_announcement_post_id
    AND post.author_id = p_actor_profile_id
    AND post.group_id IS NOT DISTINCT FROM p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_announcement_unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.community_groups community_group
    JOIN public.community_group_memberships membership ON membership.group_id = community_group.id
    WHERE community_group.id = p_group_id
      AND community_group.status = 'active'
      AND membership.profile_id = p_actor_profile_id
      AND membership.status = 'active'
      AND (
        community_group.posting_policy = 'members'
        OR membership.role IN ('owner', 'admin', 'moderator')
      )
  ) THEN
    RAISE EXCEPTION 'event_group_unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_starts_at < now() + interval '30 minutes'
     OR p_starts_at > now() + interval '2 years'
     OR p_ends_at <= p_starts_at
     OR p_ends_at - p_starts_at > interval '7 days' THEN
    RAISE EXCEPTION 'event_invalid_schedule' USING ERRCODE = 'check_violation';
  END IF;
  IF p_capacity IS NOT NULL AND p_capacity NOT BETWEEN 2 AND 1000 THEN
    RAISE EXCEPTION 'event_invalid_capacity' USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(*) FROM public.community_events event
      WHERE event.organizer_id = p_actor_profile_id
        AND event.created_at >= now() - interval '24 hours') >= 3
     OR (SELECT count(*) FROM public.community_events event
         WHERE event.organizer_id = p_actor_profile_id
           AND event.status = 'scheduled' AND event.ends_at >= now()) >= 10 THEN
    RAISE EXCEPTION 'event_creation_rate_limited' USING ERRCODE = 'program_limit_exceeded';
  END IF;

  INSERT INTO public.community_events (
    organizer_id, announcement_post_id, client_request_id, group_id,
    event_type, title, starts_at, ends_at, general_location, exact_location,
    capacity, requirements
  ) VALUES (
    p_actor_profile_id, p_announcement_post_id, p_client_request_id, p_group_id,
    p_event_type, btrim(p_title), p_starts_at, p_ends_at,
    btrim(p_general_location), btrim(p_exact_location), p_capacity,
    NULLIF(btrim(p_requirements), '')
  ) RETURNING * INTO v_event;

  INSERT INTO public.community_event_rsvps (event_id, profile_id, status)
  VALUES (v_event.id, p_actor_profile_id, 'going');
  RETURN v_event;
END;
$$;

CREATE FUNCTION public.set_community_event_rsvp(
  p_actor_profile_id uuid,
  p_event_id uuid,
  p_status public.community_event_rsvp_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.community_events%ROWTYPE;
  v_existing public.community_event_rsvps%ROWTYPE;
  v_going integer;
  v_interested integer;
BEGIN
  IF p_actor_profile_id IS NULL OR NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_event FROM public.community_events event
  WHERE event.id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status <> 'scheduled' OR v_event.starts_at <= now()
     OR NOT public.social_can_view_community_event(p_actor_profile_id, p_event_id, false) THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_event.organizer_id = p_actor_profile_id AND p_status <> 'going' THEN
    RAISE EXCEPTION 'event_organizer_is_going' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_existing FROM public.community_event_rsvps rsvp
  WHERE rsvp.event_id = p_event_id AND rsvp.profile_id = p_actor_profile_id;
  SELECT count(*)::integer INTO v_going
  FROM public.community_event_rsvps rsvp
  WHERE rsvp.event_id = p_event_id
    AND rsvp.status = 'going'
    AND public.social_profile_is_available(rsvp.profile_id)
    AND NOT public.social_profiles_are_blocked(v_event.organizer_id, rsvp.profile_id);
  IF p_status = 'going' AND COALESCE(v_existing.status::text, '') <> 'going'
     AND v_event.capacity IS NOT NULL AND v_going >= v_event.capacity THEN
    RAISE EXCEPTION 'event_at_capacity' USING ERRCODE = 'program_limit_exceeded';
  END IF;

  INSERT INTO public.community_event_rsvps (event_id, profile_id, status)
  VALUES (p_event_id, p_actor_profile_id, p_status)
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET status = EXCLUDED.status, updated_at = now();

  SELECT count(*) FILTER (WHERE rsvp.status = 'going')::integer,
         count(*) FILTER (WHERE rsvp.status = 'interested')::integer
  INTO v_going, v_interested
  FROM public.community_event_rsvps rsvp
  WHERE rsvp.event_id = p_event_id
    AND public.social_profile_is_available(rsvp.profile_id)
    AND NOT public.social_profiles_are_blocked(p_actor_profile_id, rsvp.profile_id);
  RETURN jsonb_build_object(
    'eventId', p_event_id, 'status', p_status::text,
    'goingCount', v_going, 'interestedCount', v_interested,
    'exactLocation', CASE WHEN p_status = 'going' THEN v_event.exact_location ELSE NULL END
  );
END;
$$;

CREATE FUNCTION public.cancel_community_event(
  p_actor_profile_id uuid,
  p_event_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.community_events%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM public.community_events event
  WHERE event.id = p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.organizer_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_event.status = 'cancelled' THEN RETURN false; END IF;
  IF v_event.status <> 'scheduled' THEN
    RAISE EXCEPTION 'event_cannot_cancel' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.community_events
  SET status = 'cancelled', cancellation_reason = btrim(p_reason), cancelled_at = now()
  WHERE id = p_event_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT rsvp.profile_id, 'event_cancelled'::public.notification_type,
         'Event cancelled', 'An event you follow has been cancelled. Open it for details.',
         jsonb_build_object('event_id', v_event.id, 'post_id', v_event.announcement_post_id)
  FROM public.community_event_rsvps rsvp
  WHERE rsvp.event_id = v_event.id
    AND rsvp.profile_id <> p_actor_profile_id
    AND rsvp.status IN ('going', 'interested')
    AND public.social_profile_is_available(rsvp.profile_id)
    AND NOT public.social_profiles_are_blocked(rsvp.profile_id, p_actor_profile_id);
  RETURN true;
END;
$$;

CREATE FUNCTION public.notify_community_event_update(p_comment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.community_events%ROWTYPE;
  v_notified integer := 0;
BEGIN
  SELECT event.* INTO v_event
  FROM public.community_event_updates event_update
  JOIN public.community_events event ON event.id = event_update.event_id
  JOIN public.community_comments comment ON comment.id = event_update.comment_id
  WHERE event_update.comment_id = p_comment_id
    AND event.status = 'scheduled'
    AND comment.status = 'active'
    AND comment.moderation_status = 'active';
  IF NOT FOUND THEN RETURN 0; END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT rsvp.profile_id, 'event_update'::public.notification_type,
         'Event update', 'The organizer shared an update for an event you follow.',
         jsonb_build_object('event_id', v_event.id, 'post_id', v_event.announcement_post_id, 'comment_id', p_comment_id)
  FROM public.community_event_rsvps rsvp
  WHERE rsvp.event_id = v_event.id
    AND rsvp.profile_id <> v_event.organizer_id
    AND rsvp.status IN ('going', 'interested')
    AND public.social_profile_is_available(rsvp.profile_id)
    AND NOT public.social_profiles_are_blocked(rsvp.profile_id, v_event.organizer_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications notification
      WHERE notification.user_id = rsvp.profile_id
        AND notification.type = 'event_update'
        AND notification.data->>'comment_id' = p_comment_id::text
    );
  GET DIAGNOSTICS v_notified = ROW_COUNT;
  RETURN v_notified;
END;
$$;

CREATE FUNCTION public.notify_community_event_update_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.moderation_status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'active' OR OLD.moderation_status <> 'active') THEN
    PERFORM public.notify_community_event_update(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_comments_notify_event_update
  AFTER INSERT OR UPDATE OF status, moderation_status ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_community_event_update_trigger();

CREATE FUNCTION public.add_community_event_update(
  p_actor_profile_id uuid,
  p_event_id uuid,
  p_comment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.community_events%ROWTYPE;
  v_update_id uuid;
BEGIN
  SELECT * INTO v_event FROM public.community_events event WHERE event.id = p_event_id;
  IF NOT FOUND OR v_event.organizer_id <> p_actor_profile_id OR v_event.status <> 'scheduled' THEN
    RAISE EXCEPTION 'event_unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_comments comment
    WHERE comment.id = p_comment_id
      AND comment.post_id = v_event.announcement_post_id
      AND comment.author_id = p_actor_profile_id
      AND comment.status <> 'archived'
      AND comment.moderation_status NOT IN ('rejected', 'legal_hold')
  ) THEN
    RAISE EXCEPTION 'event_update_unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.community_event_updates (event_id, comment_id)
  VALUES (p_event_id, p_comment_id)
  RETURNING id INTO v_update_id;

  PERFORM public.notify_community_event_update(p_comment_id);
  RETURN v_update_id;
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
    WHEN 'answer_helpful' THEN 'social'
    WHEN 'build_update' THEN 'social'
    WHEN 'group_post_removed' THEN 'groups'
    WHEN 'group_role_changed' THEN 'groups'
    WHEN 'group_invitation' THEN 'groups'
    WHEN 'group_join_request' THEN 'groups'
    WHEN 'group_join_decision' THEN 'groups'
    WHEN 'event_cancelled' THEN 'groups'
    WHEN 'event_update' THEN 'groups'
    WHEN 'message_received' THEN 'messages'
    WHEN 'listing_inspection_requested' THEN 'marketplace'
    WHEN 'saved_listing_updated' THEN 'marketplace'
    WHEN 'saved_search_match' THEN 'marketplace'
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

REVOKE ALL ON FUNCTION public.social_can_view_community_event(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_visible_community_event_ids(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_event_exact_location(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_event_rsvp_summaries(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_community_events(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_community_event(uuid, uuid, uuid, uuid, public.community_event_type, text, timestamptz, timestamptz, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_community_event_rsvp(uuid, uuid, public.community_event_rsvp_status) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_community_event(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_community_event_update(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_community_event_update_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_community_event_update(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.social_can_view_community_event(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_visible_community_event_ids(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_event_exact_location(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_event_rsvp_summaries(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_community_events(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_community_event(uuid, uuid, uuid, uuid, public.community_event_type, text, timestamptz, timestamptz, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_community_event_rsvp(uuid, uuid, public.community_event_rsvp_status) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_community_event(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_community_event_update(uuid, uuid, uuid) TO service_role;

COMMENT ON TABLE public.community_events IS
  'Free Community events. general_location is discoverable; exact_location is returned only to the organizer and Going attendees.';
COMMENT ON TABLE public.community_event_updates IS
  'Official organizer updates backed by moderated, reportable Community comments.';

COMMIT;
