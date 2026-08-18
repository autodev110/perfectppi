-- ============================================================================
-- Migration: make profiles.role unwritable from the client
--
-- profiles_update_own grants a blanket UPDATE on the caller's own row, with no
-- column restriction. role lives on that row, so until now any authenticated
-- account could promote itself:
--
--   PATCH /rest/v1/profiles?auth_user_id=eq.<self>  {"role":"admin"}
--
-- and land in the admin portal with full RLS access to every table. The app's
-- own upgrade paths relied on that same opening, which is why the policy was
-- written wide in the first place.
--
-- The fix keeps those paths working while closing the hole: role becomes
-- immutable for ordinary callers, and the legitimate transitions move behind
-- SECURITY DEFINER functions that re-check the rules server-side. Those
-- functions run as their owner, so the guard's existing privileged-role escape
-- hatch lets them through without a separate bypass flag.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Guard: role is not self-assignable
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Covers the service-role admin client, migrations, and the SECURITY DEFINER
  -- functions below (inside those, current_user is the function owner).
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  -- Admins manage roles from the admin portal.
  IF public.get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role <> 'consumer' THEN
      RAISE EXCEPTION 'role cannot be self-assigned'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'role cannot be self-assigned; use set_own_role() or dev_switch_role()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_role_change ON public.profiles;
CREATE TRIGGER profiles_guard_role_change
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();

-- ----------------------------------------------------------------------------
-- set_own_role — the ordinary self-serve transitions
--
-- Only roles a caller has actually provisioned can be claimed. The app already
-- creates the technician profile / organization / manager membership before
-- flipping the role; this re-checks that same invariant in the database, so the
-- ordering cannot be skipped by calling the RPC directly.
--
-- admin and developer are deliberately unreachable here.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_own_role(p_role public.user_role)
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_tech    public.technician_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE auth_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_role NOT IN ('consumer', 'technician', 'org_manager') THEN
    RAISE EXCEPTION 'Role % cannot be self-assigned', p_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Matches the pre-existing app rule: admin is provisioned out of band and is
  -- not dropped by walking through the settings page.
  IF v_profile.role = 'admin' THEN
    RAISE EXCEPTION 'Admin role cannot be changed here'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_role = v_profile.role THEN
    RETURN v_profile.role;
  END IF;

  IF p_role IN ('technician', 'org_manager') THEN
    SELECT * INTO v_tech
    FROM public.technician_profiles
    WHERE profile_id = v_profile.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A technician profile is required before claiming the % role', p_role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_role = 'org_manager' THEN
    IF v_tech.organization_id IS NULL THEN
      RAISE EXCEPTION 'An organization is required before claiming the org_manager role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.technician_profile_id = v_tech.id
        AND m.organization_id = v_tech.organization_id
        AND m.role = 'manager'
    ) THEN
      RAISE EXCEPTION 'A manager membership is required before claiming the org_manager role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = v_profile.id;

  RETURN p_role;
END;
$$;

-- ----------------------------------------------------------------------------
-- dev_switch_role — unrestricted switching, gated on the developer grant
--
-- This is what makes the settings switcher a real boundary rather than a UI
-- convention: is_developer is checked in the database, and is_developer itself
-- is not self-grantable (profiles_guard_developer_grant).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dev_switch_role(p_role public.user_role)
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE auth_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT v_profile.is_developer THEN
    RAISE EXCEPTION 'Developer access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = v_profile.id;

  RETURN p_role;
END;
$$;

-- Functions are executable by PUBLIC unless told otherwise, and anon reaches
-- PostgREST too.
REVOKE EXECUTE ON FUNCTION public.set_own_role(public.user_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dev_switch_role(public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_role(public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dev_switch_role(public.user_role) TO authenticated;

-- ----------------------------------------------------------------------------
-- Drop provision_admin
--
-- seed.sql defined it SECURITY DEFINER, which means it ran as its owner no
-- matter who called it — and PostgREST exposes every function in the public
-- schema. Any authenticated user could have called
-- rpc('provision_admin', { p_auth_user_id: <self> }) and become admin. It is
-- dropped here rather than only removed from seed.sql, in case that seed was
-- ever applied to a hosted project.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.provision_admin(uuid);
