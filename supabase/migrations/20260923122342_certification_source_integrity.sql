BEGIN;

-- Prompt changes produce distinct immutable provenance rows. The original
-- key omitted prompt_version, so a prompt-only release overwrote the prior
-- extraction that an inspector may already have confirmed.
DO $$
DECLARE
  v_constraint name;
BEGIN
  SELECT constraint_row.conname
  INTO v_constraint
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.ppi_media_extractions'::regclass
    AND constraint_row.contype = 'u'
    AND pg_get_constraintdef(constraint_row.oid) =
      'UNIQUE (ppi_media_id, target, schema_version, model)'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.ppi_media_extractions DROP CONSTRAINT %I',
      v_constraint
    );
  END IF;
END;
$$;

ALTER TABLE public.ppi_media_extractions
  ADD CONSTRAINT ppi_media_extractions_cache_key
  UNIQUE (ppi_media_id, target, schema_version, prompt_version, model);

-- Recheck every frozen source at certification time. This catches catalog-2
-- draft rows that existed before newer NOT VALID checks were deployed, plus
-- dangling/tampered photo-reading references written through the Data API.
CREATE OR REPLACE FUNCTION public.ppi_certification_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_answers AS answer_row
      ON answer_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = NEW.ppi_submission_id
      AND NOT public.ppi_pressure_recheck_valid(
        answer_row.question_key,
        answer_row.observation
      )
  ) THEN
    RAISE EXCEPTION 'pressure_recheck_required' USING ERRCODE = '22023',
      HINT = 'A pressure retention result needs a second reading and elapsed time.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_answers AS answer_row
      ON answer_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = NEW.ppi_submission_id
      AND answer_row.observation->>'source' = 'confirmed_extraction'
      AND NOT EXISTS (
        SELECT 1
        FROM public.ppi_media_extractions AS extraction_row
        JOIN public.ppi_media AS media_row
          ON media_row.id = extraction_row.ppi_media_id
        JOIN public.ppi_sections AS media_section
          ON media_section.id = media_row.ppi_section_id
        WHERE extraction_row.id::text = answer_row.observation->>'extraction_id'
          AND media_section.ppi_submission_id = NEW.ppi_submission_id
          AND media_row.media_type = 'image'
          AND extraction_row.status = 'extracted'
          AND jsonb_typeof(extraction_row.candidates) = 'object'
          AND extraction_row.candidates <> '{}'::jsonb
          AND extraction_row.target = CASE public.ppi_structured_family(answer_row.question_key)
            WHEN 'tire_sidewall' THEN 'tire_sidewall'
            WHEN 'tire_dot' THEN 'tire_dot'
            WHEN 'tire_placard' THEN 'tire_placard'
            ELSE NULL
          END
      )
  ) THEN
    RAISE EXCEPTION 'invalid_extraction_reference' USING ERRCODE = '22023',
      HINT = 'A confirmed photo reading is missing, unreadable, or belongs to a different check.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ppi_certification_source_guard()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ppi_certification_source_guard()
  TO service_role;

DROP TRIGGER IF EXISTS ppi_submission_certification_source_guard
  ON public.ppi_submission_certifications;
CREATE TRIGGER ppi_submission_certification_source_guard
  BEFORE INSERT ON public.ppi_submission_certifications
  FOR EACH ROW EXECUTE FUNCTION public.ppi_certification_source_guard();

-- The output worker needs CRUD, not ownership-level TRUNCATE/REFERENCES/
-- TRIGGER privileges. Keep its table grants explicit and least-privileged.
REVOKE ALL ON TABLE
  public.standardized_outputs,
  public.vsc_outputs,
  public.audit_logs
FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.standardized_outputs,
  public.vsc_outputs,
  public.audit_logs
TO service_role;

COMMIT;
