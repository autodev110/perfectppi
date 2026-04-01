-- ============================================================================
-- Seed data for local development
-- Run with: supabase db reset
-- ============================================================================

-- Note: In local dev, create users via Supabase Auth UI (localhost:54323)
-- or via the signup flow. The on_auth_user_created trigger will auto-create
-- profiles rows.

-- ============================================================================
-- Admin provisioning helper
-- After creating a user via Supabase Auth UI or signup flow, run:
--   SELECT public.provision_admin('<auth-user-uuid>');
-- This promotes their profile row to role = 'admin'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.provision_admin(p_auth_user_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, display_name, role, is_public)
  VALUES (p_auth_user_id, 'Admin', 'admin', false)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sample organization
INSERT INTO public.organizations (id, name, slug, description)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Autobay Motors',
  'autobay-motors',
  'Full-service automotive inspection and warranty provider'
);
