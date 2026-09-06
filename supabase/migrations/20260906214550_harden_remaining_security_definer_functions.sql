-- Pin every remaining SECURITY DEFINER helper to a trusted schema path and
-- replace PostgreSQL's implicit PUBLIC execution grant with least privilege.

ALTER FUNCTION public.get_warranty_option_user_id(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.can_manage_share_target(public.share_target_type, uuid, uuid, uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.am_i_in_conversation(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_tech_review_aggregates(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.on_technician_review_change()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.is_my_organization(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.is_org_manager_of(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.can_access_submission(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_is_developer()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.set_own_role(public.user_role)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.dev_switch_role(public.user_role)
  SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_warranty_option_user_id(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_share_target(public.share_target_type, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.am_i_in_conversation(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_tech_review_aggregates(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_technician_review_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_my_organization(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_org_manager_of(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_submission(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_is_developer()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_own_role(public.user_role)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dev_switch_role(public.user_role)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_warranty_option_user_id(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_share_target(public.share_target_type, uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.am_i_in_conversation(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_my_organization(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_manager_of(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_submission(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_is_developer()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_own_role(public.user_role)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dev_switch_role(public.user_role)
  TO authenticated;
