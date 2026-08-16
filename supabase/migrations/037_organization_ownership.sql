-- ============================================================================
-- Migration 037: Organization-owned vehicles + organization-requested PPIs
--
-- Incoming partner (DealerSpace) inspections belong to a dealership, not to a
-- consumer. Rather than inventing a synthetic user to satisfy the existing
-- NOT NULL foreign keys, ownership becomes a two-path model:
--
--   vehicles      : owner_id XOR organization_id
--   ppi_requests  : requester_id XOR requesting_organization_id
--
-- Existing consumer rows keep owner_id / requester_id and are unaffected.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ============================================================================
-- VEHICLES
-- ============================================================================

ALTER TABLE public.vehicles ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_ownership_path_check'
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_ownership_path_check
      CHECK (num_nonnulls(owner_id, organization_id) = 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vehicles_organization
  ON public.vehicles(organization_id)
  WHERE organization_id IS NOT NULL;

-- Mirror of idx_vehicles_owner_vin_unique (migration 028) for the org path, so
-- "create or reuse an organization-owned vehicle" is enforced by the database
-- and not just by application lookup.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_org_vin_unique
  ON public.vehicles(organization_id, upper(btrim(vin)))
  WHERE organization_id IS NOT NULL AND vin IS NOT NULL AND btrim(vin) <> '';

-- ============================================================================
-- PPI REQUESTS
-- ============================================================================

ALTER TABLE public.ppi_requests ALTER COLUMN requester_id DROP NOT NULL;

ALTER TABLE public.ppi_requests
  ADD COLUMN IF NOT EXISTS requesting_organization_id uuid
  REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- Low-cardinality source marker so queues and badges do not need to join the
-- correlation table. All external identifiers live in external_inspection_refs.
ALTER TABLE public.ppi_requests
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'perfectppi';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ppi_requests_requester_path_check'
  ) THEN
    ALTER TABLE public.ppi_requests
      ADD CONSTRAINT ppi_requests_requester_path_check
      CHECK (num_nonnulls(requester_id, requesting_organization_id) = 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ppi_requests_source_system_check'
  ) THEN
    ALTER TABLE public.ppi_requests
      ADD CONSTRAINT ppi_requests_source_system_check
      CHECK (source_system IN ('perfectppi', 'dealerspace'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ppi_requests_requesting_org_idx
  ON public.ppi_requests(requesting_organization_id, created_at DESC)
  WHERE requesting_organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ppi_requests_source_system_idx
  ON public.ppi_requests(source_system)
  WHERE source_system <> 'perfectppi';

-- ============================================================================
-- TENANCY HELPERS
--
-- SECURITY DEFINER is required to read technician_profiles/profiles without
-- recursing into their own RLS policies (same reason as migration 015). Each
-- helper pins search_path and answers a single yes/no authorization question
-- about the *calling* user — none of them accept a caller-supplied identity.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_my_organization(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT target_org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.technician_profiles tp
      JOIN public.profiles p ON p.id = tp.profile_id
      WHERE p.auth_user_id = auth.uid()
        AND tp.organization_id = target_org_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_org_manager_of(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.get_my_role() = 'org_manager'
     AND public.is_my_organization(target_org_id);
$$;

REVOKE ALL ON FUNCTION public.is_my_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_manager_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_manager_of(uuid) TO authenticated;

-- ============================================================================
-- can_access_submission — organization path
--
-- Organization-requested submissions have no consumer requester, so the
-- existing performer/requester test would deny the managers who own the work.
-- Replaced in place (no DROP) because migration 019 created it with CASCADE and
-- several policies depend on it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_access_submission(submission_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ppi_submissions s
    JOIN public.ppi_requests r ON r.id = s.ppi_request_id
    WHERE s.id = submission_id
      AND (
        s.performer_id = public.get_my_profile_id()
        OR r.requester_id = public.get_my_profile_id()
        OR (
          r.requesting_organization_id IS NOT NULL
          AND public.is_org_manager_of(r.requesting_organization_id)
        )
      )
  )
$$;

-- ============================================================================
-- IMMUTABLE TENANCY COLUMNS
--
-- The existing ppi_requests_update_tech / vehicles_update_own policies only
-- constrain *who* may update a row, not *which* columns. Now that a row carries
-- a tenant, an assigned technician could otherwise repoint a request at another
-- organization. Ownership is set once, at insert, by the server.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_ppi_request_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.requesting_organization_id IS DISTINCT FROM OLD.requesting_organization_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.source_system IS DISTINCT FROM OLD.source_system
  THEN
    RAISE EXCEPTION 'ppi_requests ownership columns are immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ppi_requests_guard_tenancy ON public.ppi_requests;
CREATE TRIGGER ppi_requests_guard_tenancy
  BEFORE UPDATE ON public.ppi_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_ppi_request_tenancy();

CREATE OR REPLACE FUNCTION public.guard_vehicle_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  THEN
    RAISE EXCEPTION 'vehicles ownership columns are immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicles_guard_tenancy ON public.vehicles;
CREATE TRIGGER vehicles_guard_tenancy
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_tenancy();

-- ============================================================================
-- RLS — organization read paths
--
-- Writes to organization-owned rows stay server-side (partner API, service
-- role). Clients only ever read them.
-- ============================================================================

DROP POLICY IF EXISTS vehicles_select_org ON public.vehicles;
CREATE POLICY vehicles_select_org ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.is_my_organization(organization_id)
  );

-- Managers see every inspection their organization requested, including the
-- pending/assigned ones that have no submission yet.
DROP POLICY IF EXISTS ppi_requests_select_org_owner ON public.ppi_requests;
CREATE POLICY ppi_requests_select_org_owner ON public.ppi_requests
  FOR SELECT TO authenticated
  USING (
    requesting_organization_id IS NOT NULL
    AND public.is_org_manager_of(requesting_organization_id)
  );

-- Submissions against an organization-requested inspection follow the same rule.
DROP POLICY IF EXISTS ppi_submissions_select_org_owner ON public.ppi_submissions;
CREATE POLICY ppi_submissions_select_org_owner ON public.ppi_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ppi_requests r
      WHERE r.id = ppi_submissions.ppi_request_id
        AND r.requesting_organization_id IS NOT NULL
        AND public.is_org_manager_of(r.requesting_organization_id)
    )
  );
