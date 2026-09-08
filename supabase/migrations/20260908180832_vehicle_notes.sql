-- Notes must not live on vehicles: public vehicle rows are readable through the
-- Data API, while owner notes are private. RLS protects this separate table.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vehicle_notes (
  vehicle_id uuid PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  notes text NOT NULL CHECK (char_length(notes) <= 5000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_notes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_notes TO authenticated;

DROP POLICY IF EXISTS vehicle_notes_select_owner ON public.vehicle_notes;
CREATE POLICY vehicle_notes_select_owner ON public.vehicle_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE vehicles.id = vehicle_notes.vehicle_id
        AND vehicles.owner_id = public.get_my_profile_id()
    )
  );

DROP POLICY IF EXISTS vehicle_notes_insert_owner ON public.vehicle_notes;
CREATE POLICY vehicle_notes_insert_owner ON public.vehicle_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE vehicles.id = vehicle_notes.vehicle_id
        AND vehicles.owner_id = public.get_my_profile_id()
    )
  );

DROP POLICY IF EXISTS vehicle_notes_update_owner ON public.vehicle_notes;
CREATE POLICY vehicle_notes_update_owner ON public.vehicle_notes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE vehicles.id = vehicle_notes.vehicle_id
        AND vehicles.owner_id = public.get_my_profile_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE vehicles.id = vehicle_notes.vehicle_id
        AND vehicles.owner_id = public.get_my_profile_id()
    )
  );

DROP POLICY IF EXISTS vehicle_notes_delete_owner ON public.vehicle_notes;
CREATE POLICY vehicle_notes_delete_owner ON public.vehicle_notes
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles
      WHERE vehicles.id = vehicle_notes.vehicle_id
        AND vehicles.owner_id = public.get_my_profile_id()
    )
  );

DROP TRIGGER IF EXISTS vehicle_notes_updated_at ON public.vehicle_notes;
CREATE TRIGGER vehicle_notes_updated_at
  BEFORE UPDATE ON public.vehicle_notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Vehicle media uses the same one-time reservation and expiry controls as
-- community media so presigned uploads are rate-limited and reclaimable.
ALTER TABLE public.community_upload_reservations
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS community_upload_reservations_vehicle_idx
  ON public.community_upload_reservations(vehicle_id, created_at DESC)
  WHERE vehicle_id IS NOT NULL;

-- Only one approved vehicle-media item may be primary. Existing moderation
-- states are normalized before adding the database guard.
UPDATE public.vehicle_media
SET is_primary = false
WHERE is_primary = true AND moderation_status <> 'active';

WITH duplicate_primaries AS (
  SELECT id, row_number() OVER (
    PARTITION BY vehicle_id
    ORDER BY uploaded_at DESC, id DESC
  ) AS position
  FROM public.vehicle_media
  WHERE is_primary = true
)
UPDATE public.vehicle_media
SET is_primary = false
FROM duplicate_primaries
WHERE vehicle_media.id = duplicate_primaries.id
  AND duplicate_primaries.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS vehicle_media_one_primary_per_vehicle
  ON public.vehicle_media(vehicle_id)
  WHERE is_primary = true;

DROP POLICY IF EXISTS ppi_requests_delete_requester ON public.ppi_requests;
CREATE POLICY ppi_requests_delete_requester ON public.ppi_requests
  FOR DELETE TO authenticated
  USING (requester_id = public.get_my_profile_id());

COMMIT;
