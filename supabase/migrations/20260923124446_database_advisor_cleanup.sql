-- Keep the ubiquitous updated_at trigger independent of caller-controlled
-- schemas. It only touches the trigger row and PostgreSQL's built-in clock.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- The original indexes already have these exact keys. The cursor rollout
-- accidentally added second copies under new names.
DROP INDEX IF EXISTS public.community_post_saves_profile_cursor_idx;
DROP INDEX IF EXISTS public.marketplace_listing_saves_profile_cursor_idx;
