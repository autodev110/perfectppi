-- Phase 1C: purposeful direct messaging and group-member message requests
-- (plan 9.3 and 22.3).

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allow_friend_messages boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_group_message_requests boolean NOT NULL DEFAULT false;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS request_status text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_context_group_id uuid REFERENCES public.community_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_resolved_at timestamptz;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_request_status_check
    CHECK (request_status IN ('pending', 'accepted', 'declined')),
  ADD CONSTRAINT conversations_request_state_check CHECK (
    (request_status = 'pending' AND requested_by IS NOT NULL AND request_context_group_id IS NOT NULL AND request_resolved_at IS NULL)
    OR request_status = 'accepted'
    OR (request_status = 'declined' AND requested_by IS NOT NULL AND request_resolved_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS conversations_message_requests_idx
  ON public.conversations(request_status, requested_by, created_at DESC)
  WHERE request_status = 'pending';

-- Replace the privacy RPC instead of creating an overloaded version. Named
-- calls from existing clients continue to work because the new arguments have
-- defaults.
DROP FUNCTION IF EXISTS public.set_own_social_privacy(
  boolean,
  public.community_post_audience,
  boolean,
  boolean,
  text
);

CREATE FUNCTION public.set_own_social_privacy(
  p_is_public boolean,
  p_default_post_audience public.community_post_audience,
  p_discoverable boolean DEFAULT true,
  p_allow_exact_username_lookup boolean DEFAULT true,
  p_friend_request_policy text DEFAULT NULL,
  p_allow_friend_messages boolean DEFAULT NULL,
  p_allow_group_message_requests boolean DEFAULT NULL
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

  UPDATE public.profiles
  SET is_public = p_is_public,
      default_post_audience = p_default_post_audience,
      discoverable = p_discoverable,
      allow_exact_username_lookup = p_allow_exact_username_lookup,
      friend_request_policy = COALESCE(p_friend_request_policy, friend_request_policy),
      allow_friend_messages = COALESCE(p_allow_friend_messages, allow_friend_messages),
      allow_group_message_requests = COALESCE(p_allow_group_message_requests, allow_group_message_requests)
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
  boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_social_privacy(
  boolean,
  public.community_post_audience,
  boolean,
  boolean,
  text,
  boolean,
  boolean
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
     OR NEW.allow_group_message_requests IS DISTINCT FROM OLD.allow_group_message_requests THEN
    RAISE EXCEPTION 'use set_own_social_privacy()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

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
    IF EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = NEW.conversation_id) THEN
      RAISE EXCEPTION 'message request is awaiting a response' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Direct friend threads honor current friendship and privacy settings on
  -- every send. Marketplace threads, accepted group requests, and legacy
  -- threads have separate access rules and are intentionally excluded.
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

DROP TRIGGER IF EXISTS guard_message_request_insert ON public.messages;
CREATE TRIGGER guard_message_request_insert
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_request_insert();

-- Messaging mutations are server-owned. Reads remain participant-scoped via
-- RLS, while the API applies the pending-request inbox rules.
REVOKE INSERT, UPDATE, DELETE ON public.conversations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_participants FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.messages FROM authenticated;

COMMIT;
