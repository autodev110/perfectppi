-- ============================================================================
-- Migration 020: Schema amendments + RLS for output & audit tables
-- Covers: standardized_outputs, vsc_outputs, audit_logs
-- Idempotent: safe to re-run
-- ============================================================================

-- ============================================================================
-- SCHEMA AMENDMENTS
-- ============================================================================

-- Make document_url nullable (PDF generation deferred; structured JSON stored instead)
ALTER TABLE public.standardized_outputs ALTER COLUMN document_url DROP NOT NULL;

-- Add structured_content column for the AI-generated JSON report
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'standardized_outputs'
      AND column_name = 'structured_content'
  ) THEN
    ALTER TABLE public.standardized_outputs ADD COLUMN structured_content jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- Unique constraint on (ppi_submission_id, version) to prevent race conditions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'standardized_outputs_submission_version_unique'
  ) THEN
    ALTER TABLE public.standardized_outputs
      ADD CONSTRAINT standardized_outputs_submission_version_unique
      UNIQUE (ppi_submission_id, version);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vsc_outputs_submission_version_unique'
  ) THEN
    ALTER TABLE public.vsc_outputs
      ADD CONSTRAINT vsc_outputs_submission_version_unique
      UNIQUE (ppi_submission_id, version);
  END IF;
END $$;

-- ============================================================================
-- STANDARDIZED OUTPUTS RLS
-- ============================================================================
ALTER TABLE public.standardized_outputs ENABLE ROW LEVEL SECURITY;

-- Anyone who can access the parent submission can SELECT the output
DROP POLICY IF EXISTS standardized_outputs_select ON public.standardized_outputs;
CREATE POLICY standardized_outputs_select ON public.standardized_outputs
  FOR SELECT USING (public.can_access_submission(ppi_submission_id));

-- Admin INSERT only (table remains immutable after insert)
DROP POLICY IF EXISTS standardized_outputs_admin ON public.standardized_outputs;
DROP POLICY IF EXISTS standardized_outputs_insert_admin ON public.standardized_outputs;
CREATE POLICY standardized_outputs_insert_admin ON public.standardized_outputs
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

-- No UPDATE or DELETE policies (INSERT-only table)
-- INSERTs happen via service role (admin client), which bypasses RLS

-- ============================================================================
-- VSC OUTPUTS RLS
-- ============================================================================
ALTER TABLE public.vsc_outputs ENABLE ROW LEVEL SECURITY;

-- Anyone who can access the parent submission can SELECT the output
DROP POLICY IF EXISTS vsc_outputs_select ON public.vsc_outputs;
CREATE POLICY vsc_outputs_select ON public.vsc_outputs
  FOR SELECT USING (public.can_access_submission(ppi_submission_id));

-- Admin INSERT only (table remains immutable after insert)
DROP POLICY IF EXISTS vsc_outputs_admin ON public.vsc_outputs;
DROP POLICY IF EXISTS vsc_outputs_insert_admin ON public.vsc_outputs;
CREATE POLICY vsc_outputs_insert_admin ON public.vsc_outputs
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

-- ============================================================================
-- AUDIT LOGS RLS
-- ============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin can SELECT all audit logs
DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_admin ON public.audit_logs
  FOR SELECT USING (public.get_my_role() = 'admin');

-- Admin INSERT only (append-only audit table)
DROP POLICY IF EXISTS audit_logs_admin ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_admin ON public.audit_logs;
CREATE POLICY audit_logs_insert_admin ON public.audit_logs
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
