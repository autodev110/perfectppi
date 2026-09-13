-- Plan 33: expose only aggregate latency for known social read paths. The
-- representative SQL and its parameters never leave pg_stat_statements.
BEGIN;

CREATE FUNCTION public.get_operational_query_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH mapped AS (
    SELECT
      CASE
        WHEN statement.query ILIKE '%social_cursor_community_post_ids%' THEN 'community_feed'
        WHEN statement.query ILIKE '%list_marketplace_listing_ids_cursor%' THEN 'marketplace_directory'
        WHEN statement.query ILIKE '%list_saved_community_post_ids_cursor%'
          OR statement.query ILIKE '%list_saved_marketplace_listing_ids_cursor%' THEN 'saved_content'
        WHEN statement.query ILIKE '%social_visible_community_group_post_ids_cursor%' THEN 'group_posts'
        WHEN statement.query ILIKE '%search_group_posts_cursor%' THEN 'group_search'
        WHEN statement.query ILIKE '%list_group_members_cursor%' THEN 'group_members'
        WHEN statement.query ILIKE '%list_community_group_faq_cursor%' THEN 'group_faq'
        WHEN statement.query ILIKE '%search_profiles_cursor%' THEN 'people_search'
        WHEN statement.query ILIKE '%search_community_posts_cursor%'
          OR statement.query ILIKE '%search_community_groups_cursor%'
          OR statement.query ILIKE '%search_vehicles_cursor%'
          OR statement.query ILIKE '%search_marketplace_listings_cursor%'
          OR statement.query ILIKE '%search_technicians_cursor%'
          OR statement.query ILIKE '%search_community_events_cursor%' THEN 'unified_search'
        ELSE NULL
      END AS operation_code,
      statement.calls,
      statement.total_exec_time,
      statement.max_exec_time,
      statement.rows
    FROM extensions.pg_stat_statements statement
    WHERE statement.toplevel
      AND ltrim(lower(statement.query)) ~ '^(select|with)(\s|$)'
  ), aggregated AS (
    SELECT
      operation_code,
      sum(calls)::bigint AS calls,
      round((sum(total_exec_time) / NULLIF(sum(calls), 0))::numeric, 2) AS mean_exec_ms,
      round(max(max_exec_time)::numeric, 2) AS max_exec_ms,
      round(sum(total_exec_time)::numeric, 2) AS total_exec_ms,
      sum(rows)::bigint AS rows
    FROM mapped
    WHERE operation_code IS NOT NULL
    GROUP BY operation_code
  )
  SELECT jsonb_build_object(
    'statsReset', (SELECT info.stats_reset FROM extensions.pg_stat_statements_info info),
    'operations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'operationCode', operation_code,
        'calls', calls,
        'meanExecMs', mean_exec_ms,
        'maxExecMs', max_exec_ms,
        'totalExecMs', total_exec_ms,
        'rows', rows
      ) ORDER BY max_exec_ms DESC, operation_code)
      FROM aggregated
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_operational_query_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_operational_query_metrics() TO service_role;

COMMENT ON FUNCTION public.get_operational_query_metrics() IS
  'Service-only aggregate latency for allowlisted social read operations; returns no SQL, parameters, content, or identifiers.';

COMMIT;
