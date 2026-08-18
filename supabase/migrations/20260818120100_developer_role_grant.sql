-- ============================================================================
-- Migration: developer role support
--
-- The switcher works by actually rewriting profiles.role. Every guard, sidebar
-- and RLS policy in the app reads that column, so a developer viewing the
-- technician portal is a technician as far as the whole stack is concerned —
-- no shadow "acting as" state to keep in sync, and no policy that has to learn
-- about developers.
--
-- That leaves one problem: once role flips to 'consumer' there is nothing left
-- to say the account may switch back. is_developer is that grant. It is
-- separate from role, survives every switch, and cannot be handed out by the
-- account holder.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_developer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_developer IS
  'Persistent grant allowing this account to switch its own role between all '
  'roles from settings. Independent of role, which changes as the developer '
  'switches. Only admins or the service role can set it.';

-- Developer accounts are a handful at most; a partial index keeps the lookup
-- cheap without carrying an entry for every ordinary profile.
CREATE INDEX IF NOT EXISTS idx_profiles_is_developer
  ON public.profiles(is_developer) WHERE is_developer = true;

-- ----------------------------------------------------------------------------
-- Guard: is_developer is not self-grantable
--
-- profiles_update_own lets an account update its own row, which is what makes
-- one-click switching possible in the first place. The grant itself has to sit
-- outside that reach, or "developer" would be something any user could award
-- themselves.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_developer_grant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_developer THEN
      RAISE EXCEPTION 'is_developer cannot be self-granted';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_developer IS DISTINCT FROM OLD.is_developer
     AND public.get_my_role() <> 'admin'
  THEN
    RAISE EXCEPTION 'is_developer cannot be self-granted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_developer_grant ON public.profiles;
CREATE TRIGGER profiles_guard_developer_grant
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_developer_grant();

-- ----------------------------------------------------------------------------
-- Helper: is the caller a developer?
--
-- SECURITY DEFINER so policies and future callers can read the grant without a
-- recursive trip through profiles RLS, matching get_my_role/get_my_profile_id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_is_developer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT is_developer FROM public.profiles WHERE auth_user_id = auth.uid()),
    false
  );
$$;

-- ----------------------------------------------------------------------------
-- Granting the role
--
-- There is no in-app path to this by design. Run it against the database for
-- the accounts that should have it:
--
--   UPDATE public.profiles SET is_developer = true, role = 'developer'
--   WHERE auth_user_id = (SELECT id FROM auth.users WHERE email = 'you@example.com');
--
-- To revoke, set is_developer = false and put role back to whatever the account
-- should actually be.
-- ----------------------------------------------------------------------------
