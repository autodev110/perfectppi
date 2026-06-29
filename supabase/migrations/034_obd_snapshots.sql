-- ============================================================================
-- Migration 034: OBD-II diagnostic snapshots linked to PPI submissions
-- Stores native mobile OBD scans as structured, auditable diagnostic evidence.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.obd_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_submission_id uuid NOT NULL REFERENCES public.ppi_submissions(id) ON DELETE CASCADE,
  captured_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vin text,
  adapter_name text,
  mil_on boolean,
  stored_dtc_count integer,
  stored_dtcs text[] NOT NULL DEFAULT '{}',
  pending_dtcs text[] NOT NULL DEFAULT '{}',
  supported_pids text[] NOT NULL DEFAULT '{}',
  monitor_status jsonb,
  live_readings jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL,
  raw_transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obd_snapshots_stored_dtc_count_nonnegative
    CHECK (stored_dtc_count IS NULL OR stored_dtc_count >= 0),
  CONSTRAINT obd_snapshots_live_readings_array
    CHECK (jsonb_typeof(live_readings) = 'array'),
  CONSTRAINT obd_snapshots_raw_payload_object
    CHECK (jsonb_typeof(raw_payload) = 'object'),
  CONSTRAINT obd_snapshots_raw_transcript_array
    CHECK (jsonb_typeof(raw_transcript) = 'array')
);

CREATE INDEX IF NOT EXISTS obd_snapshots_submission_created_idx
  ON public.obd_snapshots(ppi_submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS obd_snapshots_current_idx
  ON public.obd_snapshots(ppi_submission_id)
  WHERE is_current = true;

GRANT SELECT, INSERT, UPDATE ON TABLE public.obd_snapshots TO authenticated;

ALTER TABLE public.obd_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS obd_snapshots_select ON public.obd_snapshots;
CREATE POLICY obd_snapshots_select ON public.obd_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_submission(ppi_submission_id)
    OR public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'org_manager'
      AND EXISTS (
        SELECT 1
        FROM public.ppi_submissions s
        WHERE s.id = obd_snapshots.ppi_submission_id
          AND s.performer_id IN (
            SELECT profile_id FROM public.my_org_tech_profile_ids()
          )
      )
    )
  );

DROP POLICY IF EXISTS obd_snapshots_insert_performer ON public.obd_snapshots;
CREATE POLICY obd_snapshots_insert_performer ON public.obd_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    captured_by = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1
      FROM public.ppi_submissions s
      WHERE s.id = obd_snapshots.ppi_submission_id
        AND s.performer_id = public.get_my_profile_id()
        AND s.status IN ('draft', 'in_progress')
    )
  );

DROP POLICY IF EXISTS obd_snapshots_update_performer ON public.obd_snapshots;
CREATE POLICY obd_snapshots_update_performer ON public.obd_snapshots
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ppi_submissions s
      WHERE s.id = obd_snapshots.ppi_submission_id
        AND s.performer_id = public.get_my_profile_id()
        AND s.status IN ('draft', 'in_progress')
    )
  )
  WITH CHECK (
    captured_by = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1
      FROM public.ppi_submissions s
      WHERE s.id = obd_snapshots.ppi_submission_id
        AND s.performer_id = public.get_my_profile_id()
        AND s.status IN ('draft', 'in_progress')
    )
  );

DROP POLICY IF EXISTS obd_snapshots_admin ON public.obd_snapshots;
CREATE POLICY obd_snapshots_admin ON public.obd_snapshots
  FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');
