-- Privacy hardening revoked raw profile-table access from client roles, but a
-- handful of older RLS policies still queried profiles directly. PostgreSQL
-- evaluates every applicable permissive policy, so those stale admin/owner
-- checks could make otherwise valid messaging and notification reads fail
-- with "permission denied for table profiles". Use the hardened identity
-- helpers instead of reopening profile-table access.

BEGIN;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = public.get_my_profile_id());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = public.get_my_profile_id())
  WITH CHECK (user_id = public.get_my_profile_id());

DROP POLICY IF EXISTS notifications_admin ON public.notifications;
CREATE POLICY notifications_admin
  ON public.notifications FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS conversations_admin ON public.conversations;
CREATE POLICY conversations_admin
  ON public.conversations FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS conv_participants_admin ON public.conversation_participants;
CREATE POLICY conv_participants_admin
  ON public.conversation_participants FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS messages_admin ON public.messages;
CREATE POLICY messages_admin
  ON public.messages FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS device_tokens_owner_select ON public.device_tokens;
CREATE POLICY device_tokens_owner_select
  ON public.device_tokens FOR SELECT TO authenticated
  USING (profile_id = public.get_my_profile_id());

DROP POLICY IF EXISTS device_tokens_owner_insert ON public.device_tokens;
CREATE POLICY device_tokens_owner_insert
  ON public.device_tokens FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.get_my_profile_id());

DROP POLICY IF EXISTS device_tokens_owner_delete ON public.device_tokens;
CREATE POLICY device_tokens_owner_delete
  ON public.device_tokens FOR DELETE TO authenticated
  USING (profile_id = public.get_my_profile_id());

DROP POLICY IF EXISTS device_tokens_owner_update ON public.device_tokens;
CREATE POLICY device_tokens_owner_update
  ON public.device_tokens FOR UPDATE TO authenticated
  USING (profile_id = public.get_my_profile_id())
  WITH CHECK (profile_id = public.get_my_profile_id());

DROP POLICY IF EXISTS org_memberships_insert_tech_by_manager ON public.organization_memberships;
CREATE POLICY org_memberships_insert_tech_by_manager
  ON public.organization_memberships FOR INSERT TO authenticated
  WITH CHECK (
    role = 'technician'
    AND public.get_my_role() = 'org_manager'
    AND organization_id = public.get_my_org_id()
  );

DROP POLICY IF EXISTS org_memberships_delete_by_manager ON public.organization_memberships;
CREATE POLICY org_memberships_delete_by_manager
  ON public.organization_memberships FOR DELETE TO authenticated
  USING (
    role = 'technician'
    AND public.get_my_role() = 'org_manager'
    AND organization_id = public.get_my_org_id()
  );

CREATE FUNCTION public.social_current_user_can_view_discoverable_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_profile_id
      AND profile.is_public
      AND profile.discoverable
      AND profile.username_state = 'claimed'
      AND public.social_current_user_can_view_profile(profile.id)
  );
$$;

REVOKE ALL ON FUNCTION public.social_current_user_can_view_discoverable_profile(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_current_user_can_view_discoverable_profile(uuid)
  TO authenticated;

DROP POLICY IF EXISTS tech_profiles_select_public ON public.technician_profiles;
CREATE POLICY tech_profiles_select_public
  ON public.technician_profiles FOR SELECT TO authenticated
  USING (public.social_current_user_can_view_discoverable_profile(profile_id));

COMMIT;
