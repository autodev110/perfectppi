\set ON_ERROR_STOP on
BEGIN;

-- Service contacts (technician directory, assigned inspection, same
-- organization) and vehicle visibility for anonymous viewers / friends.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('77000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'svc-consumer@example.test', '', '{}', '{"username":"SvcConsumer"}', now(), now()),
  ('77000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'svc-tech@example.test', '', '{}', '{"username":"SvcTech"}', now(), now()),
  ('77000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'svc-manager@example.test', '', '{}', '{"username":"SvcManager"}', now(), now()),
  ('77000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'svc-stranger@example.test', '', '{}', '{"username":"SvcStranger"}', now(), now()),
  ('77000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'svc-friend@example.test', '', '{}', '{"username":"SvcFriend"}', now(), now());

UPDATE public.profiles SET is_public = true WHERE auth_user_id::text LIKE '77000000-%';
UPDATE public.profiles SET role = 'technician'
WHERE auth_user_id IN ('77000000-0000-0000-0000-000000000002', '77000000-0000-0000-0000-000000000003');

CREATE TEMP TABLE svc AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '77000000-0000-0000-0000-000000000001') AS consumer,
  (SELECT id FROM public.profiles WHERE auth_user_id = '77000000-0000-0000-0000-000000000002') AS tech,
  (SELECT id FROM public.profiles WHERE auth_user_id = '77000000-0000-0000-0000-000000000003') AS manager,
  (SELECT id FROM public.profiles WHERE auth_user_id = '77000000-0000-0000-0000-000000000004') AS stranger,
  (SELECT id FROM public.profiles WHERE auth_user_id = '77000000-0000-0000-0000-000000000005') AS friend;

INSERT INTO public.organizations (id, name, slug) VALUES ('77000000-0000-0000-0000-000000000100', 'Svc Shop', 'svc-shop');
INSERT INTO public.technician_profiles (profile_id, organization_id)
SELECT tech, '77000000-0000-0000-0000-000000000100'::uuid FROM svc
UNION ALL
SELECT manager, '77000000-0000-0000-0000-000000000100'::uuid FROM svc;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '77000000-0000-0000-0000-000000000200', consumer, 2018, 'Subaru', 'WRX', 'public' FROM svc;
INSERT INTO public.ppi_requests (id, vehicle_id, requester_id, assigned_tech_id, whose_car, requester_role, performer_type, ppi_type, status)
SELECT '77000000-0000-0000-0000-000000000300', '77000000-0000-0000-0000-000000000200', consumer, manager, 'own', 'buying', 'technician', 'general_tech', 'assigned' FROM svc;

INSERT INTO public.friend_relationships (profile_low_id, profile_high_id, requested_by, status, responded_at)
SELECT LEAST(consumer, friend), GREATEST(consumer, friend), consumer, 'friends', now() FROM svc;

-- ---------------------------------------------------------------------------
-- 1. Who counts as a service contact
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT public.social_service_contact_allowed((SELECT consumer FROM svc), (SELECT tech FROM svc)) THEN
    RAISE EXCEPTION 'a listed technician with a public profile should be contactable';
  END IF;
  IF NOT public.social_service_contact_allowed((SELECT manager FROM svc), (SELECT consumer FROM svc))
     OR NOT public.social_service_contact_allowed((SELECT consumer FROM svc), (SELECT manager FROM svc)) THEN
    RAISE EXCEPTION 'assigned inspections should connect requester and technician both ways';
  END IF;
  IF NOT public.social_service_contact_allowed((SELECT manager FROM svc), (SELECT tech FROM svc)) THEN
    RAISE EXCEPTION 'members of one organization should be able to message each other';
  END IF;
  IF public.social_service_contact_allowed((SELECT tech FROM svc), (SELECT stranger FROM svc)) THEN
    RAISE EXCEPTION 'a technician must not get an open line to any member';
  END IF;
  IF public.social_service_contact_allowed((SELECT stranger FROM svc), (SELECT consumer FROM svc)) THEN
    RAISE EXCEPTION 'two unrelated members are not service contacts';
  END IF;
  UPDATE public.profiles SET is_public = false WHERE id = (SELECT tech FROM svc);
  IF public.social_service_contact_allowed((SELECT stranger FROM svc), (SELECT tech FROM svc)) THEN
    RAISE EXCEPTION 'a technician with a private profile is not listed for contact';
  END IF;
  UPDATE public.profiles SET is_public = true WHERE id = (SELECT tech FROM svc);
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Service threads are accepted immediately, both sides can talk, and the
--    friend re-check does not apply; friends still take precedence.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_row record;
  v_conversation public.conversations%ROWTYPE;
  hit boolean := false;
BEGIN
  SELECT * INTO v_row FROM public.create_direct_conversation_internal(
    (SELECT consumer FROM svc), (SELECT tech FROM svc), NULL, 'accepted', NULL);
  IF NOT v_row.was_created THEN RAISE EXCEPTION 'service thread should be created'; END IF;
  SELECT * INTO v_conversation FROM public.conversations WHERE id = v_row.conversation_id;
  IF v_conversation.contact_kind <> 'service' OR v_conversation.request_status <> 'accepted' THEN
    RAISE EXCEPTION 'expected an accepted service thread, got % / %', v_conversation.contact_kind, v_conversation.request_status;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, status)
  VALUES (v_row.conversation_id, (SELECT consumer FROM svc), 'Can you inspect a WRX this week?', 'unread');
  INSERT INTO public.messages (conversation_id, sender_id, content, status)
  VALUES (v_row.conversation_id, (SELECT tech FROM svc), 'Sure, send the listing.', 'unread');

  -- Turning off friend messages changes nothing for a service thread.
  UPDATE public.profiles SET allow_friend_messages = false WHERE id = (SELECT tech FROM svc);
  INSERT INTO public.messages (conversation_id, sender_id, content, status)
  VALUES (v_row.conversation_id, (SELECT consumer FROM svc), 'Here it is.', 'unread');
  UPDATE public.profiles SET allow_friend_messages = true WHERE id = (SELECT tech FROM svc);

  -- Friends take precedence over service.
  SELECT * INTO v_row FROM public.create_direct_conversation_internal(
    (SELECT consumer FROM svc), (SELECT friend FROM svc), NULL, 'accepted', NULL);
  SELECT * INTO v_conversation FROM public.conversations WHERE id = v_row.conversation_id;
  IF v_conversation.contact_kind <> 'friend' THEN RAISE EXCEPTION 'friend thread mislabelled as %', v_conversation.contact_kind; END IF;

  -- Strangers still cannot open a thread.
  BEGIN
    PERFORM public.create_direct_conversation_internal(
      (SELECT stranger FROM svc), (SELECT consumer FROM svc), NULL, 'accepted', NULL);
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'strangers must not open direct threads'; END IF;

  -- Blocks end service messaging too.
  INSERT INTO public.profile_blocks (blocker_id, blocked_id) SELECT tech, consumer FROM svc;
  hit := false;
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, content, status)
    SELECT c.id, (SELECT consumer FROM svc), 'Hello?', 'unread'
    FROM public.conversations c WHERE c.contact_kind = 'service';
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'blocked pairs must not message on service threads'; END IF;
  DELETE FROM public.profile_blocks;
END
$$;

-- Existing rows were classified.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.conversations WHERE contact_kind IS NULL) THEN
    RAISE EXCEPTION 'every conversation needs a contact kind';
  END IF;
  IF has_function_privilege('authenticated', 'public.social_service_contact_allowed(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service contact check leaked to clients';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Vehicle visibility: anonymous viewers see public cars; friends-only cars
--    and their posts are for friends and the owner.
-- ---------------------------------------------------------------------------
INSERT INTO public.community_posts (id, author_id, vehicle_id, content, audience, status, moderation_status)
SELECT '77000000-0000-0000-0000-000000000400', consumer, '77000000-0000-0000-0000-000000000200', 'New downpipe on the WRX', 'public', 'active', 'active' FROM svc;

DO $$
BEGIN
  IF NOT public.social_can_view_vehicle(NULL, '77000000-0000-0000-0000-000000000200') THEN
    RAISE EXCEPTION 'anonymous visitors should see public vehicles';
  END IF;
  IF NOT public.social_can_view_community_post((SELECT stranger FROM svc), '77000000-0000-0000-0000-000000000400', false) THEN
    RAISE EXCEPTION 'public vehicle posts should be visible';
  END IF;

  UPDATE public.vehicles SET visibility = 'friends' WHERE id = '77000000-0000-0000-0000-000000000200';
  IF public.social_can_view_vehicle(NULL, '77000000-0000-0000-0000-000000000200') THEN
    RAISE EXCEPTION 'friends-only vehicles must not be anonymous-visible';
  END IF;
  IF public.social_can_view_vehicle((SELECT stranger FROM svc), '77000000-0000-0000-0000-000000000200') THEN
    RAISE EXCEPTION 'friends-only vehicles must not be visible to strangers';
  END IF;
  IF NOT public.social_can_view_vehicle((SELECT friend FROM svc), '77000000-0000-0000-0000-000000000200') THEN
    RAISE EXCEPTION 'friends should see friends-only vehicles';
  END IF;
  IF public.social_can_view_community_post((SELECT stranger FROM svc), '77000000-0000-0000-0000-000000000400', false) THEN
    RAISE EXCEPTION 'posts about a friends-only vehicle must follow the vehicle';
  END IF;
  IF NOT public.social_can_view_community_post((SELECT friend FROM svc), '77000000-0000-0000-0000-000000000400', false) THEN
    RAISE EXCEPTION 'friends should still see posts about a friends-only vehicle';
  END IF;
  IF NOT public.social_can_view_community_post((SELECT consumer FROM svc), '77000000-0000-0000-0000-000000000400', false) THEN
    RAISE EXCEPTION 'owners should always see their own vehicle posts';
  END IF;

  UPDATE public.vehicles SET visibility = 'private' WHERE id = '77000000-0000-0000-0000-000000000200';
  IF public.social_can_view_community_post((SELECT friend FROM svc), '77000000-0000-0000-0000-000000000400', false) THEN
    RAISE EXCEPTION 'private vehicle posts are owner-only';
  END IF;
  IF NOT public.social_can_view_community_post((SELECT consumer FROM svc), '77000000-0000-0000-0000-000000000400', false) THEN
    RAISE EXCEPTION 'owners keep their private vehicle posts';
  END IF;
END
$$;

ROLLBACK;
