-- ============================================================================
-- Migration 026: Fix recursive RLS on messaging tables
--
-- The SELECT policies for conversation_participants / conversations / messages
-- shipped in migration 017 are self-recursive: they reference
-- conversation_participants from within a USING clause that is itself applied
-- to conversation_participants. For non-admin users this returns no rows
-- (or errors), which causes:
--   * createConversation's "do we already have a thread?" lookup to return
--     empty, spawning duplicate conversations between the same pair of users
--   * the client-side refetch in conversation-thread.tsx to wipe the thread
--     after the first poll
--
-- Fix: replace the recursive checks with a SECURITY DEFINER helper that does
-- a direct lookup against the underlying table, bypassing RLS.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.am_i_in_conversation(conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = conv_id
      AND cp.profile_id = public.get_my_profile_id()
  );
$$;

GRANT EXECUTE ON FUNCTION public.am_i_in_conversation(uuid) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- conversation_participants
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS conv_participants_select ON public.conversation_participants;
CREATE POLICY conv_participants_select ON public.conversation_participants
  FOR SELECT USING (public.am_i_in_conversation(conversation_id));

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS conversations_select_participant ON public.conversations;
CREATE POLICY conversations_select_participant ON public.conversations
  FOR SELECT USING (public.am_i_in_conversation(id));

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS messages_select_participant ON public.messages;
CREATE POLICY messages_select_participant ON public.messages
  FOR SELECT USING (public.am_i_in_conversation(conversation_id));

-- Tighten the INSERT policy too so it uses the helper (was also recursive).
DROP POLICY IF EXISTS messages_insert_participant ON public.messages;
CREATE POLICY messages_insert_participant ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = public.get_my_profile_id()
    AND public.am_i_in_conversation(conversation_id)
  );
