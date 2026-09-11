BEGIN;

-- Restore the session-bound availability RPC used by middleware and API
-- guards. Production had the dependent functions but not this wrapper.
CREATE OR REPLACE FUNCTION public.social_current_user_is_available()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.social_profile_is_available(public.get_my_profile_id());
$$;

REVOKE ALL ON FUNCTION public.social_current_user_is_available() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_current_user_is_available()
  TO authenticated, service_role;

COMMIT;
