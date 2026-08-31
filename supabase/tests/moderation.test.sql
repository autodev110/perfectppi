\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'moderation_items', 'moderation_events', 'user_enforcement_actions',
    'moderation_hashes', 'moderation_reports', 'moderation_appeals'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on %', table_name;
    END IF;

    IF has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'SELECT') THEN
      RAISE EXCEPTION '% exposes moderation data to a public API role', table_name;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.community_posts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.community_comments', 'INSERT')
     OR has_table_privilege('authenticated', 'public.community_post_media', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated clients can bypass server moderation';
  END IF;
END;
$$;

ROLLBACK;
