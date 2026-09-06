-- Dents & Tires inspection scope, plus persisted per-answer photo requirements.
--
-- Until now every inspection seeded the same twelve sections, and whether a
-- question needed a photo lived only in TypeScript (duplicated again in Swift).
-- A second, narrower inspection needs both: a scope to seed from, and a photo
-- rule that can differ between two questions that share the same prompt text.
--
-- Every statement here is written to be safely re-runnable, so a partial apply
-- can be finished by running the file again.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'inspection_scope'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.inspection_scope AS ENUM ('complete', 'dents_tires');
  END IF;
END
$$;

ALTER TYPE public.inspection_scope ADD VALUE IF NOT EXISTS 'dents_tires';

ALTER TABLE public.ppi_requests
  ADD COLUMN IF NOT EXISTS inspection_scope public.inspection_scope
    NOT NULL DEFAULT 'complete';

-- Sections unique to the dents_tires scope. Both platforms label a section from
-- its section_type, so reusing tires_brakes/exterior would render "Tires
-- Brakes" on an inspection that never asks about brakes.
-- Safe inside this transaction: PostgreSQL only forbids *using* a new enum
-- value in the transaction that adds it, and nothing below references these.
ALTER TYPE public.section_type ADD VALUE IF NOT EXISTS 'wheels_tires';
ALTER TYPE public.section_type ADD VALUE IF NOT EXISTS 'body_damage';

-- requires_photo is what makes "photo required on all four tires here, but only
-- the front left in the complete inspection" expressible at all: the iOS client
-- keyed its rule on prompt text, and the two scopes share that text on purpose.
-- photo_prompt rides along so the capture button label is data-driven too, and
-- so an optional photo can be offered without being demanded.
ALTER TABLE public.ppi_answers
  ADD COLUMN IF NOT EXISTS requires_photo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_prompt text;

-- Backfill every existing answer with the rules that were previously enforced
-- by clients. Historical rows remain truthful, and a later resubmission cannot
-- accidentally lose its required-photo rules just because the original was
-- completed before these columns existed.
--
-- The prompt list is CROSS JOINed and matched in WHERE rather than in an ON
-- clause: in UPDATE ... FROM, the target table is not part of the FROM join
-- tree and cannot be referenced from a join condition inside it.
UPDATE public.ppi_answers AS answer_row
SET requires_photo = true,
    photo_prompt = prompt_map.photo_prompt
FROM public.ppi_sections AS section_row
JOIN public.ppi_submissions AS submission_row
  ON submission_row.id = section_row.ppi_submission_id
CROSS JOIN (
  VALUES
    ('Current odometer reading (miles)'::text, 'Capture a clear photo of the odometer'::text),
    ('Are any warning lights currently on?', 'Turn ignition on (engine off) and capture the dashboard'),
    ('Overall paint condition', 'Capture all four sides of the vehicle'),
    ('Overall interior condition', 'Capture driver seat and rear seat area'),
    ('Front left tire tread depth (in 32nds of an inch)', 'Capture the worst-condition tire'),
    ('Engine oil condition', 'Capture the oil dipstick'),
    ('Frame rust level', 'Capture the underside of the vehicle (if safely accessible)')
) AS prompt_map(prompt, photo_prompt)
WHERE answer_row.ppi_section_id = section_row.id
  AND answer_row.prompt = prompt_map.prompt
  AND (
    answer_row.requires_photo IS DISTINCT FROM true
    OR answer_row.photo_prompt IS DISTINCT FROM prompt_map.photo_prompt
  );

-- A table-wide UPDATE grant (20260828171802) let a client PATCH any column on
-- ppi_answers through PostgREST — including is_required, and now
-- requires_photo. Server-side submit validation is only meaningful if the
-- columns it reads cannot be rewritten by the client it is validating.
-- saveAnswers, the OBD prefill, and the vehicle prefill only ever write these
-- two columns, so nothing legitimate loses access.
REVOKE UPDATE ON public.ppi_answers FROM authenticated;
GRANT UPDATE (answer_value, deferred_at) ON public.ppi_answers TO authenticated;

-- Keep the final state transition and its validation in one database
-- transaction. The API performs the same checks first so it can return the
-- exact question ids, while this function is the authoritative last gate.
CREATE OR REPLACE FUNCTION public.submit_ppi_atomic(
  p_submission_id uuid,
  p_submitted_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_request_id uuid;
  v_status public.submission_status;
BEGIN
  SELECT submission.ppi_request_id, submission.status
  INTO v_request_id, v_status
  FROM public.ppi_submissions AS submission
  WHERE submission.id = p_submission_id
    AND submission.is_current = true
  FOR UPDATE;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'submission_not_found';
  END IF;

  IF v_status NOT IN ('draft', 'in_progress') THEN
    RAISE EXCEPTION 'submission_not_editable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_answers AS answer_row
      ON answer_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = p_submission_id
      AND answer_row.is_required = true
      AND btrim(COALESCE(answer_row.answer_value, '')) = ''
  ) THEN
    RAISE EXCEPTION 'required_answers_incomplete';
  END IF;

  -- Client validation improves the experience, but callers can invoke this RPC
  -- directly. Validate constrained answer types again at the transaction
  -- boundary so malformed values can never become a submitted inspection.
  IF EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_answers AS answer_row
      ON answer_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = p_submission_id
      AND btrim(COALESCE(answer_row.answer_value, '')) <> ''
      AND (
        (
          answer_row.answer_type = 'yes_no'
          AND btrim(answer_row.answer_value) NOT IN ('yes', 'no')
        )
        OR (
          answer_row.answer_type = 'select'
          AND jsonb_typeof(answer_row.options) = 'array'
          AND NOT (answer_row.options ? btrim(answer_row.answer_value))
        )
        OR (
          answer_row.answer_type = 'number'
          AND btrim(answer_row.answer_value)
            !~ '^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$'
        )
        OR (
          answer_row.prompt IN (
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

  IF EXISTS (
    SELECT 1
    FROM public.ppi_sections AS section_row
    JOIN public.ppi_answers AS answer_row
      ON answer_row.ppi_section_id = section_row.id
    WHERE section_row.ppi_submission_id = p_submission_id
      AND answer_row.requires_photo = true
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

  UPDATE public.ppi_submissions
  SET status = 'submitted', submitted_at = p_submitted_at
  WHERE id = p_submission_id
    AND is_current = true
    AND status IN ('draft', 'in_progress');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission_not_editable';
  END IF;

  UPDATE public.ppi_requests
  SET status = 'submitted'
  WHERE id = v_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_ppi_atomic(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ppi_atomic(uuid, timestamptz) TO authenticated;
