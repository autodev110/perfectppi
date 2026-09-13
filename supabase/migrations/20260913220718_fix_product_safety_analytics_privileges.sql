BEGIN;

-- Community content tables intentionally remain unavailable to service_role.
-- This aggregate is the narrow read boundary: its result contains counts and
-- durations only, while raw rows remain inaccessible to the caller.
ALTER FUNCTION public.get_product_safety_analytics_summary(integer)
  SECURITY DEFINER;
ALTER FUNCTION public.get_product_safety_analytics_summary(integer)
  SET search_path = '';

REVOKE ALL ON FUNCTION public.get_product_safety_analytics_summary(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_safety_analytics_summary(integer)
  TO service_role;

COMMENT ON FUNCTION public.get_product_safety_analytics_summary(integer) IS
  'Service-only aggregate plan-section-34 product and safety measures. SECURITY DEFINER is required because callers cannot read raw Community tables; the function returns no identifiers or content and uses an empty search path.';

COMMIT;
