BEGIN;

-- ============================================================================
-- Build progression (Renditions doc): stages, labor and cost, photos,
-- documents, install mileage, before/after specifications.
--
-- Stages group build entries into a progression ("Stage 1: bolt-ons"). Costs,
-- labor, documents, and private notes never leave the owner; photos are the
-- vehicle's own moderated media, so nothing new reaches the public without
-- passing the existing media pipeline.
-- ============================================================================

CREATE TABLE public.vehicle_build_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  status public.vehicle_build_stage_status NOT NULL DEFAULT 'planned',
  target_date date,
  completed_on date,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CHECK (description IS NULL OR char_length(description) <= 2000),
  CHECK (position >= 0),
  CHECK ((status = 'complete') = (completed_on IS NOT NULL))
);

CREATE INDEX vehicle_build_stages_vehicle_idx
  ON public.vehicle_build_stages(vehicle_id, position, created_at);

ALTER TABLE public.vehicle_build_entries
  ADD COLUMN stage_id uuid REFERENCES public.vehicle_build_stages(id) ON DELETE SET NULL,
  ADD COLUMN labor_cents integer,
  ADD COLUMN labor_hours numeric(6,1),
  ADD COLUMN before_spec text,
  ADD COLUMN after_spec text,
  ADD CONSTRAINT vehicle_build_entries_labor_cents_check CHECK (labor_cents IS NULL OR labor_cents >= 0),
  ADD CONSTRAINT vehicle_build_entries_labor_hours_check CHECK (labor_hours IS NULL OR labor_hours >= 0),
  ADD CONSTRAINT vehicle_build_entries_before_spec_check CHECK (before_spec IS NULL OR char_length(btrim(before_spec)) BETWEEN 1 AND 300),
  ADD CONSTRAINT vehicle_build_entries_after_spec_check CHECK (after_spec IS NULL OR char_length(btrim(after_spec)) BETWEEN 1 AND 300);

CREATE INDEX vehicle_build_entries_stage_idx
  ON public.vehicle_build_entries(stage_id)
  WHERE stage_id IS NOT NULL;

-- Entry photos are references to the vehicle's own media rows.
CREATE TABLE public.vehicle_build_entry_photos (
  entry_id uuid NOT NULL REFERENCES public.vehicle_build_entries(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.vehicle_media(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, media_id),
  CHECK (position >= 0)
);

CREATE INDEX vehicle_build_entry_photos_media_idx
  ON public.vehicle_build_entry_photos(media_id);

-- Private documents (receipts, invoices, dyno sheets). Never public.
CREATE TABLE public.vehicle_build_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.vehicle_build_entries(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.vehicle_build_stages(id) ON DELETE CASCADE,
  kind public.vehicle_build_document_kind NOT NULL DEFAULT 'other',
  title text NOT NULL,
  storage_reference text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CHECK (storage_reference ~ '^r2-private:///vehicle_document/[0-9a-f-]+/[0-9a-f-]+/[a-zA-Z0-9._-]+$'),
  CHECK (size_bytes BETWEEN 1 AND 26214400),
  CHECK (entry_id IS NOT NULL OR stage_id IS NOT NULL)
);

CREATE INDEX vehicle_build_documents_vehicle_idx
  ON public.vehicle_build_documents(vehicle_id, created_at DESC);
CREATE INDEX vehicle_build_documents_entry_idx
  ON public.vehicle_build_documents(entry_id) WHERE entry_id IS NOT NULL;
CREATE INDEX vehicle_build_documents_stage_idx
  ON public.vehicle_build_documents(stage_id) WHERE stage_id IS NOT NULL;

ALTER TABLE public.vehicle_build_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_build_entry_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_build_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_build_stages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vehicle_build_entry_photos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vehicle_build_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_build_stages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_build_entry_photos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_build_documents TO service_role;

-- Stages and documents belong to the vehicle's owner, like entries.
CREATE TRIGGER vehicle_build_stages_guard_owner
  BEFORE INSERT OR UPDATE OF vehicle_id, owner_id
  ON public.vehicle_build_stages
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_timeline_owner();
CREATE TRIGGER vehicle_build_documents_guard_owner
  BEFORE INSERT OR UPDATE OF vehicle_id, owner_id
  ON public.vehicle_build_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_timeline_owner();
CREATE TRIGGER vehicle_build_stages_updated_at
  BEFORE UPDATE ON public.vehicle_build_stages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- An entry's stage, a document's entry/stage, and an entry photo must all
-- belong to the same vehicle; a photo must also be approved media.
CREATE FUNCTION public.guard_vehicle_build_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_vehicle_id uuid;
  v_media_status text;
  v_media_vehicle uuid;
BEGIN
  IF TG_TABLE_NAME = 'vehicle_build_entries' THEN
    IF NEW.stage_id IS NOT NULL THEN
      SELECT stage.vehicle_id INTO v_vehicle_id FROM public.vehicle_build_stages stage WHERE stage.id = NEW.stage_id;
      IF v_vehicle_id IS DISTINCT FROM NEW.vehicle_id THEN
        RAISE EXCEPTION 'build stage belongs to another vehicle' USING ERRCODE = 'foreign_key_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'vehicle_build_documents' THEN
    IF NEW.entry_id IS NOT NULL THEN
      SELECT entry.vehicle_id INTO v_vehicle_id FROM public.vehicle_build_entries entry WHERE entry.id = NEW.entry_id;
      IF v_vehicle_id IS DISTINCT FROM NEW.vehicle_id THEN
        RAISE EXCEPTION 'build entry belongs to another vehicle' USING ERRCODE = 'foreign_key_violation';
      END IF;
    END IF;
    IF NEW.stage_id IS NOT NULL THEN
      SELECT stage.vehicle_id INTO v_vehicle_id FROM public.vehicle_build_stages stage WHERE stage.id = NEW.stage_id;
      IF v_vehicle_id IS DISTINCT FROM NEW.vehicle_id THEN
        RAISE EXCEPTION 'build stage belongs to another vehicle' USING ERRCODE = 'foreign_key_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- vehicle_build_entry_photos
  SELECT entry.vehicle_id INTO v_vehicle_id FROM public.vehicle_build_entries entry WHERE entry.id = NEW.entry_id;
  SELECT media.vehicle_id, media.moderation_status INTO v_media_vehicle, v_media_status
  FROM public.vehicle_media media WHERE media.id = NEW.media_id;
  IF v_vehicle_id IS NULL OR v_media_vehicle IS DISTINCT FROM v_vehicle_id THEN
    RAISE EXCEPTION 'build photo must be this vehicle''s media' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_media_status <> 'active' THEN
    RAISE EXCEPTION 'build_photo_not_approved' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicle_build_entries_guard_links
  BEFORE INSERT OR UPDATE OF stage_id ON public.vehicle_build_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_build_links();
CREATE TRIGGER vehicle_build_documents_guard_links
  BEFORE INSERT OR UPDATE OF entry_id, stage_id ON public.vehicle_build_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_build_links();
CREATE TRIGGER vehicle_build_entry_photos_guard_links
  BEFORE INSERT OR UPDATE ON public.vehicle_build_entry_photos
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_build_links();

REVOKE ALL ON FUNCTION public.guard_vehicle_build_links() FROM PUBLIC, anon, authenticated;

-- Photos that stop being approved drop off entries so a rejected image can
-- never be shown through a build entry.
CREATE FUNCTION public.detach_unapproved_build_photos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.moderation_status <> 'active' THEN
    DELETE FROM public.vehicle_build_entry_photos WHERE media_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicle_media_detach_build_photos
  AFTER UPDATE OF moderation_status ON public.vehicle_media
  FOR EACH ROW EXECUTE FUNCTION public.detach_unapproved_build_photos();

REVOKE ALL ON FUNCTION public.detach_unapproved_build_photos() FROM PUBLIC, anon, authenticated;

-- Owner-only cost roll-up per stage (parts + labor). Never public.
CREATE FUNCTION public.vehicle_build_stage_totals(p_owner_profile_id uuid, p_vehicle_id uuid)
RETURNS TABLE(stage_id uuid, entry_count integer, installed_count integer, parts_cents bigint, labor_cents bigint, labor_hours numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT entry.stage_id,
         count(*)::integer,
         count(*) FILTER (WHERE entry.status = 'installed')::integer,
         COALESCE(sum(entry.cost_cents), 0)::bigint,
         COALESCE(sum(entry.labor_cents), 0)::bigint,
         COALESCE(sum(entry.labor_hours), 0)::numeric
  FROM public.vehicle_build_entries entry
  JOIN public.vehicles vehicle ON vehicle.id = entry.vehicle_id
  WHERE entry.vehicle_id = p_vehicle_id
    AND vehicle.owner_id = p_owner_profile_id
    AND entry.owner_id = p_owner_profile_id
  GROUP BY entry.stage_id;
$$;

REVOKE ALL ON FUNCTION public.vehicle_build_stage_totals(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_build_stage_totals(uuid, uuid) TO service_role;

COMMENT ON TABLE public.vehicle_build_stages IS
  'Build progression stages. Public projection includes only public stages and never costs.';
COMMENT ON TABLE public.vehicle_build_entry_photos IS
  'Entry ↔ approved vehicle media. Media that loses approval is detached automatically.';
COMMENT ON TABLE public.vehicle_build_documents IS
  'Owner-private receipts/invoices/dyno sheets in private storage. No public projection exists.';
COMMENT ON COLUMN public.vehicle_build_entries.labor_cents IS 'Private, like cost_cents.';

COMMIT;
