ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_role() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_profile_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_org_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.my_org_tech_profile_ids() SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_profile_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_org_tech_profile_ids() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_org_tech_profile_ids() TO authenticated;

-- Anonymous reads still evaluate public RLS policies that call these helpers.
-- Explicit grants preserve those reads without relying on the implicit PUBLIC grant.
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO anon;
