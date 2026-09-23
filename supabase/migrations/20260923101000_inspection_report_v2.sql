-- Inspection report redesign, part 2 of 2.
--
--   * Typed, validated observations on ppi_answers (catalog 2), with a derived
--     plain-text answer_value so older readers keep working.
--   * A monotonic submission revision, so a certification binds to exactly the
--     answers and photos the inspector reviewed.
--   * Submitted inspections are frozen at the database boundary: no client can
--     change answers, sections or photos after submission, or move a
--     submission into submitted/completed except through the certified RPC.
--   * submit_ppi_certified: validates, freezes and hashes the source facts and
--     records the inspector's accuracy certification in one transaction.
--   * Photo extraction suggestions and the optional photo evidence appendix
--     get their own records; neither changes the four required artifacts.
--
-- Contract: docs/perfectppi-report-handoff/docs/inspection-report-redesign/
-- 05-developer-handoff.md §3, §4, §8, §10 and 06-field-map-and-rules.md §2–4.

BEGIN;

-- ============================================================================
-- Columns
-- ============================================================================

ALTER TABLE public.ppi_submissions
  ADD COLUMN IF NOT EXISTS catalog_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ppi_submissions_catalog_version_check'
  ) THEN
    ALTER TABLE public.ppi_submissions
      ADD CONSTRAINT ppi_submissions_catalog_version_check CHECK (catalog_version IN (1, 2));
  END IF;
END
$$;

ALTER TABLE public.ppi_answers
  ADD COLUMN IF NOT EXISTS question_key text,
  ADD COLUMN IF NOT EXISTS observation jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS ppi_answers_section_question_key_idx
  ON public.ppi_answers (ppi_section_id, question_key)
  WHERE question_key IS NOT NULL;

-- Clients write only the response fields. question_key, prompt, type and the
-- requirement flags stay server-managed.
REVOKE UPDATE ON TABLE public.ppi_answers FROM authenticated;
GRANT UPDATE (answer_value, deferred_at, observation) ON TABLE public.ppi_answers TO authenticated;

-- ============================================================================
-- Semantic key helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ppi_structured_family(p_question_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_question_key = 'tires.placard' THEN 'tire_placard'
    WHEN p_question_key = 'battery.test' THEN 'battery_test'
    WHEN p_question_key ~ '^tires\.(front_left|front_right|rear_left|rear_right)\.sidewall$' THEN 'tire_sidewall'
    WHEN p_question_key ~ '^tires\.(front_left|front_right|rear_left|rear_right)\.dot_date$' THEN 'tire_dot'
    WHEN p_question_key ~ '^tires\.(front_left|front_right|rear_left|rear_right)\.tread$' THEN 'tire_tread'
    WHEN p_question_key ~ '^tires\.(front_left|front_right|rear_left|rear_right)\.pressure$' THEN 'tire_pressure'
    WHEN p_question_key ~ '^tires\.(front_left|front_right|rear_left|rear_right)\.cracking$' THEN 'tire_cracking'
    WHEN p_question_key ~ '^tires\.(front_left|front_right|rear_left|rear_right)\.wear$' THEN 'tire_wear'
    WHEN p_question_key ~ '^tires\.(front_left|front_right|rear_left|rear_right)\.damage$' THEN 'tire_damage'
    WHEN p_question_key ~ '^wheels\.(front_left|front_right|rear_left|rear_right)\.damage$' THEN 'wheel_damage'
    WHEN p_question_key ~ '^brakes\.(front_left|front_right|rear_left|rear_right)\.pad_thickness$' THEN 'brake_pad'
    WHEN p_question_key ~ '^body\.(hood|roof|trunk_tailgate|front_bumper|rear_bumper|left_front_fender|right_front_fender|left_front_door|right_front_door|left_rear_door|right_rear_door|left_rear_quarter|right_rear_quarter|left_rocker|right_rocker|other_body_panel)\.condition$' THEN 'body_panel'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.ppi_family_answer_type(p_family text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_family
    WHEN 'tire_placard' THEN 'tire_placard'
    WHEN 'tire_sidewall' THEN 'tire_markings'
    WHEN 'tire_dot' THEN 'dot_code'
    WHEN 'tire_tread' THEN 'measurement'
    WHEN 'tire_pressure' THEN 'measurement'
    WHEN 'brake_pad' THEN 'measurement'
    WHEN 'battery_test' THEN 'measurement'
    WHEN 'tire_cracking' THEN 'condition_scale'
    WHEN 'tire_wear' THEN 'condition_scale'
    WHEN 'tire_damage' THEN 'defect_list'
    WHEN 'wheel_damage' THEN 'defect_list'
    WHEN 'body_panel' THEN 'panel_condition'
    ELSE NULL
  END
$$;

-- A plain non-negative decimal (no sign, exponent or locale separator) within
-- [0, p_max]. Compared as numeric, so 25.4 mm is exactly accepted.
CREATE OR REPLACE FUNCTION public.ppi_decimal_within(p_value text, p_max numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_value IS NOT NULL
    AND p_value ~ '^[0-9]{1,5}(\.[0-9]{1,4})?$'
    AND p_value::numeric <= p_max
$$;

-- ============================================================================
-- Observation validation (authoritative boundary for every write path)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ppi_observation_error(
  p_answer_type public.answer_type,
  p_question_key text,
  p_observation jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_reason_codes constant text[] := ARRAY[
    'no_gauge', 'inaccessible', 'unsafe_access', 'unreadable', 'missing_label',
    'not_equipped', 'vehicle_configuration', 'weather_or_lighting', 'other'
  ];
  v_family text;
  v_state text;
  v_reason text;
  v_value jsonb;
  v_unit text;
  v_max numeric;
  v_item jsonb;
  v_position text;
  v_types text[];
BEGIN
  IF p_observation IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_answer_type::text NOT IN (
    'measurement', 'tire_markings', 'dot_code', 'condition_scale',
    'defect_list', 'tire_placard', 'panel_condition'
  ) THEN
    RETURN 'observation_not_allowed';
  END IF;
  IF jsonb_typeof(p_observation) <> 'object' THEN
    RETURN 'observation_not_object';
  END IF;

  v_family := public.ppi_structured_family(p_question_key);
  IF v_family IS NULL THEN
    RETURN 'unknown_question_key';
  END IF;
  IF public.ppi_family_answer_type(v_family) <> p_answer_type::text THEN
    RETURN 'answer_type_mismatch';
  END IF;
  IF COALESCE(p_observation->>'v', '') <> '1' THEN
    RETURN 'observation_version';
  END IF;

  IF p_observation ? 'evidence_exception'
    AND jsonb_typeof(p_observation->'evidence_exception') = 'object'
    AND COALESCE(p_observation #>> '{evidence_exception,code}', '') <> ALL (v_reason_codes)
  THEN
    RETURN 'evidence_exception_reason';
  END IF;

  -- outside_scope and not_recorded are system states, never inspector input.
  v_state := p_observation->>'state';
  IF v_state IS NULL OR v_state NOT IN ('observed', 'unable_to_assess', 'not_inspected', 'not_applicable') THEN
    RETURN 'observation_state';
  END IF;

  IF v_state <> 'observed' THEN
    v_reason := p_observation #>> '{reason,code}';
    IF v_reason IS NULL OR v_reason <> ALL (v_reason_codes) THEN
      RETURN 'reason_required';
    END IF;
    IF v_reason = 'other' AND btrim(COALESCE(p_observation #>> '{reason,explanation}', '')) = '' THEN
      RETURN 'reason_explanation_required';
    END IF;
    IF p_observation ? 'value' AND jsonb_typeof(p_observation->'value') <> 'null' THEN
      RETURN 'value_without_observation';
    END IF;
    IF v_state = 'not_applicable' THEN
      IF v_reason NOT IN ('not_equipped', 'vehicle_configuration') THEN
        RETURN 'not_applicable_reason';
      END IF;
      IF v_family IN ('tire_tread', 'tire_pressure', 'tire_sidewall', 'tire_cracking', 'tire_wear', 'tire_damage', 'wheel_damage') THEN
        RETURN 'not_applicable_forbidden';
      END IF;
    END IF;
    RETURN NULL;
  END IF;

  v_value := p_observation->'value';
  IF v_value IS NULL OR jsonb_typeof(v_value) <> 'object' THEN
    RETURN 'value_required';
  END IF;
  IF COALESCE(p_observation->>'source', 'inspector_entry') NOT IN ('inspector_entry', 'confirmed_extraction') THEN
    RETURN 'observation_source';
  END IF;
  IF p_observation->>'source' = 'confirmed_extraction' AND COALESCE(p_observation->>'extraction_id', '') = '' THEN
    RETURN 'extraction_reference_required';
  END IF;

  IF v_family IN ('tire_tread', 'tire_pressure', 'brake_pad', 'battery_test') THEN
    v_unit := v_value->>'unit';
    v_max := CASE v_family || ':' || COALESCE(v_unit, '')
      WHEN 'tire_tread:thirty_seconds_inch' THEN 32
      WHEN 'tire_tread:mm' THEN 25.4
      WHEN 'tire_pressure:psi' THEN 120
      WHEN 'tire_pressure:kpa' THEN 830
      WHEN 'brake_pad:mm' THEN 30
      WHEN 'battery_test:volts' THEN 20
      ELSE NULL
    END;
    IF v_max IS NULL THEN
      RETURN 'measurement_unit';
    END IF;
    IF NOT public.ppi_decimal_within(v_value->>'reading', v_max) THEN
      RETURN 'measurement_reading';
    END IF;
    IF jsonb_typeof(v_value->'positions') = 'object' THEN
      FOREACH v_position IN ARRAY ARRAY['inner', 'center', 'outer'] LOOP
        IF v_value->'positions' ? v_position
          AND jsonb_typeof(v_value->'positions'->v_position) <> 'null'
          AND NOT public.ppi_decimal_within(v_value->'positions'->>v_position, v_max)
        THEN
          RETURN 'measurement_reading';
        END IF;
      END LOOP;
    END IF;
    IF jsonb_typeof(v_value->'recheck') = 'object'
      AND NOT public.ppi_decimal_within(v_value #>> '{recheck,reading}', v_max)
    THEN
      RETURN 'measurement_reading';
    END IF;
    IF v_family = 'tire_pressure' THEN
      IF COALESCE(v_value->>'context', '') NOT IN ('cold', 'warm', 'unknown') THEN
        RETURN 'pressure_context';
      END IF;
      IF v_value ? 'pressure_loss'
        AND COALESCE(v_value->>'pressure_loss', '') NOT IN ('observed', 'reported', 'not_observed_during_test', 'not_tested')
      THEN
        RETURN 'pressure_loss';
      END IF;
    END IF;
    IF v_family = 'battery_test' AND COALESCE(v_value->>'result', '') NOT IN ('good', 'marginal', 'replace', 'inconclusive') THEN
      RETURN 'battery_result';
    END IF;
    RETURN NULL;
  END IF;

  IF v_family = 'tire_dot' THEN
    IF COALESCE(v_value->>'code', '') !~ '^(0[1-9]|[1-4][0-9]|5[0-3])[0-9]{2}$' THEN
      RETURN 'dot_code';
    END IF;
    RETURN NULL;
  END IF;

  IF v_family = 'tire_sidewall' THEN
    IF btrim(COALESCE(v_value->>'raw', '')) = '' AND btrim(COALESCE(v_value->>'size', '')) = '' THEN
      RETURN 'tire_size_required';
    END IF;
    IF COALESCE(v_value->>'load_index', '') <> '' AND v_value->>'load_index' !~ '^[0-9]{2,3}(/[0-9]{2,3})?$' THEN
      RETURN 'load_index';
    END IF;
    IF COALESCE(v_value->>'speed_rating', '') <> '' AND v_value->>'speed_rating' !~ '^\(?[A-Z]{1,2}\)?$' THEN
      RETURN 'speed_rating';
    END IF;
    RETURN NULL;
  END IF;

  IF v_family = 'tire_cracking' THEN
    RETURN CASE WHEN COALESCE(v_value->>'level', '') IN ('none', 'starting', 'significant', 'severe') THEN NULL ELSE 'scale_level' END;
  END IF;

  IF v_family = 'tire_wear' THEN
    RETURN CASE WHEN COALESCE(v_value->>'level', '') IN ('even', 'uneven_monitor', 'severe_uneven') THEN NULL ELSE 'scale_level' END;
  END IF;

  IF v_family IN ('tire_damage', 'wheel_damage') THEN
    v_types := CASE v_family
      WHEN 'tire_damage' THEN ARRAY['puncture', 'foreign_object', 'cut', 'missing_rubber', 'bulge', 'exposed_cords', 'suspected_separation', 'other']
      ELSE ARRAY['scratch_curb_rash', 'gouge_chipped_material', 'bent', 'cracked', 'other']
    END;
    IF v_value->>'none_observed' = 'true' THEN
      IF jsonb_typeof(v_value->'defects') = 'array' AND jsonb_array_length(v_value->'defects') > 0 THEN
        RETURN 'none_observed_exclusive';
      END IF;
      RETURN NULL;
    END IF;
    IF jsonb_typeof(v_value->'defects') <> 'array'
      OR jsonb_array_length(v_value->'defects') NOT BETWEEN 1 AND 12
    THEN
      RETURN 'defects_required';
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_value->'defects') LOOP
      IF COALESCE(v_item->>'id', '') !~ '^[a-z0-9-]{4,40}$'
        OR COALESCE(v_item->>'type', '') <> ALL (v_types)
        -- Confirmation is always an explicit choice; a missing value never
        -- defaults to confirmed.
        OR COALESCE(v_item->>'certainty', '') NOT IN ('confirmed', 'suspected')
        OR (v_family = 'tire_damage' AND COALESCE(v_item->>'location', 'unknown') NOT IN ('tread', 'shoulder', 'sidewall', 'unknown'))
      THEN
        RETURN 'defect_entry';
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;

  IF v_family = 'tire_placard' THEN
    IF jsonb_typeof(v_value->'front') <> 'object' OR jsonb_typeof(v_value->'rear') <> 'object' THEN
      RETURN 'placard_axles';
    END IF;
    IF btrim(COALESCE(v_value #>> '{front,size}', '')) = '' AND btrim(COALESCE(v_value #>> '{rear,size}', '')) = '' THEN
      RETURN 'placard_size_required';
    END IF;
    FOREACH v_position IN ARRAY ARRAY['front', 'rear'] LOOP
      IF COALESCE(v_value->v_position->>'unit', 'psi') NOT IN ('psi', 'kpa') THEN
        RETURN 'placard_pressure';
      END IF;
      IF COALESCE(v_value->v_position->>'pressure', '') <> ''
        AND NOT public.ppi_decimal_within(
          v_value->v_position->>'pressure',
          CASE WHEN v_value->v_position->>'unit' = 'kpa' THEN 830 ELSE 120 END
        )
      THEN
        RETURN 'placard_pressure';
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;

  IF v_family = 'body_panel' THEN
    IF v_value->>'condition' = 'no_visible_damage' THEN
      IF jsonb_typeof(v_value->'defects') = 'array' AND jsonb_array_length(v_value->'defects') > 0 THEN
        RETURN 'none_observed_exclusive';
      END IF;
      RETURN NULL;
    END IF;
    IF COALESCE(v_value->>'condition', '') <> 'damage_present' THEN
      RETURN 'panel_condition';
    END IF;
    IF jsonb_typeof(v_value->'defects') <> 'array'
      OR jsonb_array_length(v_value->'defects') NOT BETWEEN 1 AND 12
    THEN
      RETURN 'defects_required';
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_value->'defects') LOOP
      IF COALESCE(v_item->>'id', '') !~ '^[a-z0-9-]{4,40}$'
        OR COALESCE(v_item->>'type', '') NOT IN ('dent', 'scratch', 'paint_damage', 'rust', 'mismatched_repaint', 'other')
        OR COALESCE(v_item->>'severity', '') NOT IN ('minor', 'moderate', 'severe')
      THEN
        RETURN 'defect_entry';
      END IF;
      IF jsonb_typeof(v_item->'marker') = 'object' AND NOT (
        jsonb_typeof(v_item #> '{marker,x}') = 'number'
        AND jsonb_typeof(v_item #> '{marker,y}') = 'number'
        AND (v_item #>> '{marker,x}')::numeric BETWEEN 0 AND 1
        AND (v_item #>> '{marker,y}')::numeric BETWEEN 0 AND 1
      ) THEN
        RETURN 'defect_marker';
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;

  RETURN 'unknown_question_key';
END;
$$;

-- Plain-text summary kept in answer_value for older readers (the redacted
-- marketplace projection, legacy report prompt, older app builds). Built only
-- from controlled values and numbers — never free-text notes or explanations.
CREATE OR REPLACE FUNCTION public.ppi_observation_summary(p_question_key text, p_observation jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_family text := public.ppi_structured_family(p_question_key);
  v_value jsonb := p_observation->'value';
  v_state text := p_observation->>'state';
  v_reason text := p_observation #>> '{reason,code}';
BEGIN
  IF p_observation IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_state <> 'observed' THEN
    RETURN CASE v_state
      WHEN 'unable_to_assess' THEN 'Unable to assess'
      WHEN 'not_applicable' THEN 'Not applicable'
      ELSE 'Not inspected'
    END || COALESCE(' (' || replace(v_reason, '_', ' ') || ')', '');
  END IF;

  RETURN CASE v_family
    WHEN 'tire_tread' THEN
      (v_value->>'reading') || CASE v_value->>'unit' WHEN 'mm' THEN ' mm' ELSE '/32 in' END
    WHEN 'tire_pressure' THEN
      (v_value->>'reading') || CASE v_value->>'unit' WHEN 'kpa' THEN ' kPa' ELSE ' psi' END
        || ' (' || COALESCE(v_value->>'context', 'unknown') || ')'
    WHEN 'brake_pad' THEN (v_value->>'reading') || ' mm'
    WHEN 'battery_test' THEN (v_value->>'reading') || ' V, ' || COALESCE(v_value->>'result', '')
    WHEN 'tire_sidewall' THEN
      COALESCE(
        NULLIF(btrim(concat_ws(' ', v_value->>'size', NULLIF(concat(v_value->>'load_index', v_value->>'speed_rating'), ''))), ''),
        'Sidewall recorded'
      )
    WHEN 'tire_dot' THEN 'DOT ' || (v_value->>'code')
    WHEN 'tire_cracking' THEN initcap(replace(v_value->>'level', '_', ' '))
    WHEN 'tire_wear' THEN CASE v_value->>'level'
      WHEN 'even' THEN 'Even'
      WHEN 'uneven_monitor' THEN 'Mild uneven'
      ELSE 'Severe uneven'
    END
    WHEN 'tire_damage' THEN CASE
      WHEN v_value->>'none_observed' = 'true' THEN 'None observed'
      ELSE (
        SELECT string_agg(
          initcap(replace(defect->>'type', '_', ' '))
            || CASE WHEN defect->>'certainty' = 'suspected' THEN ' (suspected)' ELSE '' END,
          ', ' ORDER BY ordinality
        )
        FROM jsonb_array_elements(v_value->'defects') WITH ORDINALITY AS entries(defect, ordinality)
      )
    END
    WHEN 'wheel_damage' THEN CASE
      WHEN v_value->>'none_observed' = 'true' THEN 'None observed'
      ELSE (
        SELECT string_agg(initcap(replace(defect->>'type', '_', ' ')), ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(v_value->'defects') WITH ORDINALITY AS entries(defect, ordinality)
      )
    END
    WHEN 'body_panel' THEN CASE
      WHEN v_value->>'condition' = 'no_visible_damage' THEN 'No visible damage'
      ELSE 'Damage: ' || (
        SELECT string_agg(
          COALESCE(defect->>'severity', 'minor') || ' ' || replace(defect->>'type', '_', ' '),
          ', ' ORDER BY ordinality
        )
        FROM jsonb_array_elements(v_value->'defects') WITH ORDINALITY AS entries(defect, ordinality)
      )
    END
    WHEN 'tire_placard' THEN concat_ws('; ',
      NULLIF(btrim(concat_ws(' ', 'Front',
        v_value #>> '{front,size}',
        CASE WHEN COALESCE(v_value #>> '{front,pressure}', '') <> ''
          THEN (v_value #>> '{front,pressure}') || CASE v_value #>> '{front,unit}' WHEN 'kpa' THEN ' kPa' ELSE ' psi' END
        END)), 'Front'),
      NULLIF(btrim(concat_ws(' ', 'Rear',
        v_value #>> '{rear,size}',
        CASE WHEN COALESCE(v_value #>> '{rear,pressure}', '') <> ''
          THEN (v_value #>> '{rear,pressure}') || CASE v_value #>> '{rear,unit}' WHEN 'kpa' THEN ' kPa' ELSE ' psi' END
        END)), 'Rear'))
    ELSE 'Recorded'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.ppi_answers_guard_observation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_error text;
BEGIN
  IF NEW.answer_type::text IN (
    'measurement', 'tire_markings', 'dot_code', 'condition_scale',
    'defect_list', 'tire_placard', 'panel_condition'
  ) THEN
    v_error := public.ppi_observation_error(NEW.answer_type, NEW.question_key, NEW.observation);
    IF v_error IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_observation: %', v_error USING ERRCODE = '22023';
    END IF;
    -- The summary is derived here so it can never disagree with the facts.
    NEW.answer_value := public.ppi_observation_summary(NEW.question_key, NEW.observation);
  ELSIF NEW.observation IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_observation: observation_not_allowed' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ppi_answers_guard_observation ON public.ppi_answers;
CREATE TRIGGER ppi_answers_guard_observation
  BEFORE INSERT OR UPDATE OF answer_value, observation, answer_type, question_key
  ON public.ppi_answers
  FOR EACH ROW EXECUTE FUNCTION public.ppi_answers_guard_observation();

-- Whether a structured answer still needs a linked photo (mirrors
-- structuredPhotoRequired in src/features/ppi/inspection-schema.ts).
CREATE OR REPLACE FUNCTION public.ppi_structured_photo_required(p_question_key text, p_observation jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    p_observation->>'state' = 'observed'
    AND jsonb_typeof(COALESCE(p_observation->'evidence_exception', 'null'::jsonb)) <> 'object'
    AND CASE public.ppi_structured_family(p_question_key)
      WHEN 'tire_placard' THEN true
      WHEN 'tire_sidewall' THEN true
      WHEN 'tire_tread' THEN true
      WHEN 'tire_damage' THEN jsonb_typeof(p_observation #> '{value,defects}') = 'array'
      WHEN 'wheel_damage' THEN jsonb_typeof(p_observation #> '{value,defects}') = 'array'
      WHEN 'body_panel' THEN p_observation #>> '{value,condition}' = 'damage_present'
      ELSE false
    END,
    false
  )
$$;

-- ============================================================================
-- Revision counter and frozen submitted inspections
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ppi_is_privileged_writer()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- Service/worker connections and SECURITY DEFINER operations owned by the
  -- database owner (the certified submit RPC). App users, including admins,
  -- are never privileged here: corrections create a new audited revision.
  SELECT current_user IN ('postgres', 'service_role', 'supabase_admin')
$$;

CREATE OR REPLACE FUNCTION public.ppi_bump_submission_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_section_id uuid;
  v_submission_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'ppi_sections' THEN
    v_submission_id := COALESCE(NEW.ppi_submission_id, OLD.ppi_submission_id);
  ELSE
    v_section_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.ppi_section_id ELSE NEW.ppi_section_id END;
    SELECT ppi_submission_id INTO v_submission_id FROM public.ppi_sections WHERE id = v_section_id;
  END IF;
  IF v_submission_id IS NOT NULL THEN
    UPDATE public.ppi_submissions SET revision = revision + 1 WHERE id = v_submission_id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ppi_bump_submission_revision() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ppi_answers_bump_revision ON public.ppi_answers;
CREATE TRIGGER ppi_answers_bump_revision
  AFTER UPDATE OF answer_value, observation ON public.ppi_answers
  FOR EACH ROW
  WHEN (OLD.answer_value IS DISTINCT FROM NEW.answer_value OR OLD.observation IS DISTINCT FROM NEW.observation)
  EXECUTE FUNCTION public.ppi_bump_submission_revision();

DROP TRIGGER IF EXISTS ppi_media_bump_revision ON public.ppi_media;
CREATE TRIGGER ppi_media_bump_revision
  AFTER INSERT OR DELETE OR UPDATE ON public.ppi_media
  FOR EACH ROW EXECUTE FUNCTION public.ppi_bump_submission_revision();

DROP TRIGGER IF EXISTS ppi_sections_bump_revision ON public.ppi_sections;
CREATE TRIGGER ppi_sections_bump_revision
  AFTER UPDATE OF notes ON public.ppi_sections
  FOR EACH ROW
  WHEN (OLD.notes IS DISTINCT FROM NEW.notes)
  EXECUTE FUNCTION public.ppi_bump_submission_revision();

-- Children of a submitted/completed submission are read-only for every app
-- user. A parent that no longer exists means a cascade delete is in progress.
CREATE OR REPLACE FUNCTION public.ppi_guard_finalized_children()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_submission_id uuid;
  v_status public.submission_status;
BEGIN
  IF public.ppi_is_privileged_writer() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'ppi_sections' THEN
    v_submission_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.ppi_submission_id ELSE NEW.ppi_submission_id END;
  ELSE
    SELECT section.ppi_submission_id INTO v_submission_id
    FROM public.ppi_sections AS section
    WHERE section.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.ppi_section_id ELSE NEW.ppi_section_id END;
  END IF;

  SELECT submission.status INTO v_status
  FROM public.ppi_submissions AS submission
  WHERE submission.id = v_submission_id;

  IF v_status IS NULL OR v_status IN ('draft', 'in_progress') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION 'submission_finalized' USING ERRCODE = '42501',
    HINT = 'Submitted inspections are frozen. Start a new revision to make changes.';
END;
$$;

DROP TRIGGER IF EXISTS ppi_answers_guard_finalized ON public.ppi_answers;
CREATE TRIGGER ppi_answers_guard_finalized
  BEFORE INSERT OR UPDATE OR DELETE ON public.ppi_answers
  FOR EACH ROW EXECUTE FUNCTION public.ppi_guard_finalized_children();

DROP TRIGGER IF EXISTS ppi_media_guard_finalized ON public.ppi_media;
CREATE TRIGGER ppi_media_guard_finalized
  BEFORE INSERT OR UPDATE OR DELETE ON public.ppi_media
  FOR EACH ROW EXECUTE FUNCTION public.ppi_guard_finalized_children();

DROP TRIGGER IF EXISTS ppi_sections_guard_finalized ON public.ppi_sections;
CREATE TRIGGER ppi_sections_guard_finalized
  BEFORE INSERT OR UPDATE OR DELETE ON public.ppi_sections
  FOR EACH ROW EXECUTE FUNCTION public.ppi_guard_finalized_children();

-- A submission reaches submitted/completed only through submit_ppi_certified
-- (or a privileged service path). After that, the only client-side change is
-- retiring it as the current version when a revision starts.
CREATE OR REPLACE FUNCTION public.ppi_guard_submission_transitions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF public.ppi_is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'in_progress') THEN
      RAISE EXCEPTION 'certification_required' USING ERRCODE = '42501';
    END IF;
    IF NEW.revision <> 0 THEN
      NEW.revision := 0;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('submitted', 'completed') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.performer_id IS DISTINCT FROM OLD.performer_id
      OR NEW.ppi_request_id IS DISTINCT FROM OLD.ppi_request_id
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.catalog_version IS DISTINCT FROM OLD.catalog_version
      OR NEW.revision IS DISTINCT FROM OLD.revision
    THEN
      RAISE EXCEPTION 'submission_finalized' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('submitted', 'completed') THEN
    RAISE EXCEPTION 'certification_required' USING ERRCODE = '42501',
      HINT = 'Submit through submit_ppi_certified with the inspector certification.';
  END IF;
  IF NEW.catalog_version IS DISTINCT FROM OLD.catalog_version
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
  THEN
    RAISE EXCEPTION 'submission_field_managed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ppi_submissions_guard_transitions ON public.ppi_submissions;
CREATE TRIGGER ppi_submissions_guard_transitions
  BEFORE INSERT OR UPDATE ON public.ppi_submissions
  FOR EACH ROW EXECUTE FUNCTION public.ppi_guard_submission_transitions();

-- ============================================================================
-- Certification
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ppi_certification_texts (
  version text PRIMARY KEY,
  locale text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ppi_certification_texts (version, locale, body)
VALUES (
  'inspection_accuracy/1',
  'en-US',
  'I certify that the observations and answers in this inspection are accurate to the best of my knowledge and ability.'
)
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.ppi_certification_texts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppi_certification_texts_read ON public.ppi_certification_texts;
CREATE POLICY ppi_certification_texts_read ON public.ppi_certification_texts
  FOR SELECT USING (true);
REVOKE ALL ON TABLE public.ppi_certification_texts FROM anon, authenticated;
GRANT SELECT ON TABLE public.ppi_certification_texts TO authenticated;
GRANT ALL ON TABLE public.ppi_certification_texts TO service_role;

CREATE OR REPLACE FUNCTION public.ppi_certification_texts_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'certification_text_immutable' USING ERRCODE = '42501',
    HINT = 'Publish a new version instead of editing signed wording.';
END;
$$;

DROP TRIGGER IF EXISTS ppi_certification_texts_immutable ON public.ppi_certification_texts;
CREATE TRIGGER ppi_certification_texts_immutable
  BEFORE UPDATE OR DELETE ON public.ppi_certification_texts
  FOR EACH ROW EXECUTE FUNCTION public.ppi_certification_texts_immutable();

CREATE TABLE IF NOT EXISTS public.ppi_submission_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_submission_id uuid NOT NULL UNIQUE REFERENCES public.ppi_submissions(id) ON DELETE CASCADE,
  certified_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  performer_mode text NOT NULL CHECK (performer_mode IN ('self', 'technician')),
  text_version text NOT NULL REFERENCES public.ppi_certification_texts(version),
  certification_text text NOT NULL,
  locale text NOT NULL,
  submission_revision integer NOT NULL,
  catalog_version smallint NOT NULL,
  facts_hash text NOT NULL CHECK (facts_hash ~ '^[0-9a-f]{64}$'),
  media_manifest_hash text NOT NULL CHECK (media_manifest_hash ~ '^[0-9a-f]{64}$'),
  facts_snapshot jsonb NOT NULL,
  media_manifest jsonb NOT NULL,
  certified_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ppi_submission_certifications_certified_by_idx
  ON public.ppi_submission_certifications (certified_by);

ALTER TABLE public.ppi_submission_certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppi_submission_certifications_select ON public.ppi_submission_certifications;
CREATE POLICY ppi_submission_certifications_select ON public.ppi_submission_certifications
  FOR SELECT USING (public.can_access_submission(ppi_submission_id));

DROP POLICY IF EXISTS ppi_submission_certifications_select_org_manager ON public.ppi_submission_certifications;
CREATE POLICY ppi_submission_certifications_select_org_manager ON public.ppi_submission_certifications
  FOR SELECT USING (
    public.get_my_role() = 'org_manager'
    AND EXISTS (
      SELECT 1 FROM public.ppi_submissions submission
      WHERE submission.id = ppi_submission_certifications.ppi_submission_id
        AND submission.performer_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
    )
  );

DROP POLICY IF EXISTS ppi_submission_certifications_select_admin ON public.ppi_submission_certifications;
CREATE POLICY ppi_submission_certifications_select_admin ON public.ppi_submission_certifications
  FOR SELECT USING (public.get_my_role() = 'admin');

REVOKE ALL ON TABLE public.ppi_submission_certifications FROM anon, authenticated;
GRANT SELECT ON TABLE public.ppi_submission_certifications TO authenticated;
GRANT ALL ON TABLE public.ppi_submission_certifications TO service_role;

CREATE OR REPLACE FUNCTION public.ppi_certifications_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'certification_immutable' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS ppi_submission_certifications_immutable ON public.ppi_submission_certifications;
CREATE TRIGGER ppi_submission_certifications_immutable
  BEFORE UPDATE ON public.ppi_submission_certifications
  FOR EACH ROW EXECUTE FUNCTION public.ppi_certifications_immutable();

-- ============================================================================
-- submit_ppi_certified
-- ============================================================================

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
      'uploaded_at', media_row.uploaded_at
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

REVOKE ALL ON FUNCTION public.submit_ppi_certified(uuid, integer, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ppi_certified(uuid, integer, text, boolean, text) TO authenticated, service_role;

-- The uncertified RPC can no longer be used to bypass certification. It stays
-- defined (forward-only) but only the service role may call it.
REVOKE EXECUTE ON FUNCTION public.submit_ppi_atomic(uuid, timestamptz) FROM authenticated;

-- ============================================================================
-- Photo extraction suggestions (never facts until the inspector confirms)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ppi_media_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppi_media_id uuid NOT NULL REFERENCES public.ppi_media(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('tire_sidewall', 'tire_dot', 'tire_placard')),
  model text NOT NULL,
  schema_version text NOT NULL,
  prompt_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('extracted', 'unreadable', 'failed')),
  candidates jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ppi_media_id, target, schema_version, model)
);

ALTER TABLE public.ppi_media_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppi_media_extractions_select ON public.ppi_media_extractions;
CREATE POLICY ppi_media_extractions_select ON public.ppi_media_extractions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.ppi_media AS media_row
      JOIN public.ppi_sections AS section_row ON section_row.id = media_row.ppi_section_id
      WHERE media_row.id = ppi_media_extractions.ppi_media_id
        AND public.can_access_submission(section_row.ppi_submission_id)
    )
  );

REVOKE ALL ON TABLE public.ppi_media_extractions FROM anon, authenticated;
GRANT SELECT ON TABLE public.ppi_media_extractions TO authenticated;
GRANT ALL ON TABLE public.ppi_media_extractions TO service_role;

-- ============================================================================
-- Optional photo evidence appendix exports
--
-- Independent from the four required artifacts: an appendix never delays or
-- blocks deliverables_ready, and partners do not see it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inspection_output_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standardized_output_id uuid NOT NULL REFERENCES public.standardized_outputs(id) ON DELETE CASCADE,
  ppi_submission_id uuid NOT NULL REFERENCES public.ppi_submissions(id) ON DELETE CASCADE,
  output_version integer NOT NULL,
  export_type text NOT NULL CHECK (export_type IN ('evidence_appendix')),
  template_version text NOT NULL,
  locale text NOT NULL DEFAULT 'en-US',
  facts_hash text,
  media_manifest_hash text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'ready', 'incomplete', 'retryable_failure', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  lock_expires_at timestamptz,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  storage_key text,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer,
  page_count integer,
  photo_count_expected integer,
  photo_count_rendered integer,
  finding_count integer,
  missing_media jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (ppi_submission_id, output_version, export_type, template_version, locale)
);

CREATE INDEX IF NOT EXISTS inspection_output_exports_claim_idx
  ON public.inspection_output_exports (status, next_attempt_at)
  WHERE status IN ('queued', 'retryable_failure', 'running');

DROP TRIGGER IF EXISTS inspection_output_exports_updated_at ON public.inspection_output_exports;
CREATE TRIGGER inspection_output_exports_updated_at
  BEFORE UPDATE ON public.inspection_output_exports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.inspection_output_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inspection_output_exports_select ON public.inspection_output_exports;
CREATE POLICY inspection_output_exports_select ON public.inspection_output_exports
  FOR SELECT USING (public.can_access_submission(ppi_submission_id));

DROP POLICY IF EXISTS inspection_output_exports_select_org_manager ON public.inspection_output_exports;
CREATE POLICY inspection_output_exports_select_org_manager ON public.inspection_output_exports
  FOR SELECT USING (
    public.get_my_role() = 'org_manager'
    AND EXISTS (
      SELECT 1 FROM public.ppi_submissions submission
      WHERE submission.id = inspection_output_exports.ppi_submission_id
        AND submission.performer_id IN (SELECT profile_id FROM public.my_org_tech_profile_ids())
    )
  );

DROP POLICY IF EXISTS inspection_output_exports_select_admin ON public.inspection_output_exports;
CREATE POLICY inspection_output_exports_select_admin ON public.inspection_output_exports
  FOR SELECT USING (public.get_my_role() = 'admin');

REVOKE ALL ON TABLE public.inspection_output_exports FROM anon, authenticated;
GRANT SELECT ON TABLE public.inspection_output_exports TO authenticated;
GRANT ALL ON TABLE public.inspection_output_exports TO service_role;

-- Lease-based claim for the worker; SKIP LOCKED keeps concurrent workers from
-- rendering the same export.
CREATE OR REPLACE FUNCTION public.claim_inspection_output_exports(
  p_worker_id text,
  p_limit integer DEFAULT 1,
  p_lease_seconds integer DEFAULT 600
)
RETURNS SETOF public.inspection_output_exports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT export_row.id
    FROM public.inspection_output_exports AS export_row
    WHERE (
        export_row.status IN ('queued', 'retryable_failure')
        AND export_row.next_attempt_at <= now()
      )
      OR (export_row.status = 'running' AND export_row.lock_expires_at < now())
    ORDER BY export_row.next_attempt_at
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.inspection_output_exports AS export_row
  SET status = 'running',
      attempt_count = export_row.attempt_count + 1,
      locked_by = p_worker_id,
      lock_expires_at = now() + make_interval(secs => p_lease_seconds)
  FROM candidates
  WHERE export_row.id = candidates.id
  RETURNING export_row.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_inspection_output_exports(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_inspection_output_exports(text, integer, integer) TO service_role;

COMMIT;
