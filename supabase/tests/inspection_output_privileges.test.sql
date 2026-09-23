BEGIN;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['standardized_outputs', 'vsc_outputs', 'audit_logs'] LOOP
    IF NOT has_table_privilege('service_role', format('public.%I', v_table), 'SELECT, INSERT, UPDATE, DELETE') THEN
      RAISE EXCEPTION 'service_role lacks output-worker privileges on %', v_table;
    END IF;

    IF has_table_privilege('service_role', format('public.%I', v_table), 'TRUNCATE, REFERENCES, TRIGGER') THEN
      RAISE EXCEPTION 'service_role has ownership-level privileges on %', v_table;
    END IF;

    IF NOT has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT, INSERT') THEN
      RAISE EXCEPTION 'authenticated lacks the RLS-governed privileges on %', v_table;
    END IF;

    IF has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE, DELETE') THEN
      RAISE EXCEPTION 'authenticated can mutate append-only table %', v_table;
    END IF;

    IF has_table_privilege('anon', format('public.%I', v_table), 'SELECT, INSERT, UPDATE, DELETE') THEN
      RAISE EXCEPTION 'anon has privileges on protected table %', v_table;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
