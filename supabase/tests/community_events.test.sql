\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'event-host@example.test', '', '{}', '{"username":"EventHost1"}', now(), now()),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'event-guest@example.test', '', '{}', '{"username":"EventGuest1"}', now(), now()),
  ('e1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'event-viewer@example.test', '', '{}', '{"username":"EventView1"}', now(), now());

UPDATE public.profiles
SET is_public = true
WHERE auth_user_id IN (
  'e1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000003'
);

CREATE TEMP TABLE event_ids AS
SELECT
  max(id::text) FILTER (WHERE auth_user_id = 'e1000000-0000-0000-0000-000000000001')::uuid AS host_id,
  max(id::text) FILTER (WHERE auth_user_id = 'e1000000-0000-0000-0000-000000000002')::uuid AS guest_id,
  max(id::text) FILTER (WHERE auth_user_id = 'e1000000-0000-0000-0000-000000000003')::uuid AS viewer_id,
  'e2000000-0000-0000-0000-000000000001'::uuid AS announcement_id,
  NULL::uuid AS event_id,
  'e4000000-0000-0000-0000-000000000001'::uuid AS request_id
FROM public.profiles;

INSERT INTO public.community_posts (
  id, author_id, content, audience, status, moderation_status
)
SELECT announcement_id, host_id, 'Cars and coffee\n\nA safe public meet.', 'public', 'active', 'active'
FROM event_ids;

CREATE TEMP TABLE created_event AS
SELECT (public.create_community_event(
  host_id,
  announcement_id,
  request_id,
  NULL,
  'car_meet',
  'Cars and coffee',
  now() + interval '1 hour',
  now() + interval '3 hours',
  'Midtown Atlanta',
  '123 Private Test Street, use rear entrance',
  2,
  'Respect the venue'
)).*
FROM event_ids;

UPDATE event_ids SET event_id = (SELECT id FROM created_event);

-- Creation is idempotent and the exact location never enters discovery rows.
DO $$
DECLARE
  v_retry public.community_events;
BEGIN
  SELECT (public.create_community_event(
    host_id, announcement_id, request_id, NULL, 'car_meet', 'Cars and coffee',
    now() + interval '1 hour', now() + interval '3 hours', 'Midtown Atlanta',
    '123 Private Test Street, use rear entrance', 2, 'Respect the venue'
  )).* INTO v_retry FROM event_ids;
  IF v_retry.id <> (SELECT event_id FROM event_ids) THEN
    RAISE EXCEPTION 'event creation retry produced another event';
  END IF;
  IF (SELECT count(*) FROM public.community_events WHERE organizer_id = (SELECT host_id FROM event_ids)) <> 1 THEN
    RAISE EXCEPTION 'event creation retry was not idempotent';
  END IF;
  IF NOT public.social_can_view_community_event(
    (SELECT viewer_id FROM event_ids), (SELECT event_id FROM event_ids), true
  ) THEN RAISE EXCEPTION 'public event was not discoverable'; END IF;
  IF public.community_event_exact_location(
    (SELECT viewer_id FROM event_ids), (SELECT event_id FROM event_ids)
  ) IS NOT NULL THEN RAISE EXCEPTION 'exact location leaked to a non-attendee'; END IF;
  IF public.community_event_exact_location(
    (SELECT host_id FROM event_ids), (SELECT event_id FROM event_ids)
  ) NOT LIKE '123 Private Test Street%' THEN RAISE EXCEPTION 'organizer could not read exact location'; END IF;
END
$$;

-- RSVP is idempotent, Going unlocks directions, and capacity excludes Interested.
SELECT public.set_community_event_rsvp(guest_id, event_id, 'going') FROM event_ids;
SELECT public.set_community_event_rsvp(guest_id, event_id, 'going') FROM event_ids;
SELECT public.set_community_event_rsvp(viewer_id, event_id, 'interested') FROM event_ids;

DO $$
DECLARE
  v_limited boolean := false;
BEGIN
  IF public.community_event_exact_location(
    (SELECT guest_id FROM event_ids), (SELECT event_id FROM event_ids)
  ) NOT LIKE '123 Private Test Street%' THEN RAISE EXCEPTION 'Going attendee could not read exact location'; END IF;
  IF (SELECT count(*) FROM public.community_event_rsvps
      WHERE event_id = (SELECT event_id FROM event_ids)
        AND profile_id = (SELECT guest_id FROM event_ids)) <> 1 THEN
    RAISE EXCEPTION 'RSVP retry created a duplicate';
  END IF;
  BEGIN
    PERFORM public.set_community_event_rsvp(
      (SELECT viewer_id FROM event_ids), (SELECT event_id FROM event_ids), 'going'
    );
  EXCEPTION WHEN program_limit_exceeded THEN
    v_limited := SQLERRM = 'event_at_capacity';
  END;
  IF NOT v_limited THEN RAISE EXCEPTION 'event capacity was not enforced'; END IF;
  IF (SELECT status FROM public.community_event_rsvps
      WHERE event_id = (SELECT event_id FROM event_ids)
        AND profile_id = (SELECT viewer_id FROM event_ids)) <> 'interested' THEN
    RAISE EXCEPTION 'failed Going transition did not preserve Interested';
  END IF;
END
$$;

-- Official updates remain ordinary moderated comments and notify attendees.
INSERT INTO public.community_comments (id, post_id, author_id, content, status, moderation_status)
SELECT 'e5000000-0000-0000-0000-000000000001', announcement_id, host_id,
       'Parking is now behind the building.', 'active', 'active'
FROM event_ids;
SELECT public.add_community_event_update(
  host_id, event_id, 'e5000000-0000-0000-0000-000000000001'
) FROM event_ids;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.community_event_updates
      WHERE event_id = (SELECT event_id FROM event_ids)) <> 1 THEN
    RAISE EXCEPTION 'official update was not linked';
  END IF;
  IF (SELECT count(*) FROM public.notifications
      WHERE type = 'event_update'
        AND user_id IN ((SELECT guest_id FROM event_ids), (SELECT viewer_id FROM event_ids))) <> 2 THEN
    RAISE EXCEPTION 'Going and Interested members were not notified of update';
  END IF;
END
$$;

-- Start the event, then exercise the normal moderated photo assembly path.
UPDATE public.community_events
SET starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour'
WHERE id = (SELECT event_id FROM event_ids);

SELECT public.create_community_post_assembly(
  guest_id,
  'e6000000-0000-0000-0000-000000000001',
  1::smallint,
  'friends',
  NULL,
  NULL,
  NULL,
  'general',
  'Photos from the event.',
  'active',
  NULL,
  now(),
  'test-v1'
) AS post_id
INTO TEMP TABLE event_photo_post
FROM event_ids;

SELECT public.attach_community_event_photo_post(guest_id, event_id, post_id)
FROM event_ids CROSS JOIN event_photo_post;

DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.attach_community_event_photo_post(
      (SELECT viewer_id FROM event_ids),
      (SELECT event_id FROM event_ids),
      (SELECT post_id FROM event_photo_post)
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := SQLERRM = 'event_photo_contribution_unavailable';
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'non-Going member attached an event photo post'; END IF;

  BEGIN
    INSERT INTO public.community_post_media (
      post_id, uploader_id, url, media_type, content_type, sort_order
    ) SELECT post_id, guest_id, 'https://example.test/event.mov', 'video', 'video/quicktime', 0
      FROM event_photo_post CROSS JOIN event_ids;
    RAISE EXCEPTION 'event video unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%event_photo_images_only%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.community_events
    SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Weather test'
    WHERE id = (SELECT event_id FROM event_ids);
    INSERT INTO public.community_post_media (
      post_id, uploader_id, url, media_type, content_type, sort_order
    ) SELECT post_id, guest_id, 'https://example.test/cancelled.jpg', 'image', 'image/jpeg', 0
      FROM event_photo_post CROSS JOIN event_ids;
    RAISE EXCEPTION 'cancelled event unexpectedly accepted a photo';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%event_photo_contribution_unavailable%' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO public.community_post_media (
  post_id, uploader_id, url, media_type, content_type, sort_order, moderation_status
)
SELECT post_id, guest_id, 'https://example.test/event.jpg', 'image', 'image/jpeg', 0, 'active'
FROM event_photo_post CROSS JOIN event_ids;
SELECT public.finalize_community_post_assembly(guest_id, post_id)
FROM event_ids CROSS JOIN event_photo_post;

DO $$
BEGIN
  IF NOT public.social_can_view_community_post(
    (SELECT viewer_id FROM event_ids), (SELECT post_id FROM event_photo_post), false
  ) THEN RAISE EXCEPTION 'event viewer could not see a private contributor photo post'; END IF;
  IF (SELECT count(*) FROM public.list_community_event_photo_post_ids(
      (SELECT viewer_id FROM event_ids), (SELECT event_id FROM event_ids))) <> 1 THEN
    RAISE EXCEPTION 'approved event photo was not listed';
  END IF;

  INSERT INTO public.profile_mutes(muter_id, muted_id)
  VALUES ((SELECT viewer_id FROM event_ids), (SELECT guest_id FROM event_ids));
  IF (SELECT count(*) FROM public.list_community_event_photo_post_ids(
      (SELECT viewer_id FROM event_ids), (SELECT event_id FROM event_ids))) <> 0 THEN
    RAISE EXCEPTION 'muted event contributor remained in the photo thread';
  END IF;
  DELETE FROM public.profile_mutes
  WHERE muter_id = (SELECT viewer_id FROM event_ids) AND muted_id = (SELECT guest_id FROM event_ids);
END
$$;

-- Cancellation is atomic, prevents future uploads, and notifies both RSVP states.
SELECT public.cancel_community_event(host_id, event_id, 'Heavy weather nearby') FROM event_ids;

DO $$
BEGIN
  IF public.can_contribute_community_event_photos(
    (SELECT guest_id FROM event_ids), (SELECT event_id FROM event_ids)
  ) THEN RAISE EXCEPTION 'cancelled event still accepts photos'; END IF;
  IF (SELECT count(*) FROM public.notifications
      WHERE type = 'event_cancelled'
        AND user_id IN ((SELECT guest_id FROM event_ids), (SELECT viewer_id FROM event_ids))) <> 2 THEN
    RAISE EXCEPTION 'Going and Interested members were not notified of cancellation';
  END IF;
END
$$;

-- Raw tables and privileged functions stay behind the service boundary.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.community_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.community_event_rsvps', 'SELECT')
     OR has_table_privilege('authenticated', 'public.community_event_photo_posts', 'SELECT') THEN
    RAISE EXCEPTION 'raw event data leaked to authenticated clients';
  END IF;
  IF has_function_privilege('authenticated', 'public.community_event_exact_location(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.attach_community_event_photo_post(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.list_community_event_photo_post_ids(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'event service function leaked to authenticated clients';
  END IF;
END
$$;

ROLLBACK;
