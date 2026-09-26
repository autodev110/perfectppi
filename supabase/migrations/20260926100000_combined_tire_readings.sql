-- Tire details read from all photos at once (the first tire step reads every
-- placard and sidewall photo together). A combined answer records each photo
-- reading it drew on in observation.extraction_ids, alongside the primary
-- extraction_id. This replaces ppi_certification_source_guard from
-- 20260923122342, unchanged apart from also checking every listed reading;
-- CREATE OR REPLACE keeps its owner, grants and trigger.

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

  -- Tire details read from several photos at once list every reading they
  -- combined. Each must be a readable reading of a photo in this inspection
  -- for the same check, and the primary reading must be one of them.
  IF EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_answers AS answer_row
      ON answer_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = NEW.ppi_submission_id
      AND answer_row.observation->>'source' = 'confirmed_extraction'
      AND answer_row.observation ? 'extraction_ids'
      AND CASE
        WHEN jsonb_typeof(answer_row.observation->'extraction_ids') IS DISTINCT FROM 'array' THEN true
        WHEN jsonb_array_length(answer_row.observation->'extraction_ids') = 0 THEN true
        ELSE
          NOT ((answer_row.observation->'extraction_ids') ? (answer_row.observation->>'extraction_id'))
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(answer_row.observation->'extraction_ids') AS listed(id)
            WHERE NOT EXISTS (
              SELECT 1
              FROM public.ppi_media_extractions AS extraction_row
              JOIN public.ppi_media AS media_row
                ON media_row.id = extraction_row.ppi_media_id
              JOIN public.ppi_sections AS media_section
                ON media_section.id = media_row.ppi_section_id
              WHERE extraction_row.id::text = listed.id
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
          )
      END
  ) THEN
    RAISE EXCEPTION 'invalid_extraction_reference' USING ERRCODE = '22023',
      HINT = 'A combined photo reading lists a reading that is missing, unreadable, or for a different check.';
  END IF;

  RETURN NEW;
END;
$$;
