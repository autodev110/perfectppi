-- Per-photo content facts for the certified media manifest
-- (05-developer-handoff.md: "freeze ordered media IDs, ... SHA-256 content
-- hashes, byte lengths, MIME types, orientation/dimensions").
--
-- Uploads go straight to private storage, so the database never sees the
-- bytes. The server reads each stored object back after it is attached (and
-- again for any still missing just before certifying) and records its
-- SHA-256, exact size, sniffed content type and image dimensions/orientation
-- here. Clients cannot set these fields, a recorded hash can never change, and
-- recording one does not count as an edit to the inspection.

ALTER TABLE public.ppi_media
  ADD COLUMN IF NOT EXISTS content_sha256 text
    CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS byte_size bigint CHECK (byte_size IS NULL OR byte_size > 0),
  ADD COLUMN IF NOT EXISTS content_type text CHECK (content_type IS NULL OR length(content_type) <= 100),
  ADD COLUMN IF NOT EXISTS width integer CHECK (width IS NULL OR width > 0),
  ADD COLUMN IF NOT EXISTS height integer CHECK (height IS NULL OR height > 0),
  ADD COLUMN IF NOT EXISTS orientation smallint CHECK (orientation IS NULL OR orientation BETWEEN 1 AND 8),
  ADD COLUMN IF NOT EXISTS content_verified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ppi_media_content_facts_complete') THEN
    ALTER TABLE public.ppi_media
      ADD CONSTRAINT ppi_media_content_facts_complete CHECK (
        (content_sha256 IS NULL) = (byte_size IS NULL)
        AND (content_sha256 IS NULL) = (content_verified_at IS NULL)
      );
  END IF;
END $$;

-- The server records content facts; it has no other UPDATE on this table.
GRANT UPDATE (content_sha256, byte_size, content_type, width, height, orientation, content_verified_at)
  ON public.ppi_media TO service_role;

CREATE OR REPLACE FUNCTION public.ppi_media_protect_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.content_sha256 IS NOT NULL AND (
    NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
    OR NEW.content_type IS DISTINCT FROM OLD.content_type
    OR NEW.width IS DISTINCT FROM OLD.width
    OR NEW.height IS DISTINCT FROM OLD.height
    OR NEW.orientation IS DISTINCT FROM OLD.orientation
    OR NEW.content_verified_at IS DISTINCT FROM OLD.content_verified_at
  ) THEN
    -- Different bytes behind a verified reference are evidence of a problem,
    -- never something to overwrite.
    RAISE EXCEPTION 'media_content_immutable' USING ERRCODE = '42501';
  END IF;

  IF public.ppi_is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  -- App users never supply content facts: a client-provided hash is not
  -- evidence of anything.
  IF TG_OP = 'INSERT' THEN
    NEW.content_sha256 := NULL;
    NEW.byte_size := NULL;
    NEW.content_type := NULL;
    NEW.width := NULL;
    NEW.height := NULL;
    NEW.orientation := NULL;
    NEW.content_verified_at := NULL;
  ELSE
    NEW.content_sha256 := OLD.content_sha256;
    NEW.byte_size := OLD.byte_size;
    NEW.content_type := OLD.content_type;
    NEW.width := OLD.width;
    NEW.height := OLD.height;
    NEW.orientation := OLD.orientation;
    NEW.content_verified_at := OLD.content_verified_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ppi_media_protect_content() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ppi_media_protect_content ON public.ppi_media;
CREATE TRIGGER ppi_media_protect_content
  BEFORE INSERT OR UPDATE ON public.ppi_media
  FOR EACH ROW EXECUTE FUNCTION public.ppi_media_protect_content();

-- Recording content facts does not change what the inspector reviewed, so it
-- must not bump the revision (a submit right after verification would
-- otherwise be refused as stale).
DROP TRIGGER IF EXISTS ppi_media_bump_revision ON public.ppi_media;
CREATE TRIGGER ppi_media_bump_revision
  AFTER INSERT OR DELETE ON public.ppi_media
  FOR EACH ROW EXECUTE FUNCTION public.ppi_bump_submission_revision();

DROP TRIGGER IF EXISTS ppi_media_bump_revision_on_update ON public.ppi_media;
CREATE TRIGGER ppi_media_bump_revision_on_update
  AFTER UPDATE OF ppi_section_id, ppi_answer_id, url, media_type, caption, captured_at, metadata
  ON public.ppi_media
  FOR EACH ROW EXECUTE FUNCTION public.ppi_bump_submission_revision();

-- submit_ppi_certified from 20260923101000, unchanged apart from the
-- media_unverified check and the content facts in each manifest entry.
CREATE OR REPLACE FUNCTION public.submit_ppi_certified(
  p_submission_id uuid,
  p_expected_revision integer,
  p_text_version text,
  p_accepted boolean,
  p_locale text DEFAULT 'en-US'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_submission public.ppi_submissions%ROWTYPE;
  v_request public.ppi_requests%ROWTYPE;
  v_existing public.ppi_submission_certifications%ROWTYPE;
  v_text text;
  v_mode text;
  v_sections jsonb;
  v_answers jsonb;
  v_media jsonb;
  v_vehicle jsonb;
  v_inspector jsonb;
  v_snapshot jsonb;
  v_facts_hash text;
  v_media_hash text;
  v_certification_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_submission
  FROM public.ppi_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission_not_found';
  END IF;

  SELECT * INTO v_request FROM public.ppi_requests WHERE id = v_submission.ppi_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_submission.performer_id <> v_actor
    OR (v_request.performer_type = 'self' AND v_request.requester_id IS DISTINCT FROM v_actor)
    OR (v_request.performer_type = 'technician' AND v_request.assigned_tech_id IS DISTINCT FROM v_actor)
  THEN
    RAISE EXCEPTION 'not_performer' USING ERRCODE = '42501';
  END IF;

  -- Retrying a submit that already succeeded returns the same certification;
  -- a different revision or wording can never replace it.
  IF v_submission.status IN ('submitted', 'completed') THEN
    SELECT * INTO v_existing FROM public.ppi_submission_certifications WHERE ppi_submission_id = p_submission_id;
    IF FOUND
      AND v_existing.certified_by = v_actor
      AND v_existing.submission_revision = p_expected_revision
      AND v_existing.text_version = p_text_version
    THEN
      RETURN jsonb_build_object(
        'request_id', v_submission.ppi_request_id,
        'certification_id', v_existing.id,
        'facts_hash', v_existing.facts_hash,
        'revision', v_existing.submission_revision,
        'certified_at', v_existing.certified_at,
        'replayed', true
      );
    END IF;
    RAISE EXCEPTION 'submission_not_editable';
  END IF;

  IF NOT v_submission.is_current OR v_submission.status NOT IN ('draft', 'in_progress') THEN
    RAISE EXCEPTION 'submission_not_editable';
  END IF;

  IF p_accepted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'certification_required' USING ERRCODE = '22023';
  END IF;

  SELECT body INTO v_text FROM public.ppi_certification_texts WHERE version = p_text_version;
  IF v_text IS NULL THEN
    RAISE EXCEPTION 'certification_text_unknown' USING ERRCODE = '22023';
  END IF;

  IF p_expected_revision IS DISTINCT FROM v_submission.revision THEN
    -- A plain raised error: PostgREST treats serialization failures (40001)
    -- as retryable upstream errors instead of returning the message.
    RAISE EXCEPTION 'stale_revision' USING
      HINT = 'The inspection changed after it was reviewed. Review it again before certifying.';
  END IF;

  v_mode := CASE WHEN v_request.performer_type = 'self' THEN 'self' ELSE 'technician' END;

  -- Required answers: plain answers need text, structured answers need an
  -- observation, and a required structured check cannot be "not inspected".
  IF EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_answers AS answer_row ON answer_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = p_submission_id
      AND answer_row.is_required = true
      AND (
        CASE WHEN answer_row.answer_type::text IN (
          'measurement', 'tire_markings', 'dot_code', 'condition_scale',
          'defect_list', 'tire_placard', 'panel_condition'
        )
          THEN answer_row.observation IS NULL OR answer_row.observation->>'state' = 'not_inspected'
          ELSE btrim(COALESCE(answer_row.answer_value, '')) = ''
        END
      )
  ) THEN
    RAISE EXCEPTION 'required_answers_incomplete';
  END IF;

  -- Legacy constrained answers (catalog 1 and the unchanged catalog-2 rows).
  IF EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_answers AS answer_row ON answer_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = p_submission_id
      AND btrim(COALESCE(answer_row.answer_value, '')) <> ''
      AND (
        (answer_row.answer_type = 'yes_no' AND btrim(answer_row.answer_value) NOT IN ('yes', 'no'))
        OR (
          answer_row.answer_type = 'select'
          AND jsonb_typeof(answer_row.options) = 'array'
          AND NOT (answer_row.options ? btrim(answer_row.answer_value))
        )
        OR (
          answer_row.answer_type = 'number'
          AND btrim(answer_row.answer_value) !~ '^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$'
        )
        OR (
          answer_row.answer_type = 'number'
          AND answer_row.prompt IN (
            'Front left tire tread depth (in 32nds of an inch)',
            'Front right tire tread depth (in 32nds of an inch)',
            'Rear left tire tread depth (in 32nds of an inch)',
            'Rear right tire tread depth (in 32nds of an inch)'
          )
          AND CASE
            WHEN btrim(answer_row.answer_value) ~ '^[0-9]+$'
              THEN btrim(answer_row.answer_value)::integer NOT BETWEEN 0 AND 32
            ELSE true
          END
        )
      )
  ) THEN
    RAISE EXCEPTION 'invalid_answers';
  END IF;

  -- Technicians must measure tread and pressure; self-inspectors may record an
  -- explicit reason (already validated by the observation trigger).
  IF v_mode = 'technician' AND EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_answers AS answer_row ON answer_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = p_submission_id
      AND public.ppi_structured_family(answer_row.question_key) IN ('tire_tread', 'tire_pressure')
      AND COALESCE(answer_row.observation->>'state', '') <> 'observed'
  ) THEN
    RAISE EXCEPTION 'technician_measurements_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_answers AS answer_row ON answer_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = p_submission_id
      AND (
        answer_row.requires_photo = true
        OR public.ppi_structured_photo_required(answer_row.question_key, answer_row.observation)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.ppi_media AS media_row
        WHERE media_row.ppi_section_id = section_row.id
          AND media_row.ppi_answer_id = answer_row.id
          AND media_row.media_type = 'image'
      )
  ) THEN
    RAISE EXCEPTION 'required_photos_incomplete';
  END IF;

  -- Every attached upload must carry server-verified content facts, so the
  -- manifest binds this certification to exact bytes. The API verifies
  -- missing ones just before calling this function.
  IF EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_media AS media_row ON media_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = p_submission_id
      AND media_row.content_sha256 IS NULL
  ) THEN
    RAISE EXCEPTION 'media_unverified' USING
      HINT = 'Photos are still being verified. Try again in a moment.';
  END IF;

  -- Freeze the source facts. jsonb serializes deterministically (sorted keys);
  -- arrays are ordered explicitly, so the hash is reproducible.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', section_row.id,
      'section_type', section_row.section_type,
      'sort_order', section_row.sort_order,
      'notes', section_row.notes
    ) ORDER BY section_row.sort_order, section_row.id), '[]'::jsonb)
  INTO v_sections
  FROM public.ppi_sections AS section_row
  WHERE section_row.ppi_submission_id = p_submission_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', answer_row.id,
      'section_id', answer_row.ppi_section_id,
      'question_key', answer_row.question_key,
      'prompt', answer_row.prompt,
      'answer_type', answer_row.answer_type,
      'answer_value', answer_row.answer_value,
      'observation', answer_row.observation,
      'options', answer_row.options,
      'is_required', answer_row.is_required,
      'requires_photo', answer_row.requires_photo,
      'sort_order', answer_row.sort_order
    ) ORDER BY section_row.sort_order, answer_row.sort_order, answer_row.id), '[]'::jsonb)
  INTO v_answers
  FROM public.ppi_sections AS section_row
  JOIN public.ppi_answers AS answer_row ON answer_row.ppi_section_id = section_row.id
  WHERE section_row.ppi_submission_id = p_submission_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', media_row.id,
      'section_id', media_row.ppi_section_id,
      'answer_id', media_row.ppi_answer_id,
      'storage_reference', media_row.url,
      'media_type', media_row.media_type,
      'caption', media_row.caption,
      'captured_at', media_row.captured_at,
      'uploaded_at', media_row.uploaded_at,
      'sha256', media_row.content_sha256,
      'byte_size', media_row.byte_size,
      'content_type', media_row.content_type,
      'width', media_row.width,
      'height', media_row.height,
      'orientation', media_row.orientation
    ) ORDER BY section_row.sort_order, media_row.uploaded_at, media_row.id), '[]'::jsonb)
  INTO v_media
  FROM public.ppi_sections AS section_row
  JOIN public.ppi_media AS media_row ON media_row.ppi_section_id = section_row.id
  WHERE section_row.ppi_submission_id = p_submission_id;

  SELECT jsonb_build_object(
      'year', vehicle.year, 'make', vehicle.make, 'model', vehicle.model,
      'trim', vehicle.trim, 'vin', vehicle.vin, 'mileage', vehicle.mileage
    )
  INTO v_vehicle
  FROM public.vehicles AS vehicle
  WHERE vehicle.id = v_request.vehicle_id;

  SELECT jsonb_build_object('profile_id', profile.id, 'display_name', profile.display_name, 'username', profile.username, 'mode', v_mode)
  INTO v_inspector
  FROM public.profiles AS profile
  WHERE profile.id = v_actor;

  v_snapshot := jsonb_build_object(
    'schema', 'ppi-certified-snapshot/1',
    'submission_id', v_submission.id,
    'request_id', v_request.id,
    'submission_version', v_submission.version,
    'revision', v_submission.revision,
    'catalog_version', v_submission.catalog_version,
    'scope', v_request.inspection_scope,
    'sections', v_sections,
    'answers', v_answers,
    'vehicle', COALESCE(v_vehicle, '{}'::jsonb),
    'inspector', COALESCE(v_inspector, '{}'::jsonb)
  );
  v_facts_hash := encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex');
  v_media_hash := encode(sha256(convert_to(v_media::text, 'UTF8')), 'hex');

  INSERT INTO public.ppi_submission_certifications (
    ppi_submission_id, certified_by, performer_mode, text_version, certification_text,
    locale, submission_revision, catalog_version, facts_hash, media_manifest_hash,
    facts_snapshot, media_manifest, certified_at
  ) VALUES (
    p_submission_id, v_actor, v_mode, p_text_version, v_text,
    COALESCE(NULLIF(btrim(p_locale), ''), 'en-US'), v_submission.revision, v_submission.catalog_version,
    v_facts_hash, v_media_hash, v_snapshot, v_media, v_now
  )
  RETURNING id INTO v_certification_id;

  UPDATE public.ppi_submissions
  SET status = 'submitted', submitted_at = v_now
  WHERE id = p_submission_id;

  UPDATE public.ppi_requests
  SET status = 'submitted'
  WHERE id = v_request.id;

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'certification_id', v_certification_id,
    'facts_hash', v_facts_hash,
    'revision', v_submission.revision,
    'certified_at', v_now,
    'replayed', false
  );
END;
$$;
