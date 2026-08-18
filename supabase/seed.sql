-- ============================================================================
-- Seed data for local development
-- Run with: supabase db reset
-- ============================================================================

-- Note: In local dev, create users via Supabase Auth UI (localhost:54323)
-- or via the signup flow. The on_auth_user_created trigger will auto-create
-- profiles rows.

-- ============================================================================
-- Admin provisioning
-- After creating a user via Supabase Auth UI or the signup flow, run:
--
--   UPDATE public.profiles SET role = 'admin'
--   WHERE auth_user_id = '<auth-user-uuid>';
--
-- This used to be a SECURITY DEFINER helper, which was a privilege-escalation
-- hole: definer functions run as their owner regardless of caller, and
-- PostgREST exposes everything in the public schema, so any authenticated user
-- could call rpc('provision_admin') on themselves. Migration
-- 20260818130000_harden_profile_role_changes drops it. Do not reintroduce it —
-- run the statement above as postgres from the SQL editor or psql instead.
-- ============================================================================

-- ============================================================================
-- Developer provisioning
-- Grants an account the developer role plus the persistent is_developer grant
-- that lets it switch roles from settings. Deliberately NOT wrapped in a
-- SECURITY DEFINER helper: profiles_guard_developer_grant only lets postgres,
-- supabase_admin, service_role or an existing admin set is_developer, and a
-- definer function would hand that bypass to any authenticated caller over
-- PostgREST. Run it from the SQL editor or psql instead:
--
--   UPDATE public.profiles
--   SET is_developer = true, role = 'developer'
--   WHERE auth_user_id = '<auth-user-uuid>';
-- ============================================================================

-- Sample organization
INSERT INTO public.organizations (id, name, slug, description)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Autobay Motors',
  'autobay-motors',
  'Full-service automotive inspection and warranty provider'
);
