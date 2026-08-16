-- ============================================================================
-- Migration 038: Partner integration — installation codes, connections,
-- individual user links, and external inspection references.
--
-- Three independent, durable mappings (they solve different problems and are
-- deliberately NOT merged):
--
--   1. partner_connections            DealerSpace org  -> Perfect PPI org
--   2. partner_user_links             DealerSpace staff -> Perfect PPI profile
--   3. external_inspection_refs       DealerSpace phase -> Perfect PPI request
--
-- Operational status columns are text + CHECK rather than Postgres enums: these
-- vocabularies grow with the integration and ALTER TYPE ... ADD VALUE is
-- awkward inside migration transactions. Domain enums (migrations 001-009) keep
-- their existing enum style.
--
-- Every table here is internal. RLS is enabled in migration 040.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ============================================================================
-- PARTNER INSTALLATION CODES
-- Short-lived, single-use. Only a hash is stored — the plaintext is shown to
-- the Perfect PPI manager exactly once.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.partner_installation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_system text NOT NULL DEFAULT 'dealerspace',
  -- sha256(code), hex. The plaintext code never touches the database.
  code_hash text NOT NULL UNIQUE,
  -- Non-secret leading fragment, so a manager can tell two codes apart.
  code_prefix text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['inspections:create', 'inspections:read', 'artifacts:read'],
  status text NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_installation_codes_status_check
    CHECK (status IN ('pending', 'consumed', 'revoked')),
  CONSTRAINT partner_installation_codes_source_check
    CHECK (source_system IN ('dealerspace')),
  CONSTRAINT partner_installation_codes_scopes_check
    CHECK (scopes <@ ARRAY['inspections:create', 'inspections:read', 'artifacts:read']
           AND array_length(scopes, 1) > 0)
);

CREATE INDEX IF NOT EXISTS partner_installation_codes_org_idx
  ON public.partner_installation_codes(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_installation_codes_status_idx
  ON public.partner_installation_codes(status)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS partner_installation_codes_updated_at ON public.partner_installation_codes;
CREATE TRIGGER partner_installation_codes_updated_at
  BEFORE UPDATE ON public.partner_installation_codes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- PARTNER CONNECTIONS
-- One row per connected DealerSpace organization. Authorizes all
-- server-to-server traffic in both directions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.partner_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_system text NOT NULL DEFAULT 'dealerspace',
  external_organization_id text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'active',
  scopes text[] NOT NULL,

  -- Bearer credential. Only the hash is persisted; the plaintext token is
  -- returned to DealerSpace exactly once, at exchange/rotation time.
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_last_four text NOT NULL,

  -- Webhook signing secret. Unlike the API token this must be recoverable,
  -- because Perfect PPI signs outbound requests with it — stored as an
  -- application-layer AES-256-GCM envelope, never as plaintext.
  webhook_secret_ciphertext text NOT NULL,
  webhook_secret_key_version integer NOT NULL DEFAULT 1,

  -- Callback destinations are resolved from here, never from request payloads.
  webhook_url text,
  user_link_redirect_uri text,

  installation_code_id uuid REFERENCES public.partner_installation_codes(id) ON DELETE SET NULL,
  connected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  last_verified_at timestamptz,
  credentials_rotated_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT partner_connections_status_check
    CHECK (status IN ('active', 'revoked')),
  CONSTRAINT partner_connections_source_check
    CHECK (source_system IN ('dealerspace')),
  CONSTRAINT partner_connections_scopes_check
    CHECK (scopes <@ ARRAY['inspections:create', 'inspections:read', 'artifacts:read']
           AND array_length(scopes, 1) > 0),
  CONSTRAINT partner_connections_revoked_at_check
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

-- A DealerSpace organization may only have one live connection at a time, and
-- a Perfect PPI organization may only be bound to one live DealerSpace org.
CREATE UNIQUE INDEX IF NOT EXISTS partner_connections_active_external_unique
  ON public.partner_connections(source_system, external_organization_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS partner_connections_active_org_unique
  ON public.partner_connections(organization_id, source_system)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS partner_connections_org_idx
  ON public.partner_connections(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_connections_token_prefix_idx
  ON public.partner_connections(token_prefix);

DROP TRIGGER IF EXISTS partner_connections_updated_at ON public.partner_connections;
CREATE TRIGGER partner_connections_updated_at
  BEFORE UPDATE ON public.partner_connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Late FK: an installation code records which connection consumed it.
ALTER TABLE public.partner_installation_codes
  ADD COLUMN IF NOT EXISTS consumed_connection_id uuid
  REFERENCES public.partner_connections(id) ON DELETE SET NULL;

-- ============================================================================
-- PARTNER USER LINK TRANSACTIONS
-- The OAuth-style authorization handshake that links one DealerSpace staff
-- account to one Perfect PPI account. Short-lived and single-use.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.partner_user_link_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_connection_id uuid NOT NULL
    REFERENCES public.partner_connections(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,
  -- Opaque browser-facing handle. Carries no authority on its own.
  state text NOT NULL UNIQUE,
  -- Snapshot of the connection callback taken at initiation, so a later
  -- connection edit cannot retarget an in-flight authorization.
  redirect_uri text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  authorized_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- sha256(authorization code), hex. Exchanged once for the durable link.
  authorization_code_hash text UNIQUE,
  code_expires_at timestamptz,
  expires_at timestamptz NOT NULL,
  authorized_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_user_link_transactions_status_check
    CHECK (status IN ('pending', 'authorized', 'consumed', 'revoked')),
  CONSTRAINT partner_user_link_transactions_authorized_check
    CHECK (status <> 'authorized' OR authorized_profile_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS partner_user_link_transactions_connection_idx
  ON public.partner_user_link_transactions(partner_connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_user_link_transactions_expiry_idx
  ON public.partner_user_link_transactions(expires_at)
  WHERE status IN ('pending', 'authorized');

DROP TRIGGER IF EXISTS partner_user_link_transactions_updated_at ON public.partner_user_link_transactions;
CREATE TRIGGER partner_user_link_transactions_updated_at
  BEFORE UPDATE ON public.partner_user_link_transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- PARTNER USER LINKS
-- The durable result of the handshake above. Report delivery never depends on
-- this — it is only used to resolve an inspection's assignee.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.partner_user_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_connection_id uuid NOT NULL
    REFERENCES public.partner_connections(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_user_links_status_check
    CHECK (status IN ('active', 'revoked')),
  CONSTRAINT partner_user_links_revoked_at_check
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

-- One live external staff identity maps to exactly one PPI profile...
CREATE UNIQUE INDEX IF NOT EXISTS partner_user_links_active_external_unique
  ON public.partner_user_links(partner_connection_id, external_user_id)
  WHERE status = 'active';

-- ...and one PPI profile is claimed by at most one DealerSpace user per
-- connection, so an accidental double-link is a database error, not a silent
-- misassignment.
CREATE UNIQUE INDEX IF NOT EXISTS partner_user_links_active_profile_unique
  ON public.partner_user_links(partner_connection_id, profile_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS partner_user_links_profile_idx
  ON public.partner_user_links(profile_id);

DROP TRIGGER IF EXISTS partner_user_links_updated_at ON public.partner_user_links;
CREATE TRIGGER partner_user_links_updated_at
  BEFORE UPDATE ON public.partner_user_links
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- EXTERNAL INSPECTION REFERENCES
-- Correlation between a DealerSpace Recon Inspection phase and a Perfect PPI
-- request, plus the immutable vehicle snapshot the inspection was created from.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.external_inspection_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_connection_id uuid NOT NULL
    REFERENCES public.partner_connections(id) ON DELETE CASCADE,
  source_system text NOT NULL DEFAULT 'dealerspace',
  external_organization_id text NOT NULL,
  external_recon_case_id text,
  external_vehicle_id text,
  external_inspection_phase_id text,
  external_actor_id text,

  ppi_request_id uuid NOT NULL UNIQUE
    REFERENCES public.ppi_requests(id) ON DELETE CASCADE,
  current_submission_id uuid
    REFERENCES public.ppi_submissions(id) ON DELETE SET NULL,

  idempotency_key text NOT NULL,
  -- sha256 of the canonicalized create payload. A replay with a materially
  -- different body is a conflict, not an overwrite.
  request_fingerprint text NOT NULL,
  source_label text,
  vehicle_snapshot jsonb NOT NULL,

  integration_status text NOT NULL DEFAULT 'created',
  delivery_status text NOT NULL DEFAULT 'not_requested',
  delivery_version integer NOT NULL DEFAULT 0,
  delivered_output_version integer,
  last_delivery_requested_at timestamptz,
  last_delivered_at timestamptz,
  last_error jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT external_inspection_refs_source_check
    CHECK (source_system IN ('dealerspace')),
  CONSTRAINT external_inspection_refs_integration_status_check
    CHECK (integration_status IN (
      'created', 'assigned', 'accepted', 'in_progress', 'submitted',
      'outputs_generating', 'deliverables_ready', 'outputs_failed',
      'needs_revision', 'cancelled'
    )),
  CONSTRAINT external_inspection_refs_delivery_status_check
    CHECK (delivery_status IN (
      'not_requested', 'queued', 'delivering', 'delivered', 'failed'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS external_inspection_refs_idempotency_unique
  ON public.external_inspection_refs(partner_connection_id, idempotency_key);

CREATE INDEX IF NOT EXISTS external_inspection_refs_connection_idx
  ON public.external_inspection_refs(partner_connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS external_inspection_refs_phase_idx
  ON public.external_inspection_refs(partner_connection_id, external_inspection_phase_id)
  WHERE external_inspection_phase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS external_inspection_refs_submission_idx
  ON public.external_inspection_refs(current_submission_id)
  WHERE current_submission_id IS NOT NULL;

DROP TRIGGER IF EXISTS external_inspection_refs_updated_at ON public.external_inspection_refs;
CREATE TRIGGER external_inspection_refs_updated_at
  BEFORE UPDATE ON public.external_inspection_refs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- SNAPSHOT IMMUTABILITY
--
-- "Later edits in DealerSpace must not silently change an inspection in
-- progress." The snapshot is therefore write-once at the database layer. A
-- future explicit correction endpoint (PATCH .../vehicle) must opt in for the
-- duration of its transaction:
--
--   SELECT set_config('perfectppi.allow_snapshot_correction', 'on', true);
--
-- which makes every accidental overwrite an error and every intentional one a
-- deliberate, greppable act.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_external_inspection_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.vehicle_snapshot IS DISTINCT FROM OLD.vehicle_snapshot
     AND current_setting('perfectppi.allow_snapshot_correction', true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION 'external_inspection_refs.vehicle_snapshot is immutable';
  END IF;

  IF NEW.partner_connection_id IS DISTINCT FROM OLD.partner_connection_id
     OR NEW.ppi_request_id IS DISTINCT FROM OLD.ppi_request_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  THEN
    RAISE EXCEPTION 'external_inspection_refs correlation columns are immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS external_inspection_refs_guard ON public.external_inspection_refs;
CREATE TRIGGER external_inspection_refs_guard
  BEFORE UPDATE ON public.external_inspection_refs
  FOR EACH ROW EXECUTE FUNCTION public.guard_external_inspection_snapshot();

-- ============================================================================
-- PARTNER API RATE LIMIT BUCKETS
-- Fixed-window counters keyed by connection (or by source IP before a
-- connection is resolved). Written only by the service role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.partner_rate_limit_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS partner_rate_limit_buckets_window_idx
  ON public.partner_rate_limit_buckets(window_start);

-- Atomic increment-and-report. Returns the count *after* this request, so the
-- caller compares against its own limit without a read-modify-write race.
CREATE OR REPLACE FUNCTION public.partner_rate_limit_hit(
  p_bucket_key text,
  p_window_start timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.partner_rate_limit_buckets (bucket_key, window_start, request_count)
  VALUES (p_bucket_key, p_window_start, 1)
  ON CONFLICT (bucket_key, window_start) DO UPDATE
    SET request_count = public.partner_rate_limit_buckets.request_count + 1,
        updated_at = now()
  RETURNING request_count INTO v_count;

  RETURN v_count;
END;
$$;

-- Not SECURITY DEFINER, and not reachable by browser clients: only the service
-- role has any privilege on the underlying table.
REVOKE ALL ON FUNCTION public.partner_rate_limit_hit(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_rate_limit_hit(text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_rate_limit_hit(text, timestamptz) TO service_role;
