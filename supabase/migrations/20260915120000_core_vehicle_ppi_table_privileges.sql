BEGIN;

-- RLS policies do not grant table access by themselves. These original core
-- tables predate the explicit service-routed privilege model and had lost the
-- CRUD grants their owner/performer policies expect, which blocked Garage
-- edits and inspection media attachment on a freshly migrated database.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_media TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ppi_requests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ppi_submissions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ppi_sections TO authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.ppi_media TO authenticated, service_role;

-- Answers intentionally expose only the mutable response fields to ordinary
-- clients. Prompts, ordering, and validation metadata remain server-managed.
GRANT SELECT, INSERT ON TABLE public.ppi_answers TO authenticated;
REVOKE UPDATE ON TABLE public.ppi_answers FROM authenticated;
GRANT UPDATE (answer_value, deferred_at) ON TABLE public.ppi_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ppi_answers TO service_role;

COMMIT;
