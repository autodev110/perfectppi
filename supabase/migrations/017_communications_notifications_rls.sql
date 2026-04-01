-- ============================================================================
-- Migration 017: RLS for notifications, conversations, messages
-- Inlines profile/role lookups to avoid dependency on 015 helper functions
-- ============================================================================

-- NOTIFICATIONS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY notifications_admin ON public.notifications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select_participant ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      JOIN public.profiles p ON p.id = cp.profile_id
      WHERE cp.conversation_id = conversations.id
        AND p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY conversations_insert_authenticated ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY conversations_admin ON public.conversations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- CONVERSATION PARTICIPANTS
-- ============================================================================
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY conv_participants_select ON public.conversation_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp2
      JOIN public.profiles p ON p.id = cp2.profile_id
      WHERE cp2.conversation_id = conversation_participants.conversation_id
        AND p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY conv_participants_insert ON public.conversation_participants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY conv_participants_admin ON public.conversation_participants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- MESSAGES
-- ============================================================================
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select_participant ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      JOIN public.profiles p ON p.id = cp.profile_id
      WHERE cp.conversation_id = messages.conversation_id
        AND p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY messages_insert_participant ON public.messages
  FOR INSERT WITH CHECK (
    sender_id IN (
      SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      JOIN public.profiles p ON p.id = cp.profile_id
      WHERE cp.conversation_id = messages.conversation_id
        AND p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY messages_admin ON public.messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );
