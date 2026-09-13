BEGIN;

-- Do not depend on Supabase's environment-specific default table grants. The
-- marketplace RLS policies intentionally support signed-in reads and owner
-- writes, while lifecycle service functions retain privileged access.
REVOKE ALL ON TABLE public.marketplace_listings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketplace_listings TO authenticated;
GRANT ALL ON TABLE public.marketplace_listings TO service_role;

COMMIT;
