-- Which recent migrations are actually present in a database whose
-- supabase_migrations.schema_migrations history is unreliable (migrations
-- were applied by hand in the SQL editor). One signature object per file
-- since 2026-09-12; run it in the Supabase SQL editor and apply, in
-- filename order, every file whose `applied` column is false. Afterwards
-- record the history so `supabase db push` works again:
--
--   for v in $(ls supabase/migrations | cut -d_ -f1); do
--     supabase migration repair --status applied "$v"
--   done
--
-- A row is only a proxy (one object per migration); the SQL suite on a
-- fresh chain remains the real test of a complete schema.
select * from (
  select '20260912100000' as version, '20260912100000_service_message_contacts_and_vehicle_visibility.sql' as file, to_regprocedure('public.derive_conversation_contact_kind()') is not null as applied
union all
  select '20260912110000', '20260912110000_group_admin_role_enum.sql', exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='community_group_role' and e.enumlabel='admin')
union all
  select '20260912111000', '20260912111000_group_admin_role_and_owner_safety.sql', to_regprocedure('public.community_group_visibility_rank(public.community_group_visibility)') is not null
union all
  select '20260912120000', '20260912120000_share_previews.sql', to_regprocedure('public.community_post_share_preview(uuid)') is not null
union all
  select '20260912130000', '20260912130000_group_images.sql', to_regprocedure('public.set_community_group_image(uuid, uuid, text, text)') is not null
union all
  select '20260912140000', '20260912140000_post_type_enum_values.sql', exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='community_post_type' and e.enumlabel='build_update')
union all
  select '20260912141000', '20260912141000_structured_post_types.sql', to_regclass('public.community_poll_votes') is not null
union all
  select '20260912150000', '20260912150000_helpful_answer_enum.sql', exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='notification_type' and e.enumlabel='answer_helpful')
union all
  select '20260912151000', '20260912151000_helpful_answers_question_outcomes.sql', to_regclass('public.community_comment_helpful_reactions') is not null
union all
  select '20260912160000', '20260912160000_unified_search.sql', to_regclass('public.vehicle_make_aliases') is not null
union all
  select '20260912170000', '20260912170000_saved_search_enum.sql', exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='notification_type' and e.enumlabel='saved_search_match')
union all
  select '20260912171000', '20260912171000_marketplace_saved_searches.sql', to_regclass('public.marketplace_saved_searches') is not null
union all
  select '20260912180000', '20260912180000_listing_status_enum.sql', exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='listing_status' and e.enumlabel='pending')
union all
  select '20260912181000', '20260912181000_listing_lifecycle.sql', to_regprocedure('public.marketplace_listing_is_public(public.listing_status)') is not null
union all
  select '20260912190000', '20260912190000_listing_inspection_sharing.sql', to_regprocedure('public.list_attachable_listing_inspections(uuid, uuid)') is not null
union all
  select '20260912193242', '20260912193242_operational_worker_runs.sql', to_regclass('public.operational_worker_runs') is not null
union all
  select '20260912200000', '20260912200000_technician_credentials_and_service_profile.sql', to_regclass('public.technician_credentials') is not null
union all
  select '20260912210000', '20260912210000_saved_collection_and_build_notification_enum.sql', exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='notification_type' and e.enumlabel='build_update')
union all
  select '20260912211000', '20260912211000_named_saved_collections_and_build_subscriptions.sql', to_regclass('public.saved_collections') is not null
union all
  select '20260912220000', '20260912220000_member_contribution_reputation.sql', to_regprocedure('public.member_contribution_summary(uuid, uuid)') is not null
union all
  select '20260912230000', '20260912230000_community_event_notification_types.sql', exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='notification_type' and e.enumlabel='event_cancelled')
union all
  select '20260912231000', '20260912231000_community_events.sql', to_regclass('public.community_events') is not null
union all
  select '20260912232000', '20260912232000_fix_revision_account_deletion.sql', to_regprocedure('public.prevent_moderation_history_mutation()') is not null
union all
  select '20260912233000', '20260912233000_community_event_photo_thread.sql', to_regclass('public.community_event_photo_posts') is not null
union all
  select '20260912234000', '20260912234000_moderation_visibility_integrity.sql', to_regprocedure('public.moderation_visibility_integrity_status()') is not null
union all
  select '20260912234549', '20260912234549_restore_technician_profile_table_privileges.sql', has_table_privilege('authenticated', 'public.technician_profiles', 'DELETE')
union all
  select '20260913010000', '20260913010000_marketplace_listing_table_privileges.sql', has_table_privilege('authenticated', 'public.marketplace_listings', 'DELETE') and not has_table_privilege('anon', 'public.marketplace_listings', 'SELECT')
union all
  select '20260913020000', '20260913020000_community_feed_quality_controls.sql', to_regclass('public.community_feed_mutes') is not null
union all
  select '20260913030000', '20260913030000_contact_discovery_vehicle_configuration.sql', to_regclass('public.profile_contact_identifiers') is not null
union all
  select '20260913040000', '20260913040000_vehicle_handoff_verification.sql', to_regclass('public.vehicle_handoff_claims') is not null
union all
  select '20260913050000', '20260913050000_group_quality_tools.sql', to_regclass('public.community_group_faq_entries') is not null
union all
  select '20260913150947', '20260913150947_technician_review_dispute_policy.sql', to_regclass('public.ppi_service_disputes') is not null
union all
  select '20260913161525', '20260913161525_accessibility_media_descriptions.sql', exists (select 1 from information_schema.columns where table_schema='public' and table_name='community_post_media' and column_name='alt_text')
union all
  select '20260913163512', '20260913163512_privacy_safe_product_analytics.sql', to_regclass('public.product_analytics_preferences') is not null
union all
  select '20260913175711', '20260913175711_community_feed_cursor_pagination.sql', to_regprocedure('public.social_cursor_community_post_ids(uuid, public.community_feed_filter, integer, timestamptz, uuid, boolean)') is not null
union all
  select '20260913182857', '20260913182857_unified_search_cursor_pagination.sql', to_regprocedure('public.search_community_posts_cursor(uuid, text, integer, integer, timestamptz, uuid)') is not null
union all
  select '20260913215140', '20260913215140_product_safety_analytics.sql', to_regprocedure('public.get_product_safety_analytics_summary(integer)') is not null
union all
  select '20260913220718', '20260913220718_fix_product_safety_analytics_privileges.sql', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_product_safety_analytics_summary' and p.prosecdef)
union all
  select '20260913230000', '20260913230000_saved_content_cursor_pagination.sql', to_regprocedure('public.list_saved_community_post_ids_cursor(uuid, integer, timestamptz, uuid)') is not null
union all
  select '20260913230100', '20260913230100_group_directory_cursor_pagination.sql', to_regprocedure('public.social_visible_community_group_post_ids_cursor(uuid, uuid, integer, timestamptz, uuid, boolean)') is not null
union all
  select '20260913230200', '20260913230200_marketplace_directory_cursor_pagination.sql', to_regprocedure('public.list_marketplace_listing_ids_cursor(uuid, jsonb, text, integer, numeric, timestamptz, uuid)') is not null
union all
  select '20260913230300', '20260913230300_operational_query_metrics.sql', to_regprocedure('public.get_operational_query_metrics()') is not null
union all
  select '20260914120000', '20260914120000_vehicle_factory_spec.sql', to_regprocedure('public.guard_vehicle_factory_spec()') is not null
union all
  select '20260914150000', '20260914150000_vehicle_build_stages_enum.sql', to_regtype('public.vehicle_build_stage_status') is not null
union all
  select '20260914151000', '20260914151000_vehicle_build_stages.sql', to_regclass('public.vehicle_build_stages') is not null
union all
  select '20260914170000', '20260914170000_growth_accuracy_kpis.sql', to_regprocedure('public.get_growth_accuracy_kpis(integer)') is not null
union all
  select '20260915100000', '20260915100000_handoff_carries_factory_spec.sql', coalesce(pg_get_functiondef(to_regprocedure('public.claim_vehicle_handoff(uuid, text, text)')), '') like '%factory_spec%'
union all
  select '20260915110000', '20260915110000_report_auto_hide_flag.sql', to_regprocedure('public.submit_moderation_report(uuid, text, uuid, uuid, text, text, text, boolean)') is not null
union all
  select '20260915120000', '20260915120000_core_vehicle_ppi_table_privileges.sql', has_column_privilege('authenticated', 'public.ppi_answers', 'answer_value', 'UPDATE') and not has_table_privilege('authenticated', 'public.ppi_answers', 'UPDATE')
union all
  select '20260915130000', '20260915130000_expanded_ugc_reporting.sql', to_regclass('public.moderation_reporter_hidden_entities') is not null
union all
  select '20260918100000', '20260918100000_comment_reply_notification_enum.sql', exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='notification_type' and e.enumlabel='comment_reply')
union all
  select '20260918101000', '20260918101000_author_edits_and_comment_replies.sql', to_regprocedure('public.edit_community_post(uuid, uuid, text)') is not null
union all
  select '20260918110000', '20260918110000_engagement_signal_analytics.sql', to_regprocedure('public.get_product_engagement_signals(integer)') is not null
union all
  select '20260918162936', '20260918162936_audit_author_edits_replies_and_analytics.sql', to_regprocedure('public.publish_community_author_edit(uuid, text, uuid, text, jsonb, boolean)') is not null
) m order by version;
