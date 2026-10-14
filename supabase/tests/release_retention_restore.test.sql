BEGIN;

INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES ('ac000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'restorefixture@example.test', '{"username":"restorefixture"}', now(), now());
CREATE TEMP TABLE fixture AS SELECT id AS profile_id FROM public.profiles WHERE auth_user_id = 'ac000000-0000-4000-8000-000000000001';
GRANT SELECT ON fixture TO service_role;
INSERT INTO public.organizations(id, name, slug) VALUES ('ac000000-0000-4000-8000-000000000002', 'Retention fixture', 'retention-fixture');
UPDATE public.profiles SET role = 'org_manager' WHERE id = (SELECT profile_id FROM fixture);
INSERT INTO public.technician_profiles(profile_id, organization_id) VALUES ((SELECT profile_id FROM fixture), 'ac000000-0000-4000-8000-000000000002')
ON CONFLICT (profile_id) DO UPDATE SET organization_id = EXCLUDED.organization_id;
INSERT INTO public.partner_connections(id, organization_id, external_organization_id, scopes, token_prefix, token_hash, token_last_four, webhook_secret_ciphertext, webhook_url)
VALUES ('ac000000-0000-4000-8000-000000000003', 'ac000000-0000-4000-8000-000000000002', 'test', ARRAY['inspections:read'], 'testprefix', repeat('a',64), 'last', 'encrypted', 'https://fixture.example.test/hook');
INSERT INTO public.partner_user_link_transactions(partner_connection_id, external_user_id, state, redirect_uri, expires_at)
VALUES ('ac000000-0000-4000-8000-000000000003', 'external', 'fixturestate', 'https://fixture.example.test/callback', now() - interval '60 days');
INSERT INTO public.outbound_events(id, partner_connection_id, event_type, payload, dedupe_key, status)
VALUES ('ac000000-0000-4000-8000-000000000004', 'ac000000-0000-4000-8000-000000000003', 'inspection.created', '{"test":true}', 'fixture', 'pending');

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.requeue_restored_account_deletion(uuid,uuid,uuid,timestamptz)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.purge_partner_retention_records(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Privileged retention/restore functions are exposed';
  END IF;
END;
$$;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF NOT public.revoke_partner_connection('ac000000-0000-4000-8000-000000000003', 'ac000000-0000-4000-8000-000000000002', (SELECT profile_id FROM fixture)) THEN
    RAISE EXCEPTION 'Revocation did not find connection';
  END IF;
  IF EXISTS (SELECT 1 FROM public.partner_connections WHERE id = 'ac000000-0000-4000-8000-000000000003' AND (webhook_secret_ciphertext <> '' OR webhook_url IS NOT NULL)) THEN
    RAISE EXCEPTION 'Revoked recoverable credentials remain';
  END IF;
  IF EXISTS (SELECT 1 FROM public.partner_user_link_transactions WHERE state = 'fixturestate' AND status <> 'revoked')
    OR EXISTS (SELECT 1 FROM public.outbound_events WHERE id = 'ac000000-0000-4000-8000-000000000004' AND status <> 'failed') THEN
    RAISE EXCEPTION 'Revocation was incomplete';
  END IF;
END;
$$;

-- Missing approval retains records. Updating an old fixture bypasses only the
-- timestamp trigger, not the retention eligibility or legal-hold protections.
RESET ROLE;
ALTER TABLE public.outbound_events DISABLE TRIGGER outbound_events_updated_at;
UPDATE public.outbound_events SET updated_at = now() - interval '60 days' WHERE id = 'ac000000-0000-4000-8000-000000000004';
ALTER TABLE public.outbound_events ENABLE TRIGGER outbound_events_updated_at;
SET LOCAL ROLE service_role;
SELECT public.purge_partner_retention_records(100);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.outbound_events WHERE id = 'ac000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'Purged before approval';
  END IF;
END $$;
RESET ROLE;
INSERT INTO public.moderation_retention_policies(basis, retention_days, approval_reference, approved_by)
VALUES ('partner_delivery', 30, 'synthetic test approval', (SELECT profile_id FROM fixture)),
  ('partner_link_transactions', 30, 'synthetic test approval', (SELECT profile_id FROM fixture));
SAVEPOINT held_records;
-- Even a not-yet-authorized consent attempt is preserved for a held org.
INSERT INTO public.moderation_items(entity_type, entity_id, author_id, status, risk_level, decision, model_provider, model_version)
VALUES ('profile', (SELECT profile_id FROM fixture), (SELECT profile_id FROM fixture), 'legal_hold', 'critical', 'legal_hold', 'test', 'test/1');
SET LOCAL ROLE service_role;
SELECT public.purge_partner_retention_records(100);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.outbound_events WHERE id = 'ac000000-0000-4000-8000-000000000004')
    OR NOT EXISTS (SELECT 1 FROM public.partner_user_link_transactions WHERE state = 'fixturestate') THEN
    RAISE EXCEPTION 'Purged held records';
  END IF;
END $$;
ROLLBACK TO SAVEPOINT held_records;
SET LOCAL ROLE service_role;
SELECT public.purge_partner_retention_records(100);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.outbound_events WHERE id = 'ac000000-0000-4000-8000-000000000004')
    OR EXISTS (SELECT 1 FROM public.partner_user_link_transactions WHERE state = 'fixturestate') THEN
    RAISE EXCEPTION 'Approved expired records not purged';
  END IF;
END $$;

SELECT public.requeue_restored_account_deletion('ac000000-0000-4000-8000-000000000005', (SELECT profile_id FROM fixture), 'ac000000-0000-4000-8000-000000000001', now());
SELECT public.requeue_restored_account_deletion('ac000000-0000-4000-8000-000000000005', (SELECT profile_id FROM fixture), 'ac000000-0000-4000-8000-000000000001', now());
DO $$ BEGIN
  IF (SELECT count(*) FROM public.privacy_requests WHERE id = 'ac000000-0000-4000-8000-000000000005' AND status = 'submitted') <> 1 THEN
    RAISE EXCEPTION 'Restore replay is not idempotent';
  END IF;
  BEGIN
    PERFORM public.requeue_restored_account_deletion('ac000000-0000-4000-8000-000000000006', (SELECT profile_id FROM fixture), 'ac000000-0000-4000-8000-000000000009', now());
    RAISE EXCEPTION 'Restore replay accepted another account';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
-- A partial restore can bring back Auth without its profile. The verified
-- Admin-API identity still queues through the normal deletion worker.
SAVEPOINT orphaned_auth;
DELETE FROM public.profiles WHERE id = (SELECT profile_id FROM fixture);
SELECT public.requeue_restored_account_deletion('ac000000-0000-4000-8000-000000000007', (SELECT profile_id FROM fixture), 'ac000000-0000-4000-8000-000000000001', now());
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.privacy_requests WHERE id = 'ac000000-0000-4000-8000-000000000007'
    AND profile_id IS NULL AND auth_user_id = 'ac000000-0000-4000-8000-000000000001'
    AND result_metadata->>'profileId' = (SELECT profile_id::text FROM fixture)) THEN
    RAISE EXCEPTION 'Orphan Auth deletion identity lost';
  END IF;
END $$;
ROLLBACK TO SAVEPOINT orphaned_auth;
RESET ROLE;
ROLLBACK;
