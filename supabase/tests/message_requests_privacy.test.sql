\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('76000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'message-requester@example.test', '', '{}', '{"username":"MessageRequester"}', now(), now()),
  ('76000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'message-recipient@example.test', '', '{}', '{"username":"MessageRecipient"}', now(), now()),
  ('76000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'message-third@example.test', '', '{}', '{"username":"MessageThird"}', now(), now());

CREATE TEMP TABLE actors AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '76000000-0000-0000-0000-000000000001') requester,
  (SELECT id FROM public.profiles WHERE auth_user_id = '76000000-0000-0000-0000-000000000002') recipient,
  (SELECT id FROM public.profiles WHERE auth_user_id = '76000000-0000-0000-0000-000000000003') third_recipient;

INSERT INTO public.community_groups (id, slug, name, description, category, is_staff_curated)
VALUES ('76000000-0000-0000-0000-000000000010', 'message-test-group', 'Message Test Group', 'Shared group.', 'general', true);
INSERT INTO public.community_group_memberships (group_id, profile_id, status)
SELECT '76000000-0000-0000-0000-000000000010'::uuid, requester, 'active'::public.community_group_membership_status FROM actors
UNION ALL
SELECT '76000000-0000-0000-0000-000000000010'::uuid, recipient, 'active'::public.community_group_membership_status FROM actors
UNION ALL
SELECT '76000000-0000-0000-0000-000000000010'::uuid, third_recipient, 'active'::public.community_group_membership_status FROM actors;

UPDATE public.profiles SET allow_group_message_requests = true
WHERE id IN (SELECT recipient FROM actors UNION ALL SELECT third_recipient FROM actors);

-- Privacy fields cannot bypass the canonical RPC through a direct profile
-- update, even on deployments with the standard authenticated UPDATE grant.
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"76000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SELECT set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000001', true);
DO $$
DECLARE changed_rows integer := 0;
BEGIN
  BEGIN
    UPDATE public.profiles SET allow_friend_messages = false
    WHERE id = (SELECT requester FROM actors);
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    changed_rows := 0;
  END;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'message privacy bypassed the canonical RPC'; END IF;
END
$$;
SELECT public.set_own_social_privacy(true, 'public', true, true, 'everyone', false, true);
RESET ROLE;

DO $$
BEGIN
  IF (SELECT allow_friend_messages FROM public.profiles WHERE id = (SELECT requester FROM actors)) THEN
    RAISE EXCEPTION 'privacy RPC did not update friend messages';
  END IF;
  IF NOT (SELECT allow_group_message_requests FROM public.profiles WHERE id = (SELECT requester FROM actors)) THEN
    RAISE EXCEPTION 'privacy RPC did not update group requests';
  END IF;
END
$$;

INSERT INTO public.conversations (
  id, request_status, requested_by, request_context_group_id
)
SELECT '76000000-0000-0000-0000-000000000020', 'pending', requester,
       '76000000-0000-0000-0000-000000000010'
FROM actors;
INSERT INTO public.conversation_participants (conversation_id, profile_id)
SELECT '76000000-0000-0000-0000-000000000020'::uuid, requester FROM actors
UNION ALL
SELECT '76000000-0000-0000-0000-000000000020'::uuid, recipient FROM actors;

-- The requester may send exactly one introduction before acceptance.
INSERT INTO public.messages (conversation_id, sender_id, content)
SELECT '76000000-0000-0000-0000-000000000020', requester, 'Could I ask about your setup?' FROM actors;

DO $$
DECLARE hit boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, content)
    SELECT '76000000-0000-0000-0000-000000000020', requester, 'Second request message' FROM actors;
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'message request is awaiting a response';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'pending requester sent more than one message'; END IF;

  hit := false;
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, content)
    SELECT '76000000-0000-0000-0000-000000000020', recipient, 'Reply before acceptance' FROM actors;
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'message request must be accepted first';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'recipient replied before accepting'; END IF;
END
$$;

UPDATE public.conversations
SET request_status = 'accepted', request_resolved_at = now()
WHERE id = '76000000-0000-0000-0000-000000000020';
INSERT INTO public.messages (conversation_id, sender_id, content)
SELECT '76000000-0000-0000-0000-000000000020', recipient, 'Accepted reply' FROM actors;

UPDATE public.conversations
SET request_status = 'declined'
WHERE id = '76000000-0000-0000-0000-000000000020';
DO $$
DECLARE hit boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, content)
    SELECT '76000000-0000-0000-0000-000000000020', requester, 'After decline' FROM actors;
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'message request declined';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'declined request accepted a message'; END IF;
END
$$;

-- Accepted friend conversations stop accepting new messages when either
-- participant disables friend messages.
INSERT INTO public.friend_relationships (
  profile_low_id, profile_high_id, requested_by, status, responded_at
)
SELECT LEAST(requester, recipient), GREATEST(requester, recipient), requester, 'friends', now()
FROM actors;
INSERT INTO public.conversations (id, request_status, requested_by)
SELECT '76000000-0000-0000-0000-000000000021', 'accepted', requester FROM actors;
INSERT INTO public.conversation_participants (conversation_id, profile_id)
SELECT '76000000-0000-0000-0000-000000000021'::uuid, requester FROM actors
UNION ALL
SELECT '76000000-0000-0000-0000-000000000021'::uuid, recipient FROM actors;

DO $$
DECLARE hit boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, content)
    SELECT '76000000-0000-0000-0000-000000000021', recipient, 'Privacy-disabled friend message' FROM actors;
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'friend messages are disabled';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'disabled friend messaging still accepted a message'; END IF;
END
$$;

UPDATE public.profiles SET allow_friend_messages = true
WHERE id = (SELECT requester FROM actors);
INSERT INTO public.messages (conversation_id, sender_id, content)
SELECT '76000000-0000-0000-0000-000000000021', recipient, 'Enabled friend message' FROM actors;

-- Pair creation is atomic and idempotent, closing the concurrent duplicate
-- request path that could otherwise allow several one-message introductions.
DO $$
DECLARE
  first_id uuid;
  second_id uuid;
  first_created boolean;
  second_created boolean;
BEGIN
  SELECT conversation_id, was_created INTO first_id, first_created
  FROM public.create_direct_conversation_internal(
    (SELECT requester FROM actors),
    (SELECT recipient FROM actors),
    NULL,
    'accepted',
    NULL
  );
  SELECT conversation_id, was_created INTO second_id, second_created
  FROM public.create_direct_conversation_internal(
    (SELECT requester FROM actors),
    (SELECT recipient FROM actors),
    NULL,
    'accepted',
    NULL
  );
  IF first_id IS DISTINCT FROM second_id OR NOT first_created OR second_created THEN
    RAISE EXCEPTION 'direct conversation pair creation was not idempotent';
  END IF;
END
$$;

DO $$
DECLARE hit boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, content)
    SELECT '76000000-0000-0000-0000-000000000021', requester, 'Old duplicate thread' FROM actors;
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'conversation superseded';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'historical duplicate conversation remained writable'; END IF;
END
$$;

-- Archived groups cannot create or deliver a group-member request even when
-- both membership rows still say active.
UPDATE public.community_groups SET status = 'archived'
WHERE id = '76000000-0000-0000-0000-000000000010';
DO $$
DECLARE hit boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_direct_conversation_internal(
      (SELECT requester FROM actors),
      (SELECT recipient FROM actors),
      NULL,
      'pending',
      '76000000-0000-0000-0000-000000000010'
    );
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'message request unavailable';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'archived group created a message request'; END IF;
END
$$;

INSERT INTO public.conversations (
  id, request_status, requested_by, request_context_group_id
)
SELECT '76000000-0000-0000-0000-000000000022', 'pending', requester,
       '76000000-0000-0000-0000-000000000010'
FROM actors;
INSERT INTO public.conversation_participants (conversation_id, profile_id)
SELECT '76000000-0000-0000-0000-000000000022'::uuid, requester FROM actors
UNION ALL
SELECT '76000000-0000-0000-0000-000000000022'::uuid, third_recipient FROM actors;
DO $$
DECLARE hit boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, content)
    SELECT '76000000-0000-0000-0000-000000000022', requester, 'Archived group request' FROM actors;
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'message request unavailable';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'archived group delivered a message request'; END IF;
END
$$;

ROLLBACK;
