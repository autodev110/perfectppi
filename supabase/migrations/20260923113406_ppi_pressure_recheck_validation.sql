-- A pressure retention result is only a recorded test when it carries the
-- second reading and a positive elapsed interval. Keep this as an additive
-- check so existing certified rows remain immutable; NOT VALID avoids making
-- deployment depend on correcting historical drafts, while every new or
-- changed row is enforced immediately.

CREATE OR REPLACE FUNCTION public.ppi_pressure_recheck_valid(
  p_question_key text,
  p_observation jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_value jsonb;
  v_recheck jsonb;
  v_minutes text;
  v_max numeric;
BEGIN
  IF public.ppi_structured_family(p_question_key) IS DISTINCT FROM 'tire_pressure'
    OR p_observation IS NULL
    OR p_observation->>'state' IS DISTINCT FROM 'observed'
  THEN
    RETURN true;
  END IF;

  v_value := p_observation->'value';
  IF COALESCE(v_value->>'pressure_loss', 'not_tested') NOT IN ('observed', 'not_observed_during_test') THEN
    RETURN true;
  END IF;

  v_recheck := v_value->'recheck';
  IF jsonb_typeof(v_recheck) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;

  v_max := CASE v_value->>'unit'
    WHEN 'psi' THEN 120
    WHEN 'kpa' THEN 830
    ELSE NULL
  END;
  v_minutes := v_recheck->>'minutes_elapsed';

  IF v_max IS NULL
    OR NOT public.ppi_decimal_within(v_recheck->>'reading', v_max)
    OR COALESCE(v_minutes, '') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
  THEN
    RETURN false;
  END IF;

  RETURN v_minutes::numeric > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.ppi_pressure_recheck_valid(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ppi_pressure_recheck_valid(text, jsonb) TO authenticated, service_role;

ALTER TABLE public.ppi_answers
  ADD CONSTRAINT ppi_answers_pressure_recheck_complete
  CHECK (public.ppi_pressure_recheck_valid(question_key, observation))
  NOT VALID;
