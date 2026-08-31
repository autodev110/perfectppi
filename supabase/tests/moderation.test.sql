\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'moderation_items', 'moderation_events', 'user_enforcement_actions',
    'moderation_hashes', 'moderation_reports', 'moderation_appeals',
    'moderation_legal_hold_reviewers', 'community_upload_reservations',
    'storage_cleanup_jobs'
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

  IF has_table_privilege('service_role', 'public.moderation_events', 'UPDATE')
     OR has_table_privilege('service_role', 'public.moderation_events', 'DELETE') THEN
    RAISE EXCEPTION 'moderation event log is not append-only';
  END IF;

  IF has_table_privilege('service_role', 'public.moderation_items', 'DELETE') THEN
    RAISE EXCEPTION 'canonical moderation records can be deleted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'community_posts_preserve_legal_hold' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'community_media_preserve_legal_hold' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'legal-hold deletion triggers are missing';
  END IF;
END;
$$;

ROLLBACK;
