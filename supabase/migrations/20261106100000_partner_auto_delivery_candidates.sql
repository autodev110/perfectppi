-- Finished reports an automatic partner has not been sent, oldest first.
--
-- The delivery worker's sweep asked for the newest 25 refs and then skipped those
-- already delivered, so 25 recent deliveries could hide an older report indefinitely.
-- Revoked connections used up slots the same way. Only a version with no delivery event
-- qualifies, so a failed delivery stays failed and nothing here repeats on every tick.
create or replace function public.partner_auto_delivery_candidates(
  p_systems text[],
  p_since timestamptz,
  p_limit integer
) returns table(ppi_request_id uuid, submission_id uuid, output_version integer)
language sql stable set search_path = '' as $$
  select ref.ppi_request_id, ref.current_submission_id, ready.output_version
  from public.external_inspection_refs ref
  join public.partner_connections connection
    on connection.id = ref.partner_connection_id
   and connection.status = 'active'
   and connection.webhook_url is not null
  cross join lateral (
    select artifact.output_version
    from public.integration_artifacts artifact
    where artifact.external_inspection_ref_id = ref.id
      and artifact.ppi_submission_id = ref.current_submission_id
    group by artifact.output_version
    having count(distinct artifact.artifact_type) filter (
      where artifact.artifact_type in (
        'inspection_report_json', 'inspection_report_pdf',
        'vsc_determination_json', 'vsc_determination_pdf'
      )
    ) = 4
    order by artifact.output_version desc
    limit 1
  ) ready
  where ref.source_system = any(p_systems)
    and ref.integration_status = 'deliverables_ready'
    and ref.current_submission_id is not null
    and ref.updated_at >= p_since
    and not exists (
      select 1 from public.outbound_events event
      where event.partner_connection_id = ref.partner_connection_id
        and event.dedupe_key = 'deliverables_ready:' || ref.id::text
          || ':submission:' || ref.current_submission_id::text
          || ':v' || ready.output_version::text
    )
  order by ref.updated_at
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.partner_auto_delivery_candidates(text[], timestamptz, integer) from public, anon, authenticated;
grant execute on function public.partner_auto_delivery_candidates(text[], timestamptz, integer) to service_role;
