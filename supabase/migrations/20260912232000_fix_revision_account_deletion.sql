-- Account deletion anonymizes immutable revision authors through ON DELETE
-- SET NULL. Permit only that nested FK action; all direct mutation stays
-- forbidden and revision evidence remains otherwise byte-for-byte unchanged.
CREATE OR REPLACE FUNCTION public.prevent_moderation_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
     AND pg_trigger_depth() > 1
     AND OLD.author_id IS NOT NULL
     AND NEW.author_id IS NULL
     AND (to_jsonb(NEW) - 'author_id') = (to_jsonb(OLD) - 'author_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'moderation history is immutable';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_moderation_history_mutation() FROM PUBLIC, anon, authenticated;
