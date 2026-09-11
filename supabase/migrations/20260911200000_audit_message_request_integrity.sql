-- Audit hardening for Phase 1C direct messages and group-member requests.

BEGIN;

ALTER TABLE public.conversations
  ADD COLUMN participant_low_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN participant_high_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT conversations_direct_pair_check CHECK (
    (participant_low_id IS NULL AND participant_high_id IS NULL)
    OR (
      participant_low_id IS NOT NULL
      AND participant_high_id IS NOT NULL
      AND participant_low_id < participant_high_id
    )
  );

-- Adopt the most recently active two-person thread for each existing pair.
-- Historical duplicates remain readable but cannot become the canonical target
-- for a new request.
WITH direct_pairs AS (
  SELECT
    participant.conversation_id,
    (array_agg(participant.profile_id ORDER BY participant.profile_id))[1] AS low_id,
    (array_agg(participant.profile_id ORDER BY participant.profile_id))[2] AS high_id
  FROM public.conversation_participants participant
  GROUP BY participant.conversation_id
  HAVING count(*) = 2
), ranked_pairs AS (
  SELECT
    pair.*,
    row_number() OVER (
      PARTITION BY pair.low_id, pair.high_id
      ORDER BY COALESCE(
        (SELECT max(message.created_at) FROM public.messages message
         WHERE message.conversation_id = pair.conversation_id),
        conversation.created_at
      ) DESC, pair.conversation_id DESC
    ) AS rank
  FROM direct_pairs pair
  JOIN public.conversations conversation ON conversation.id = pair.conversation_id
)
UPDATE public.conversations conversation
SET participant_low_id = pair.low_id,
    participant_high_id = pair.high_id
FROM ranked_pairs pair
WHERE pair.conversation_id = conversation.id
  AND pair.rank = 1;

CREATE UNIQUE INDEX conversations_direct_pair_unique_idx
  ON public.conversations(participant_low_id, participant_high_id)
  WHERE participant_low_id IS NOT NULL AND participant_high_id IS NOT NULL;

CREATE FUNCTION public.create_direct_conversation_internal(
  p_actor_id uuid,
  p_target_id uuid,
  p_marketplace_listing_id uuid,
  p_request_status text,
  p_request_context_group_id uuid
)
RETURNS TABLE(conversation_id uuid, was_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_low_id uuid := LEAST(p_actor_id, p_target_id);
  v_high_id uuid := GREATEST(p_actor_id, p_target_id);
  v_conversation_id uuid;
BEGIN
  IF p_actor_id IS NULL OR p_target_id IS NULL OR p_actor_id = p_target_id
     OR p_request_status NOT IN ('accepted', 'pending') THEN
    RAISE EXCEPTION 'invalid direct conversation' USING ERRCODE = 'check_violation';
  END IF;
  IF public.social_profiles_are_blocked(p_actor_id, p_target_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_request_status = 'pending' THEN
    IF p_marketplace_listing_id IS NOT NULL
       OR p_request_context_group_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.community_groups group_record
         JOIN public.community_group_memberships actor_membership
           ON actor_membership.group_id = group_record.id
          AND actor_membership.profile_id = p_actor_id
          AND actor_membership.status = 'active'
         JOIN public.community_group_memberships target_membership
           ON target_membership.group_id = group_record.id
          AND target_membership.profile_id = p_target_id
          AND target_membership.status = 'active'
         JOIN public.profiles target_profile ON target_profile.id = p_target_id
         WHERE group_record.id = p_request_context_group_id
           AND group_record.status = 'active'
           AND target_profile.allow_group_message_requests
       ) THEN
      RAISE EXCEPTION 'message request unavailable' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_marketplace_listing_id IS NOT NULL THEN
    IF p_request_context_group_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.marketplace_listings listing
      WHERE listing.id = p_marketplace_listing_id
        AND listing.seller_id = p_target_id
        AND listing.status = 'active'
    ) THEN
      RAISE EXCEPTION 'listing unavailable' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_request_context_group_id IS NOT NULL OR NOT EXISTS (
    SELECT 1
    FROM public.friend_relationships friendship
    JOIN public.profiles actor_profile ON actor_profile.id = p_actor_id
    JOIN public.profiles target_profile ON target_profile.id = p_target_id
    WHERE friendship.profile_low_id = v_low_id
      AND friendship.profile_high_id = v_high_id
      AND friendship.status = 'friends'
      AND actor_profile.allow_friend_messages
      AND target_profile.allow_friend_messages
  ) THEN
    RAISE EXCEPTION 'friend messages are disabled' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The lock makes conversation plus participant creation one atomic operation
  -- even when two devices start the same pair at the same time.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_low_id::text || ':' || v_high_id::text, 0));

  SELECT conversation.id INTO v_conversation_id
  FROM public.conversations conversation
  WHERE conversation.participant_low_id = v_low_id
    AND conversation.participant_high_id = v_high_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT v_conversation_id, false;
    RETURN;
  END IF;

  INSERT INTO public.conversations (
    marketplace_listing_id,
    request_status,
    requested_by,
    request_context_group_id,
    participant_low_id,
    participant_high_id
  ) VALUES (
    p_marketplace_listing_id,
    p_request_status,
    p_actor_id,
    p_request_context_group_id,
    v_low_id,
    v_high_id
  )
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conversation_id, p_actor_id), (v_conversation_id, p_target_id);

  RETURN QUERY SELECT v_conversation_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_direct_conversation_internal(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation_internal(uuid, uuid, uuid, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.guard_message_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = NEW.conversation_id
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = NEW.conversation_id AND profile_id = NEW.sender_id
  ) THEN
    RAISE EXCEPTION 'conversation unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Historical duplicate two-person threads stay readable, but only the
  -- canonical keyed thread may accept new messages.
  IF v_conversation.participant_low_id IS NULL
     AND (SELECT count(*) FROM public.conversation_participants participant
          WHERE participant.conversation_id = NEW.conversation_id) = 2
     AND EXISTS (
       SELECT 1
       FROM public.conversation_participants first_participant
       JOIN public.conversation_participants second_participant
         ON second_participant.conversation_id = first_participant.conversation_id
        AND first_participant.profile_id < second_participant.profile_id
       JOIN public.conversations canonical
         ON canonical.participant_low_id = first_participant.profile_id
        AND canonical.participant_high_id = second_participant.profile_id
       WHERE first_participant.conversation_id = NEW.conversation_id
         AND canonical.id <> NEW.conversation_id
     ) THEN
    RAISE EXCEPTION 'conversation superseded' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conversation_participants other
    JOIN public.profile_blocks block
      ON (block.blocker_id = NEW.sender_id AND block.blocked_id = other.profile_id)
      OR (block.blocked_id = NEW.sender_id AND block.blocker_id = other.profile_id)
    WHERE other.conversation_id = NEW.conversation_id
      AND other.profile_id <> NEW.sender_id
  ) THEN
    RAISE EXCEPTION 'conversation unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_conversation.request_status = 'declined' THEN
    RAISE EXCEPTION 'message request declined' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_conversation.request_status = 'pending' THEN
    IF NEW.sender_id IS DISTINCT FROM v_conversation.requested_by THEN
      RAISE EXCEPTION 'message request must be accepted first' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.community_groups group_record
      JOIN public.community_group_memberships requester_membership
        ON requester_membership.group_id = group_record.id
       AND requester_membership.profile_id = v_conversation.requested_by
       AND requester_membership.status = 'active'
      JOIN public.community_group_memberships recipient_membership
        ON recipient_membership.group_id = group_record.id
       AND recipient_membership.status = 'active'
      JOIN public.profiles recipient_profile
        ON recipient_profile.id = recipient_membership.profile_id
       AND recipient_profile.allow_group_message_requests
      WHERE group_record.id = v_conversation.request_context_group_id
        AND group_record.status = 'active'
        AND recipient_membership.profile_id <> v_conversation.requested_by
        AND recipient_membership.profile_id IN (
          SELECT participant.profile_id
          FROM public.conversation_participants participant
          WHERE participant.conversation_id = NEW.conversation_id
        )
    ) THEN
      RAISE EXCEPTION 'message request unavailable' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = NEW.conversation_id) THEN
      RAISE EXCEPTION 'message request is awaiting a response' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_conversation.request_status = 'accepted'
     AND v_conversation.requested_by IS NOT NULL
     AND v_conversation.marketplace_listing_id IS NULL
     AND v_conversation.request_context_group_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.conversation_participants other
      JOIN public.profiles sender ON sender.id = NEW.sender_id
      JOIN public.profiles recipient ON recipient.id = other.profile_id
      JOIN public.friend_relationships friendship
        ON friendship.profile_low_id = LEAST(NEW.sender_id, other.profile_id)
       AND friendship.profile_high_id = GREATEST(NEW.sender_id, other.profile_id)
       AND friendship.status = 'friends'
      WHERE other.conversation_id = NEW.conversation_id
        AND other.profile_id <> NEW.sender_id
        AND sender.allow_friend_messages
        AND recipient.allow_friend_messages
    ) THEN
      RAISE EXCEPTION 'friend messages are disabled' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
