-- ============================================================================
-- Seed data for local development
-- Run with: supabase db reset
-- ============================================================================

-- Note: In local dev, create users via Supabase Auth UI (localhost:54323)
-- or via the signup flow. The on_auth_user_created trigger will auto-create
-- profiles rows.

-- Sample organization
INSERT INTO public.organizations (id, name, slug, description)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Autobay Motors',
  'autobay-motors',
  'Full-service automotive inspection and warranty provider'
);
