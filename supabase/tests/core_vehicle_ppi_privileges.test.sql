\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.vehicles', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.vehicles', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.vehicles', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.vehicles', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated Garage CRUD privileges are incomplete';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.ppi_media', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.ppi_media', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.ppi_media', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated inspection media privileges are incomplete';
  END IF;

  IF has_table_privilege('authenticated', 'public.ppi_answers', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.ppi_answers', 'answer_value', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.ppi_answers', 'deferred_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.ppi_answers', 'prompt', 'UPDATE') THEN
    RAISE EXCEPTION 'inspection answer column privileges are too broad or incomplete';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.vehicles', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.ppi_media', 'INSERT') THEN
    RAISE EXCEPTION 'service role core table privileges are incomplete';
  END IF;
END
$$;

ROLLBACK;
