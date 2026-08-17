-- ============================================================================
-- Migration: permanent DTCs and emissions readiness monitors on OBD snapshots.
--
-- Two additions that exist specifically to catch a vehicle whose fault history
-- was wiped shortly before inspection:
--
--   permanent_dtcs      Mode 0A. Cannot be cleared by disconnecting the
--                       battery — the ECU erases them only after the repair is
--                       confirmed over several drive cycles. A car with no
--                       stored codes but live permanent codes has been reset,
--                       not repaired.
--
--   readiness_monitors  Decoded from the Mode 01 PID 01 status bytes the
--                       snapshot already captured raw. Clearing codes resets
--                       these to "not complete", so several incomplete monitors
--                       is the same signal from the other direction.
--
-- Both default to empty so existing rows stay valid and older app builds that
-- do not send these fields keep working unchanged.
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE public.obd_snapshots
  ADD COLUMN IF NOT EXISTS permanent_dtcs text[] NOT NULL DEFAULT '{}';

-- Array of { name, isContinuous, supported, complete }.
ALTER TABLE public.obd_snapshots
  ADD COLUMN IF NOT EXISTS readiness_monitors jsonb NOT NULL DEFAULT '[]';

ALTER TABLE public.obd_snapshots
  ADD COLUMN IF NOT EXISTS raw_permanent_dtcs_response text;

-- Denormalized count of supported-but-incomplete monitors. Stored rather than
-- derived so a report or a queue can flag "not test-ready" without unpacking
-- the jsonb on every read.
ALTER TABLE public.obd_snapshots
  ADD COLUMN IF NOT EXISTS incomplete_monitor_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'obd_snapshots_incomplete_monitor_count_check'
  ) THEN
    ALTER TABLE public.obd_snapshots
      ADD CONSTRAINT obd_snapshots_incomplete_monitor_count_check
      CHECK (incomplete_monitor_count >= 0);
  END IF;
END $$;

-- Finds inspections whose emissions result is not meaningful yet.
CREATE INDEX IF NOT EXISTS obd_snapshots_incomplete_monitors_idx
  ON public.obd_snapshots(ppi_submission_id)
  WHERE incomplete_monitor_count > 0;
