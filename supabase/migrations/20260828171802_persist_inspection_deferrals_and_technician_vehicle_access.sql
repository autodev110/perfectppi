-- Persist "Skip for now" across reloads and let an assigned technician read
-- the private vehicle attached to their inspection. The vehicle policy is
-- deliberately SELECT-only and scoped through the assigned request.

ALTER TABLE public.ppi_answers
  ADD COLUMN IF NOT EXISTS deferred_at timestamptz;

CREATE INDEX IF NOT EXISTS ppi_answers_deferred_at_idx
  ON public.ppi_answers(deferred_at)
  WHERE deferred_at IS NOT NULL;

-- New Supabase projects no longer expose public-schema tables to the Data API
-- by default. These grants provide table-level access; RLS policies below and
-- in the existing schema still decide which rows each user may access.
GRANT SELECT ON public.vehicles, public.ppi_requests TO authenticated;
GRANT SELECT, UPDATE ON public.ppi_answers TO authenticated;

DROP POLICY IF EXISTS vehicles_select_assigned_technician ON public.vehicles;
CREATE POLICY vehicles_select_assigned_technician ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ppi_requests request_row
      WHERE request_row.vehicle_id = vehicles.id
        AND request_row.assigned_tech_id = public.get_my_profile_id()
    )
  );
