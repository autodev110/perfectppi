-- ============================================================================
-- Migration 040: RLS for the partner integration tables.
--
-- Posture: every new table has RLS enabled. Tables that hold credentials or
-- worker plumbing get NO policies at all, so anon/authenticated read nothing
-- even though PostgREST exposes the schema; the application reaches them only
-- through server-side code that has already authorized the caller. Privileges
-- are additionally revoked from anon/authenticated so a future policy added by
-- mistake still cannot leak a secret.
--
-- Tables that carry no secrets (inspection correlation, artifacts metadata, job
-- status, outbound events) get narrow read policies so the technician and the
-- organization manager can see their own work without a service-role detour.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ============================================================================
-- CREDENTIAL + PLUMBING TABLES — no policies, no client privileges
-- ============================================================================

ALTER TABLE public.partner_installation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_user_link_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_delivery_attempts ENABLE ROW LEVEL SECURITY;

-- Belt and braces: Supabase's default privileges grant CRUD on new public
-- tables to anon/authenticated. RLS already denies them (no policies), but a
-- table holding a token hash and an encrypted signing secret should not be
-- reachable at all.
REVOKE ALL ON public.partner_installation_codes FROM anon, authenticated;
REVOKE ALL ON public.partner_connections FROM anon, authenticated;
REVOKE ALL ON public.partner_user_link_transactions FROM anon, authenticated;
REVOKE ALL ON public.partner_rate_limit_buckets FROM anon, authenticated;
REVOKE ALL ON public.webhook_delivery_attempts FROM anon, authenticated;

-- Privileges are granted explicitly rather than inherited from the project's
-- default privileges, which differ between a hosted project and a local
-- `supabase start` image. A SELECT policy only means anything if the role also
-- holds the table privilege, and the two should be visible in the same place.
--
-- service_role drives every write here (partner API routes, workers, server
-- actions) and bypasses RLS, so it is granted outright; anon and authenticated
-- get read-only access on the non-secret tables and nothing at all on the rest.

GRANT ALL ON public.partner_installation_codes TO service_role;
GRANT ALL ON public.partner_connections TO service_role;
GRANT ALL ON public.partner_user_link_transactions TO service_role;
GRANT ALL ON public.partner_user_links TO service_role;
GRANT ALL ON public.partner_rate_limit_buckets TO service_role;
GRANT ALL ON public.external_inspection_refs TO service_role;
GRANT ALL ON public.integration_artifacts TO service_role;
GRANT ALL ON public.output_generation_jobs TO service_role;
GRANT ALL ON public.outbound_events TO service_role;
GRANT ALL ON public.webhook_delivery_attempts TO service_role;

-- ============================================================================
-- PARTNER USER LINKS
-- A technician may see (and therefore revoke, via a server action) their own
-- link. Nobody else reads this table from a browser session.
-- ============================================================================

ALTER TABLE public.partner_user_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partner_user_links FROM anon, authenticated;
GRANT SELECT ON public.partner_user_links TO authenticated;

DROP POLICY IF EXISTS partner_user_links_select_own ON public.partner_user_links;
CREATE POLICY partner_user_links_select_own ON public.partner_user_links
  FOR SELECT TO authenticated
  USING (profile_id = public.get_my_profile_id());

-- ============================================================================
-- EXTERNAL INSPECTION REFS
-- Holds correlation identifiers and the vehicle snapshot — no secrets.
-- Readable by the assigned technician and by managers of the organization the
-- inspection was requested for. Never by another organization: every path goes
-- through ppi_requests, whose tenancy columns are immutable (migration 037).
-- ============================================================================

ALTER TABLE public.external_inspection_refs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.external_inspection_refs FROM anon, authenticated;
GRANT SELECT ON public.external_inspection_refs TO authenticated;

DROP POLICY IF EXISTS external_inspection_refs_select_assigned_tech ON public.external_inspection_refs;
CREATE POLICY external_inspection_refs_select_assigned_tech ON public.external_inspection_refs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ppi_requests r
      WHERE r.id = external_inspection_refs.ppi_request_id
        AND r.assigned_tech_id = public.get_my_profile_id()
    )
  );

DROP POLICY IF EXISTS external_inspection_refs_select_org_manager ON public.external_inspection_refs;
CREATE POLICY external_inspection_refs_select_org_manager ON public.external_inspection_refs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ppi_requests r
      WHERE r.id = external_inspection_refs.ppi_request_id
        AND r.requesting_organization_id IS NOT NULL
        AND public.is_org_manager_of(r.requesting_organization_id)
    )
  );

DROP POLICY IF EXISTS external_inspection_refs_select_admin ON public.external_inspection_refs;
CREATE POLICY external_inspection_refs_select_admin ON public.external_inspection_refs
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================================
-- INTEGRATION ARTIFACTS
-- Metadata only (type, size, checksum, storage key). The bytes themselves are
-- served by authenticated routes, never by a public URL.
-- ============================================================================

ALTER TABLE public.integration_artifacts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.integration_artifacts FROM anon, authenticated;
GRANT SELECT ON public.integration_artifacts TO authenticated;

DROP POLICY IF EXISTS integration_artifacts_select ON public.integration_artifacts;
CREATE POLICY integration_artifacts_select ON public.integration_artifacts
  FOR SELECT TO authenticated
  USING (public.can_access_submission(ppi_submission_id));

DROP POLICY IF EXISTS integration_artifacts_select_org_manager ON public.integration_artifacts;
CREATE POLICY integration_artifacts_select_org_manager ON public.integration_artifacts
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() = 'org_manager'
    AND EXISTS (
      SELECT 1 FROM public.ppi_submissions s
      WHERE s.id = integration_artifacts.ppi_submission_id
        AND s.performer_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
    )
  );

DROP POLICY IF EXISTS integration_artifacts_select_admin ON public.integration_artifacts;
CREATE POLICY integration_artifacts_select_admin ON public.integration_artifacts
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================================
-- OUTPUT GENERATION JOBS
-- Read-only status for the "generating / failed / retry" UI. Claiming, retrying
-- and completing all happen through service-role code paths.
-- ============================================================================

ALTER TABLE public.output_generation_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.output_generation_jobs FROM anon, authenticated;
GRANT SELECT ON public.output_generation_jobs TO authenticated;

DROP POLICY IF EXISTS output_generation_jobs_select ON public.output_generation_jobs;
CREATE POLICY output_generation_jobs_select ON public.output_generation_jobs
  FOR SELECT TO authenticated
  USING (public.can_access_submission(ppi_submission_id));

DROP POLICY IF EXISTS output_generation_jobs_select_org_manager ON public.output_generation_jobs;
CREATE POLICY output_generation_jobs_select_org_manager ON public.output_generation_jobs
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() = 'org_manager'
    AND EXISTS (
      SELECT 1 FROM public.ppi_submissions s
      WHERE s.id = output_generation_jobs.ppi_submission_id
        AND s.performer_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
    )
  );

DROP POLICY IF EXISTS output_generation_jobs_select_admin ON public.output_generation_jobs;
CREATE POLICY output_generation_jobs_select_admin ON public.output_generation_jobs
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================================
-- OUTBOUND EVENTS
-- Delivery status for the Send-to-DealerSpace UI. The payload is event
-- metadata only; signatures and secrets live nowhere near this row.
-- ============================================================================

ALTER TABLE public.outbound_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.outbound_events FROM anon, authenticated;
GRANT SELECT ON public.outbound_events TO authenticated;

DROP POLICY IF EXISTS outbound_events_select_via_ref ON public.outbound_events;
CREATE POLICY outbound_events_select_via_ref ON public.outbound_events
  FOR SELECT TO authenticated
  USING (
    external_inspection_ref_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.external_inspection_refs ref
      JOIN public.ppi_requests r ON r.id = ref.ppi_request_id
      WHERE ref.id = outbound_events.external_inspection_ref_id
        AND (
          r.assigned_tech_id = public.get_my_profile_id()
          OR (
            r.requesting_organization_id IS NOT NULL
            AND public.is_org_manager_of(r.requesting_organization_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS outbound_events_select_admin ON public.outbound_events;
CREATE POLICY outbound_events_select_admin ON public.outbound_events
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================================
-- VERIFICATION HELPER
-- Fails the migration loudly if any table added by this integration is left
-- without RLS, rather than shipping a silently open table.
-- ============================================================================

DO $$
DECLARE
  unprotected text;
BEGIN
  SELECT string_agg(c.relname, ', ')
  INTO unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
    AND c.relname IN (
      'partner_installation_codes',
      'partner_connections',
      'partner_user_link_transactions',
      'partner_user_links',
      'partner_rate_limit_buckets',
      'external_inspection_refs',
      'integration_artifacts',
      'output_generation_jobs',
      'outbound_events',
      'webhook_delivery_attempts'
    );

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'Partner integration tables missing RLS: %', unprotected;
  END IF;
END $$;
