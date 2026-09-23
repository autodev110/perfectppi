-- Body damage markers carry the diagram view they were placed on
-- ({view, x, y}, 06-field-map-and-rules.md). Only the generic top view exists,
-- so any other view is rejected. Replaces ppi_observation_error from
-- 20260923101000 unchanged apart from that one condition; CREATE OR REPLACE
-- keeps its owner and privileges, and the guard trigger picks it up at once.

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
        -- Only the generic top view exists. The API additionally keeps each
        -- marker on its own panel, and the renderer clamps it there again.
        AND COALESCE(v_item #>> '{marker,view}', 'top') = 'top'
      ) THEN
        RETURN 'defect_marker';
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;

  RETURN 'unknown_question_key';
END;
$$;
