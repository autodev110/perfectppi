-- ============================================================================
-- Migration: keep the developer role and the developer grant in step
--
-- 'developer' is the only role whose portal is gated on something other than
-- the role itself, which makes one combination unroutable: role = 'developer'
-- with is_developer = false. requireDeveloper sends such an account to
-- getRoleHomePath('developer') — which is /dev — so it would bounce off its
-- own guard forever.
--
-- Revoking the grant is the only way to reach that state, so it is normalized
-- at the source: dropping the grant also drops the account back to consumer.
-- The app keeps a defensive check for the same case, but nothing should have
-- to rely on it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_profile_developer_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.is_developer
     AND NOT NEW.is_developer
     AND NEW.role = 'developer'
  THEN
    NEW.role := 'consumer';
  END IF;

  RETURN NEW;
END;
$$;

-- Named to sort after profiles_guard_* so the guards evaluate the caller's own
-- intent first; this only normalizes what they already allowed. Revoking the
-- grant is itself restricted to admins and the service role, so the rewrite is
-- never reachable by the account holder.
DROP TRIGGER IF EXISTS profiles_sync_developer_role ON public.profiles;
CREATE TRIGGER profiles_sync_developer_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_developer_role();

-- Repair any row already in the unroutable state.
UPDATE public.profiles
SET role = 'consumer'
WHERE role = 'developer' AND is_developer = false;
