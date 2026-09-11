-- Audit follow-up to the Phase 1C messaging and Phase 2 Vehicle Passport
-- slices.
--
-- 1. Purposeful messaging (22.3) listed friends, marketplace, and group
--    requests, which silently cut off the product's own service contacts:
--    consumers messaging a technician from the directory, technicians and
--    inspection requesters on an assigned PPI, and an organization's manager
--    and technicians. Those are "service" threads: accepted immediately,
--    exempt from the per-send friendship re-check (like marketplace threads),
--    still subject to blocks and availability.
-- 2. The friend-visibility level for vehicles (23.3) was added without
--    updating post visibility, so a car switched to Friends hid its posts from
--    friends and from the owner. Posts now follow the vehicle's visibility.
-- 3. Public vehicle pages are reachable by anonymous visitors from the public
--    marketplace; the visibility helper now answers for a NULL viewer the same
--    way marketplace_visible_listing_ids does.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Conversation contact kind
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN contact_kind text NOT NULL DEFAULT 'legacy'
    CHECK (contact_kind IN ('legacy', 'friend', 'marketplace', 'group_request', 'service'));

UPDATE public.conversations
SET contact_kind = CASE
  WHEN marketplace_listing_id IS NOT NULL THEN 'marketplace'
  WHEN request_context_group_id IS NOT NULL OR request_status <> 'accepted' THEN 'group_request'
  WHEN requested_by IS NULL THEN 'legacy'
  ELSE 'friend'
END;

COMMENT ON COLUMN public.conversations.contact_kind IS
  'Why the pair may talk: legacy (pre-22.3 thread), friend (re-checked on every send), marketplace, group_request, or service (technician directory, assigned inspection, same organization).';

-- Rows created without an explicit kind (service jobs, repairs) are classified
-- the same way the backfill did, so a requested thread never slips past the
-- friend re-check by omission.
CREATE FUNCTION public.derive_conversation_contact_kind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.contact_kind = 'legacy' AND NEW.requested_by IS NOT NULL THEN
    NEW.contact_kind := CASE
      WHEN NEW.marketplace_listing_id IS NOT NULL THEN 'marketplace'
      WHEN NEW.request_context_group_id IS NOT NULL OR NEW.request_status <> 'accepted' THEN 'group_request'
      ELSE 'friend'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversations_derive_contact_kind
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.derive_conversation_contact_kind();
REVOKE ALL ON FUNCTION public.derive_conversation_contact_kind() FROM PUBLIC, anon, authenticated;

-- Service contact: the target is a listed technician with a public profile,
-- the pair share an assigned inspection, or both belong to the same
-- organization. Blocks and availability are checked by the callers.
CREATE FUNCTION public.social_service_contact_allowed(p_actor_id uuid, p_target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_actor_id IS NOT NULL AND p_target_id IS NOT NULL AND p_actor_id <> p_target_id AND (
    EXISTS (
      SELECT 1
      FROM public.technician_profiles technician
      JOIN public.profiles profile ON profile.id = technician.profile_id
      WHERE technician.profile_id = p_target_id AND profile.is_public
    )
    OR EXISTS (
      SELECT 1 FROM public.ppi_requests request
      WHERE (request.requester_id = p_actor_id AND request.assigned_tech_id = p_target_id)
         OR (request.requester_id = p_target_id AND request.assigned_tech_id = p_actor_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.technician_profiles actor_membership
      JOIN public.technician_profiles target_membership
        ON target_membership.organization_id = actor_membership.organization_id
      WHERE actor_membership.profile_id = p_actor_id
        AND target_membership.profile_id = p_target_id
        AND actor_membership.organization_id IS NOT NULL
    )
  );
$$;

-- Same signature as before; the contact kind is derived here so the server
-- keeps one call. Friends win over service when both apply.
CREATE OR REPLACE FUNCTION public.create_direct_conversation_internal(
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
  v_contact_kind text;
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
    v_contact_kind := 'group_request';
  ELSIF p_marketplace_listing_id IS NOT NULL THEN
    IF p_request_context_group_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.marketplace_listings listing
      WHERE listing.id = p_marketplace_listing_id
        AND listing.seller_id = p_target_id
        AND listing.status = 'active'
    ) THEN
      RAISE EXCEPTION 'listing unavailable' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_contact_kind := 'marketplace';
  ELSIF p_request_context_group_id IS NOT NULL THEN
    RAISE EXCEPTION 'friend messages are disabled' USING ERRCODE = 'insufficient_privilege';
  ELSIF EXISTS (
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
    v_contact_kind := 'friend';
  ELSIF public.social_service_contact_allowed(p_actor_id, p_target_id) THEN
    v_contact_kind := 'service';
  ELSE
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
    participant_high_id,
    contact_kind
  ) VALUES (
    p_marketplace_listing_id,
    p_request_status,
    p_actor_id,
    p_request_context_group_id,
    v_low_id,
    v_high_id,
    v_contact_kind
  )
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conversation_id, p_actor_id), (v_conversation_id, p_target_id);

  RETURN QUERY SELECT v_conversation_id, true;
END;
$$;

-- The per-send friendship re-check keys off contact_kind instead of inferring
-- it from NULL columns, so service threads are treated like marketplace ones.
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

  IF v_conversation.request_status = 'accepted' AND v_conversation.contact_kind = 'friend' THEN
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

REVOKE ALL ON FUNCTION public.social_service_contact_allowed(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_service_contact_allowed(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Vehicle visibility: anonymous viewers of public cars, and posts that
--    follow the vehicle's visibility (public → everyone, friends → friends,
--    owner always).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.social_can_view_vehicle(
  p_viewer_id uuid,
  p_vehicle_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vehicles vehicle
    WHERE vehicle.id = p_vehicle_id
      AND vehicle.owner_id IS NOT NULL
      AND (
        vehicle.owner_id = p_viewer_id
        OR (
          vehicle.visibility = 'public'
          AND public.social_profile_is_available(vehicle.owner_id)
          AND (
            p_viewer_id IS NULL
            OR public.social_can_view_profile(p_viewer_id, vehicle.owner_id)
          )
        )
        OR (
          vehicle.visibility = 'friends'
          AND p_viewer_id IS NOT NULL
          AND public.social_can_view_profile(p_viewer_id, vehicle.owner_id)
          AND public.social_profiles_are_friends(p_viewer_id, vehicle.owner_id)
        )
      )
  );
$$;

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

COMMIT;
