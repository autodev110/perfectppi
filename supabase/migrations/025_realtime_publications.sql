-- ============================================================================
-- Migration 025: Enable Supabase realtime for messaging + notifications
-- Adds core tables to the `supabase_realtime` publication so postgres_changes
-- subscriptions fire. Safe to re-run (uses conditional add).
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'messages',
    'conversations',
    'conversation_participants',
    'notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
