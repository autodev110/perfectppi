\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  metrics jsonb;
BEGIN
  metrics := public.get_operational_query_metrics();
  IF jsonb_typeof(metrics) <> 'object'
     OR jsonb_typeof(metrics->'operations') <> 'array'
     OR NOT metrics ? 'statsReset' THEN
    RAISE EXCEPTION 'operational query metrics returned an invalid envelope';
  END IF;
  IF metrics::text ~* '(query|parameter|content|vehicle_id|profile_id)' THEN
    RAISE EXCEPTION 'operational query metrics leaked a forbidden field';
  END IF;
  IF has_function_privilege('anon', 'public.get_operational_query_metrics()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_operational_query_metrics()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_operational_query_metrics()', 'EXECUTE') THEN
    RAISE EXCEPTION 'operational query metrics privileges are incorrect';
  END IF;
END
$$;

ROLLBACK;
