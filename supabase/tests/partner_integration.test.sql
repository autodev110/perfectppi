-- ============================================================================
-- Partner integration acceptance tests (database layer).
--
-- Run against a database with every migration applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/partner_integration.test.sql
--
-- Everything happens inside one transaction that is rolled back at the end, so
-- the test leaves no rows behind and is safe to run repeatedly against a local
-- or branch database. It is NOT safe to point at production.
--
-- Covers: cross-tenant RLS isolation, ownership constraints, snapshot
-- immutability, idempotent creation, user-link resolution, and the
-- all-four-artifacts delivery gate.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off
BEGIN;

-- Assertions report through RAISE NOTICE, so notices must reach the client.
SET client_min_messages TO NOTICE;

-- ---------------------------------------------------------------------------
-- Baseline table privileges
--
-- A hosted Supabase project grants anon/authenticated DML on public tables and
-- relies on RLS to decide what they can actually reach; a local `supabase start`
-- image does not always reproduce those grants. This suite is about RLS policy
-- logic, so the baseline is normalized here — but deliberately ONLY for tables
-- that existed before the integration. Anything migrations 037-040 created keeps
-- exactly the privileges those migrations left it with, so the assertions below
-- about credential tables being unreachable stay genuine.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN (
        'partner_installation_codes', 'partner_connections',
        'partner_user_link_transactions', 'partner_user_links',
        'partner_rate_limit_buckets', 'external_inspection_refs',
        'integration_artifacts', 'output_generation_jobs',
        'outbound_events', 'webhook_delivery_attempts'
      )
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated',
      t.relname
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Assertion helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.ok(assertion boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF assertion THEN
    RAISE NOTICE 'ok   - %', description;
  ELSE
    RAISE EXCEPTION 'FAIL - %', description;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.eq(actual anyelement, expected anyelement, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS NOT DISTINCT FROM expected THEN
    RAISE NOTICE 'ok   - %', description;
  ELSE
    RAISE EXCEPTION 'FAIL - % (expected %, got %)', description, expected, actual;
  END IF;
END $$;

-- Impersonate an end user the way PostgREST does: the authenticated role plus
-- a JWT claim carrying the auth user id. auth.uid() reads that claim, which is
-- what every RLS policy and helper is written against.
CREATE OR REPLACE FUNCTION pg_temp.act_as(auth_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', auth_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as_service()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- ---------------------------------------------------------------------------
-- Fixtures: two unrelated dealerships, each with a technician and a manager.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.make_user(
  p_auth_id uuid,
  p_email text,
  p_role public.user_role
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_profile_id uuid;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) VALUES (
    p_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', p_email, 'x', now(), now(), now()
  );

  -- The handle_new_user trigger already created the profile row.
  UPDATE public.profiles SET role = p_role, display_name = p_email
  WHERE auth_user_id = p_auth_id
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END $$;

DO $$
DECLARE
  org_a uuid := '0a000000-0000-4000-8000-000000000001';
  org_b uuid := '0b000000-0000-4000-8000-000000000001';
  tech_a uuid; tech_b uuid; mgr_a uuid; mgr_b uuid;
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES
    (org_a, 'Alpha Motors', 'alpha-motors'),
    (org_b, 'Beta Auto',    'beta-auto');

  tech_a := pg_temp.make_user('11110000-0000-4000-8000-000000000001', 'tech-a@example.com', 'technician');
  tech_b := pg_temp.make_user('22220000-0000-4000-8000-000000000001', 'tech-b@example.com', 'technician');
  mgr_a  := pg_temp.make_user('33330000-0000-4000-8000-000000000001', 'mgr-a@example.com',  'org_manager');
  mgr_b  := pg_temp.make_user('44440000-0000-4000-8000-000000000001', 'mgr-b@example.com',  'org_manager');

  INSERT INTO public.technician_profiles (profile_id, organization_id, certification_level) VALUES
    (tech_a, org_a, 'ase'),
    (tech_b, org_b, 'ase'),
    (mgr_a,  org_a, 'none'),
    (mgr_b,  org_b, 'none');

  INSERT INTO public.partner_connections (
    id, organization_id, external_organization_id, scopes,
    token_prefix, token_hash, token_last_four, webhook_secret_ciphertext,
    webhook_url, user_link_redirect_uri
  ) VALUES (
    'c0000000-0000-4000-8000-00000000000a', org_a, 'dms-alpha',
    ARRAY['inspections:create','inspections:read','artifacts:read'],
    'aaaaaaaaaaaaaaaa', 'hash-a', 'aaaa', 'cipher-a',
    'https://alpha.example.com/hook', 'https://alpha.example.com/callback'
  ), (
    'c0000000-0000-4000-8000-00000000000b', org_b, 'dms-beta',
    ARRAY['inspections:create','inspections:read','artifacts:read'],
    'bbbbbbbbbbbbbbbb', 'hash-b', 'bbbb', 'cipher-b',
    'https://beta.example.com/hook', 'https://beta.example.com/callback'
  );

  INSERT INTO public.partner_user_links (partner_connection_id, external_user_id, profile_id) VALUES
    ('c0000000-0000-4000-8000-00000000000a', 'alpha-staff-1', tech_a),
    ('c0000000-0000-4000-8000-00000000000b', 'beta-staff-1',  tech_b);
END $$;

-- ---------------------------------------------------------------------------
-- 1. Ownership model
-- ---------------------------------------------------------------------------

DO $$
DECLARE consumer_profile uuid;
BEGIN
  consumer_profile := pg_temp.make_user(
    '55550000-0000-4000-8000-000000000001', 'consumer@example.com', 'consumer'
  );

  -- Existing consumer-owned records keep working unchanged.
  INSERT INTO public.vehicles (id, owner_id, vin, year, make, model)
  VALUES ('e0000000-0000-4000-8000-000000000001', consumer_profile,
          'JH4KA7561PC008269', 1993, 'Acura', 'Legend');

  INSERT INTO public.ppi_requests (
    id, vehicle_id, requester_id, whose_car, requester_role, performer_type, ppi_type, status
  ) VALUES (
    'f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
    consumer_profile, 'own', 'selling', 'self', 'personal', 'draft'
  );

  PERFORM pg_temp.ok(true, 'consumer-owned vehicle and request still insert');

  BEGIN
    INSERT INTO public.vehicles (owner_id, organization_id, vin)
    VALUES (consumer_profile, '0a000000-0000-4000-8000-000000000001', 'X');
    RAISE EXCEPTION 'FAIL - a vehicle owned by both a user and an organization was accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true, 'vehicle rejects two ownership paths at once');
  END;

  BEGIN
    INSERT INTO public.ppi_requests (vehicle_id, whose_car, requester_role, performer_type, ppi_type, status)
    VALUES ('e0000000-0000-4000-8000-000000000001', 'own', 'selling', 'self', 'personal', 'draft');
    RAISE EXCEPTION 'FAIL - a request with no requester at all was accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true, 'request requires exactly one requester path');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Idempotent partner inspection creation
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tech_a uuid := (SELECT id FROM public.profiles WHERE display_name = 'tech-a@example.com');
  first_ref uuid;
  replay_ref uuid;
  created boolean;
  request_count integer;
  vehicle_count integer;
BEGIN
  SELECT ref_id, was_created INTO first_ref, created
  FROM public.partner_create_inspection(
    p_connection_id => 'c0000000-0000-4000-8000-00000000000a',
    p_organization_id => '0a000000-0000-4000-8000-000000000001',
    p_assigned_profile_id => tech_a,
    p_ppi_type => 'general_tech',
    p_external_organization_id => 'dms-alpha',
    p_external_actor_id => 'alpha-staff-1',
    p_idempotency_key => 'dms-alpha:case-1:phase-1',
    p_request_fingerprint => 'fingerprint-1',
    p_vehicle_snapshot => '{"vin":"1HGCM82633A004352","stockNumber":"A1024"}'::jsonb,
    p_vin => '1HGCM82633A004352',
    p_external_recon_case_id => 'case-1',
    p_external_inspection_phase_id => 'phase-1',
    p_year => 2023, p_make => 'Toyota', p_model => 'Camry', p_mileage => 24150
  );
  PERFORM pg_temp.eq(created, true, 'first create returns created = true');

  -- Acceptance test 8: repeated create requests produce exactly one inspection.
  SELECT ref_id, was_created INTO replay_ref, created
  FROM public.partner_create_inspection(
    p_connection_id => 'c0000000-0000-4000-8000-00000000000a',
    p_organization_id => '0a000000-0000-4000-8000-000000000001',
    p_assigned_profile_id => tech_a,
    p_ppi_type => 'general_tech',
    p_external_organization_id => 'dms-alpha',
    p_external_actor_id => 'alpha-staff-1',
    p_idempotency_key => 'dms-alpha:case-1:phase-1',
    p_request_fingerprint => 'fingerprint-1',
    p_vehicle_snapshot => '{"vin":"1HGCM82633A004352","stockNumber":"A1024"}'::jsonb,
    p_vin => '1HGCM82633A004352',
    p_external_recon_case_id => 'case-1',
    p_external_inspection_phase_id => 'phase-1',
    p_year => 2023, p_make => 'Toyota', p_model => 'Camry', p_mileage => 24150
  );
  PERFORM pg_temp.eq(created, false, 'replay returns created = false');
  PERFORM pg_temp.eq(replay_ref, first_ref, 'replay returns the original inspection');

  SELECT count(*) INTO request_count
  FROM public.ppi_requests WHERE source_system = 'dealerspace';
  PERFORM pg_temp.eq(request_count, 1, 'exactly one PPI inspection exists after the replay');

  -- Acceptance test 9: same key, different payload is a conflict.
  BEGIN
    PERFORM public.partner_create_inspection(
      p_connection_id => 'c0000000-0000-4000-8000-00000000000a',
      p_organization_id => '0a000000-0000-4000-8000-000000000001',
      p_assigned_profile_id => tech_a,
      p_ppi_type => 'general_tech',
      p_external_organization_id => 'dms-alpha',
      p_external_actor_id => 'alpha-staff-1',
      p_idempotency_key => 'dms-alpha:case-1:phase-1',
      p_request_fingerprint => 'fingerprint-DIFFERENT',
      p_vehicle_snapshot => '{"vin":"1HGCM82633A004352"}'::jsonb,
      p_vin => '1HGCM82633A004352'
    );
    RAISE EXCEPTION 'FAIL - a reused idempotency key with a different payload was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    PERFORM pg_temp.eq(SQLERRM, 'idempotency_conflict', 'divergent replay raises idempotency_conflict');
  END;

  -- A second inspection of the same car reuses the organization's vehicle.
  PERFORM public.partner_create_inspection(
    p_connection_id => 'c0000000-0000-4000-8000-00000000000a',
    p_organization_id => '0a000000-0000-4000-8000-000000000001',
    p_assigned_profile_id => tech_a,
    p_ppi_type => 'general_tech',
    p_external_organization_id => 'dms-alpha',
    p_external_actor_id => 'alpha-staff-1',
    p_idempotency_key => 'dms-alpha:case-2:phase-2',
    p_request_fingerprint => 'fingerprint-2',
    p_vehicle_snapshot => '{"vin":"1HGCM82633A004352"}'::jsonb,
    p_vin => '1HGCM82633A004352'
  );

  SELECT count(*) INTO vehicle_count
  FROM public.vehicles WHERE organization_id = '0a000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.eq(vehicle_count, 1, 'a second inspection reuses the organization-owned vehicle');
END $$;

-- ---------------------------------------------------------------------------
-- 3. Snapshot immutability (acceptance test 10)
-- ---------------------------------------------------------------------------

DO $$
DECLARE ref_id uuid := (SELECT id FROM public.external_inspection_refs WHERE idempotency_key = 'dms-alpha:case-1:phase-1');
        stored jsonb;
BEGIN
  BEGIN
    UPDATE public.external_inspection_refs
    SET vehicle_snapshot = '{"vin":"TAMPERED"}'::jsonb
    WHERE id = ref_id;
    RAISE EXCEPTION 'FAIL - the vehicle snapshot was silently overwritten';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    PERFORM pg_temp.ok(true, 'snapshot cannot be changed by an ordinary update');
  END;

  SELECT vehicle_snapshot INTO stored FROM public.external_inspection_refs WHERE id = ref_id;
  PERFORM pg_temp.eq(stored->>'vin', '1HGCM82633A004352', 'snapshot data is unchanged after the attempt');

  -- Correlation columns are equally immutable.
  BEGIN
    UPDATE public.external_inspection_refs
    SET partner_connection_id = 'c0000000-0000-4000-8000-00000000000b'
    WHERE id = ref_id;
    RAISE EXCEPTION 'FAIL - an inspection was repointed at another connection';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    PERFORM pg_temp.ok(true, 'an inspection cannot be moved to another connection');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Cross-tenant RLS (acceptance tests 7 and 21)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  alpha_request uuid := (
    SELECT ppi_request_id FROM public.external_inspection_refs
    WHERE idempotency_key = 'dms-alpha:case-1:phase-1'
  );
  visible integer;
BEGIN
  -- Alpha's own technician: the assignee sees their work.
  PERFORM pg_temp.act_as('11110000-0000-4000-8000-000000000001');
  SELECT count(*) INTO visible FROM public.ppi_requests WHERE id = alpha_request;
  PERFORM pg_temp.eq(visible, 1, 'the mapped technician sees the inspection assigned to them');

  SELECT count(*) INTO visible FROM public.external_inspection_refs;
  PERFORM pg_temp.eq(visible, 2, 'the assigned technician sees their own integration records');

  -- Beta's technician: another organization entirely.
  PERFORM pg_temp.act_as('22220000-0000-4000-8000-000000000001');
  SELECT count(*) INTO visible FROM public.ppi_requests WHERE id = alpha_request;
  PERFORM pg_temp.eq(visible, 0, 'a technician at another organization cannot see the request');

  SELECT count(*) INTO visible FROM public.external_inspection_refs;
  PERFORM pg_temp.eq(visible, 0, 'a technician at another organization sees no snapshots');

  -- Beta's manager.
  PERFORM pg_temp.act_as('44440000-0000-4000-8000-000000000001');
  SELECT count(*) INTO visible FROM public.ppi_requests WHERE id = alpha_request;
  PERFORM pg_temp.eq(visible, 0, 'a manager at another organization cannot see the request');

  SELECT count(*) INTO visible FROM public.external_inspection_refs;
  PERFORM pg_temp.eq(visible, 0, 'a manager at another organization sees no snapshots');

  -- Alpha's manager sees incoming work, including inspections with no submission.
  PERFORM pg_temp.act_as('33330000-0000-4000-8000-000000000001');
  SELECT count(*) INTO visible FROM public.ppi_requests WHERE id = alpha_request;
  PERFORM pg_temp.eq(visible, 1, 'the requesting organization manager sees the incoming inspection');

  PERFORM pg_temp.act_as_service();
END $$;

-- ---------------------------------------------------------------------------
-- 5. Credential tables are unreachable from a browser session
-- ---------------------------------------------------------------------------

DO $$
DECLARE visible integer;
BEGIN
  PERFORM pg_temp.act_as('33330000-0000-4000-8000-000000000001');

  BEGIN
    SELECT count(*) INTO visible FROM public.partner_connections;
    PERFORM pg_temp.eq(visible, 0, 'partner_connections exposes no rows to an authenticated session');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.ok(true, 'partner_connections is not even selectable by authenticated');
  END;

  BEGIN
    SELECT count(*) INTO visible FROM public.partner_installation_codes;
    PERFORM pg_temp.eq(visible, 0, 'installation codes expose no rows to an authenticated session');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.ok(true, 'installation codes are not selectable by authenticated');
  END;

  BEGIN
    SELECT count(*) INTO visible FROM public.partner_user_link_transactions;
    PERFORM pg_temp.eq(visible, 0, 'link transactions expose no rows to an authenticated session');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.ok(true, 'link transactions are not selectable by authenticated');
  END;

  -- A technician may see their own link, and only their own.
  PERFORM pg_temp.act_as('11110000-0000-4000-8000-000000000001');
  SELECT count(*) INTO visible FROM public.partner_user_links;
  PERFORM pg_temp.eq(visible, 1, 'a technician sees exactly their own account link');

  PERFORM pg_temp.act_as_service();
END $$;

-- ---------------------------------------------------------------------------
-- 6. Tenancy columns are immutable even for the row's own technician
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  alpha_request uuid := (
    SELECT ppi_request_id FROM public.external_inspection_refs
    WHERE idempotency_key = 'dms-alpha:case-1:phase-1'
  );
BEGIN
  PERFORM pg_temp.act_as('11110000-0000-4000-8000-000000000001');

  BEGIN
    UPDATE public.ppi_requests
    SET requesting_organization_id = '0b000000-0000-4000-8000-000000000001'
    WHERE id = alpha_request;
    RAISE EXCEPTION 'FAIL - the assigned technician moved a request to another organization';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    PERFORM pg_temp.ok(true, 'the assigned technician cannot repoint a request at another organization');
  END;

  PERFORM pg_temp.act_as_service();
END $$;

-- ---------------------------------------------------------------------------
-- 7. Output jobs: one per submission, retry-safe versioning
--    (acceptance tests 12 and 13)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tech_a uuid := (SELECT id FROM public.profiles WHERE display_name = 'tech-a@example.com');
  alpha_request uuid := (
    SELECT ppi_request_id FROM public.external_inspection_refs
    WHERE idempotency_key = 'dms-alpha:case-1:phase-1'
  );
  submission uuid := 'd0000000-0000-4000-8000-000000000001';
  job_count integer;
  version integer;
BEGIN
  INSERT INTO public.ppi_submissions (id, ppi_request_id, performer_id, version, status, submitted_at)
  VALUES (submission, alpha_request, tech_a, 1, 'submitted', now());

  PERFORM public.enqueue_output_generation_job(submission);
  PERFORM public.enqueue_output_generation_job(submission);

  SELECT count(*) INTO job_count FROM public.output_generation_jobs WHERE ppi_submission_id = submission;
  PERFORM pg_temp.eq(job_count, 1, 'submitting creates exactly one durable output job');

  -- A failed job is re-armed at the same version, not replaced by a new one.
  UPDATE public.output_generation_jobs SET status = 'failed', attempt_count = 5
  WHERE ppi_submission_id = submission;

  SELECT output_version INTO version
  FROM public.enqueue_output_generation_job(submission, 'manual_retry');
  PERFORM pg_temp.eq(version, 1, 'a retry resumes the same output version');

  SELECT count(*) INTO job_count FROM public.output_generation_jobs WHERE ppi_submission_id = submission;
  PERFORM pg_temp.eq(job_count, 1, 'a retry does not create a second job');

  -- Manual regeneration deliberately mints a new immutable version.
  UPDATE public.output_generation_jobs SET status = 'completed' WHERE ppi_submission_id = submission;
  SELECT output_version INTO version
  FROM public.enqueue_output_generation_job(submission, 'manual_regeneration', NULL, true);
  PERFORM pg_temp.eq(version, 2, 'manual regeneration creates a new output version');
END $$;

-- ---------------------------------------------------------------------------
-- 8. Atomic job claiming and stale-lease recovery
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  submission uuid := 'd0000000-0000-4000-8000-000000000001';
  first_claim integer;
  second_claim integer;
BEGIN
  UPDATE public.output_generation_jobs
  SET status = 'pending', next_attempt_at = now(), attempt_count = 0
  WHERE ppi_submission_id = submission AND output_version = 2;

  SELECT count(*) INTO first_claim
  FROM public.claim_output_generation_jobs('worker-1', 10, 300);
  PERFORM pg_temp.ok(first_claim >= 1, 'a worker claims the pending job');

  SELECT count(*) INTO second_claim
  FROM public.claim_output_generation_jobs('worker-2', 10, 300);
  PERFORM pg_temp.eq(second_claim, 0, 'a second worker cannot claim the same leased job');

  -- Simulate a worker that died mid-flight.
  UPDATE public.output_generation_jobs
  SET lock_expires_at = now() - interval '1 minute'
  WHERE locked_by = 'worker-1';

  SELECT count(*) INTO second_claim
  FROM public.claim_output_generation_jobs('worker-3', 10, 300);
  PERFORM pg_temp.ok(second_claim >= 1, 'an expired lease is reclaimed by another worker');
END $$;

-- ---------------------------------------------------------------------------
-- 8b. Reconciliation: a submission whose enqueue never landed is recovered
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tech_a uuid := (SELECT id FROM public.profiles WHERE display_name = 'tech-a@example.com');
  alpha_request uuid := (
    SELECT ppi_request_id FROM public.external_inspection_refs
    WHERE idempotency_key = 'dms-alpha:case-2:phase-2'
  );
  orphan uuid := 'd0000000-0000-4000-8000-000000000002';
  swept integer;
  job_version integer;
BEGIN
  -- Submitted five minutes ago, with no job row: exactly the state left behind
  -- when the post-submit enqueue fails.
  INSERT INTO public.ppi_submissions (id, ppi_request_id, performer_id, version, status, submitted_at)
  VALUES (orphan, alpha_request, tech_a, 1, 'submitted', now() - interval '5 minutes');

  swept := public.reconcile_output_generation_jobs(20);
  PERFORM pg_temp.ok(swept >= 1, 'the sweep enqueues a submission that has no job');

  SELECT output_version INTO job_version
  FROM public.output_generation_jobs WHERE ppi_submission_id = orphan;
  PERFORM pg_temp.eq(job_version, 1, 'the recovered job starts at version 1');

  -- Running it again must not queue the same submission twice.
  swept := public.reconcile_output_generation_jobs(20);
  PERFORM pg_temp.eq(
    (SELECT count(*)::integer FROM public.output_generation_jobs WHERE ppi_submission_id = orphan),
    1,
    'a second sweep does not duplicate the job'
  );

  -- A submission that only just landed is left to the inline enqueue.
  INSERT INTO public.ppi_submissions (id, ppi_request_id, performer_id, version, status, submitted_at)
  VALUES ('d0000000-0000-4000-8000-000000000003', alpha_request, tech_a, 2, 'submitted', now());

  PERFORM public.reconcile_output_generation_jobs(20);
  PERFORM pg_temp.eq(
    (SELECT count(*)::integer FROM public.output_generation_jobs
     WHERE ppi_submission_id = 'd0000000-0000-4000-8000-000000000003'),
    0,
    'a just-submitted inspection is not swept out from under the inline enqueue'
  );
END $$;

-- ---------------------------------------------------------------------------
-- 9. Delivery gate: all four artifacts or nothing
--    (acceptance tests 14 and 15)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  submission uuid := 'd0000000-0000-4000-8000-000000000001';
  ready integer;
BEGIN
  INSERT INTO public.integration_artifacts
    (ppi_submission_id, output_version, artifact_type, content_type, size_bytes, sha256, storage_key)
  VALUES
    (submission, 1, 'inspection_report_json', 'application/json', 10, repeat('a', 64), 'k/1.json'),
    (submission, 1, 'inspection_report_pdf',  'application/pdf',  10, repeat('b', 64), 'k/1.pdf'),
    (submission, 1, 'vsc_determination_json', 'application/json', 10, repeat('c', 64), 'k/2.json');

  ready := public.ready_output_version(submission);
  PERFORM pg_temp.eq(ready, NULL::integer, 'three of four artifacts is not deliverable');

  INSERT INTO public.integration_artifacts
    (ppi_submission_id, output_version, artifact_type, content_type, size_bytes, sha256, storage_key)
  VALUES
    (submission, 1, 'vsc_determination_pdf', 'application/pdf', 10, repeat('d', 64), 'k/2.pdf');

  ready := public.ready_output_version(submission);
  PERFORM pg_temp.eq(ready, 1, 'all four artifacts makes the version deliverable');

  -- Artifacts are append-only: a recorded checksum can never be rewritten.
  BEGIN
    UPDATE public.integration_artifacts SET sha256 = repeat('e', 64) WHERE storage_key = 'k/1.json';
    RAISE EXCEPTION 'FAIL - an artifact checksum was rewritten';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    PERFORM pg_temp.ok(true, 'artifact records are immutable');
  END;

  -- A malformed checksum is rejected at the column.
  BEGIN
    INSERT INTO public.integration_artifacts
      (ppi_submission_id, output_version, artifact_type, content_type, size_bytes, sha256, storage_key)
    VALUES (submission, 9, 'inspection_report_json', 'application/json', 10, 'not-a-digest', 'k/9.json');
    RAISE EXCEPTION 'FAIL - a malformed sha256 was accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true, 'a malformed sha256 is rejected');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Delivery requests are idempotent (acceptance test 18)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  ref_id uuid := (
    SELECT id FROM public.external_inspection_refs
    WHERE idempotency_key = 'dms-alpha:case-1:phase-1'
  );
  first_event uuid;
  second_event uuid;
  event_count integer;
  observed_status text;
BEGIN
  UPDATE public.external_inspection_refs
  SET current_submission_id = 'd0000000-0000-4000-8000-000000000001'
  WHERE id = ref_id;

  SELECT id INTO first_event
  FROM public.partner_request_delivery(ref_id, 1, gen_random_uuid(), now());

  SELECT id INTO second_event
  FROM public.partner_request_delivery(ref_id, 1, gen_random_uuid(), now());

  PERFORM pg_temp.eq(second_event, first_event, 'clicking Send twice joins the same delivery');

  SELECT count(*) INTO event_count
  FROM public.outbound_events
  WHERE external_inspection_ref_id = ref_id
    AND event_type = 'inspection.deliverables_ready';
  PERFORM pg_temp.eq(event_count, 1, 'only one deliverables_ready event is queued');

  SELECT r.delivery_status INTO observed_status
  FROM public.external_inspection_refs r WHERE r.id = ref_id;
  PERFORM pg_temp.eq(observed_status, 'queued', 'the inspection is marked queued for delivery');

  -- An exhausted delivery is re-armed by an explicit retry, same logical event.
  UPDATE public.outbound_events SET status = 'failed', attempt_count = 8 WHERE id = first_event;
  SELECT id INTO second_event
  FROM public.partner_request_delivery(ref_id, 1, gen_random_uuid(), now());

  PERFORM pg_temp.eq(second_event, first_event, 'retrying re-arms the same event rather than duplicating it');
  SELECT e.status INTO observed_status FROM public.outbound_events e WHERE e.id = first_event;
  PERFORM pg_temp.eq(observed_status, 'pending', 'the re-armed event is pending again');
END $$;

-- ---------------------------------------------------------------------------
-- 11. Connection uniqueness and revocation
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    INSERT INTO public.partner_connections (
      organization_id, external_organization_id, scopes,
      token_prefix, token_hash, token_last_four, webhook_secret_ciphertext
    ) VALUES (
      '0a000000-0000-4000-8000-000000000001', 'dms-alpha-duplicate',
      ARRAY['inspections:create'], 'cccccccccccccccc', 'hash-c', 'cccc', 'cipher-c'
    );
    RAISE EXCEPTION 'FAIL - a second active connection for one organization was accepted';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.ok(true, 'one live connection per Perfect PPI organization');
  END;

  BEGIN
    INSERT INTO public.partner_connections (
      organization_id, external_organization_id, scopes,
      token_prefix, token_hash, token_last_four, webhook_secret_ciphertext
    ) VALUES (
      '0b000000-0000-4000-8000-000000000001', 'dms-alpha',
      ARRAY['inspections:create'], 'dddddddddddddddd', 'hash-d', 'dddd', 'cipher-d'
    );
    RAISE EXCEPTION 'FAIL - one DealerSpace organization was bound to two Perfect PPI organizations';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.ok(true, 'one live connection per DealerSpace organization');
  END;

  BEGIN
    INSERT INTO public.partner_connections (
      organization_id, external_organization_id, scopes, status,
      token_prefix, token_hash, token_last_four, webhook_secret_ciphertext
    ) VALUES (
      '0b000000-0000-4000-8000-000000000001', 'dms-gamma',
      ARRAY['inspections:create'], 'revoked', 'eeeeeeeeeeeeeeee', 'hash-e', 'eeee', 'cipher-e'
    );
    RAISE EXCEPTION 'FAIL - a revoked connection without revoked_at was accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true, 'a revoked connection must record when it was revoked');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 12. User links: one active mapping each way (acceptance test 4 support)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tech_a uuid := (SELECT id FROM public.profiles WHERE display_name = 'tech-a@example.com');
  mgr_a  uuid := (SELECT id FROM public.profiles WHERE display_name = 'mgr-a@example.com');
BEGIN
  BEGIN
    INSERT INTO public.partner_user_links (partner_connection_id, external_user_id, profile_id)
    VALUES ('c0000000-0000-4000-8000-00000000000a', 'alpha-staff-1', mgr_a);
    RAISE EXCEPTION 'FAIL - one external staff id mapped to two Perfect PPI profiles';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.ok(true, 'one external staff identity maps to one Perfect PPI profile');
  END;

  BEGIN
    INSERT INTO public.partner_user_links (partner_connection_id, external_user_id, profile_id)
    VALUES ('c0000000-0000-4000-8000-00000000000a', 'alpha-staff-2', tech_a);
    RAISE EXCEPTION 'FAIL - one Perfect PPI profile was claimed by two DealerSpace users';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.ok(true, 'one Perfect PPI profile is claimed by one DealerSpace user per connection');
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 13. User-link exchange is atomic
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM pg_temp.act_as('11110000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM *
    FROM public.partner_exchange_user_link(
      'c0000000-0000-4000-8000-00000000000a',
      'd0000000-0000-4000-8000-000000000099',
      'not-a-real-hash'
    );
    RAISE EXCEPTION 'FAIL - authenticated could execute the internal exchange RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.act_as_service();
    PERFORM pg_temp.ok(true, 'the exchange RPC is not executable by authenticated');
  END;
END $$;

DO $$
DECLARE
  tech_a uuid := (SELECT id FROM public.profiles WHERE display_name = 'tech-a@example.com');
  exchanged record;
  transaction_status text;
  old_link_status text;
BEGIN
  INSERT INTO public.partner_user_link_transactions (
    id, partner_connection_id, external_user_id, state, redirect_uri, status,
    authorized_profile_id, authorization_code_hash, code_expires_at, expires_at,
    authorized_at
  ) VALUES (
    'd0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-00000000000a',
    'alpha-staff-atomic', 'state-atomic-success',
    'https://alpha.example.com/callback', 'authorized', tech_a,
    'hash-atomic-success', now() + interval '5 minutes',
    now() + interval '10 minutes', now()
  );

  SELECT * INTO exchanged
  FROM public.partner_exchange_user_link(
    'c0000000-0000-4000-8000-00000000000a',
    'd0000000-0000-4000-8000-000000000001',
    'hash-atomic-success'
  );

  PERFORM pg_temp.eq(
    exchanged.external_user_id,
    'alpha-staff-atomic'::text,
    'atomic exchange returns the new external user id'
  );

  SELECT status INTO transaction_status
  FROM public.partner_user_link_transactions
  WHERE id = 'd0000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.eq(transaction_status, 'consumed'::text, 'successful exchange consumes its code');

  SELECT status INTO old_link_status
  FROM public.partner_user_links
  WHERE partner_connection_id = 'c0000000-0000-4000-8000-00000000000a'
    AND external_user_id = 'alpha-staff-1';
  PERFORM pg_temp.eq(old_link_status, 'revoked'::text, 'successful relink revokes the old mapping');
END $$;

CREATE OR REPLACE FUNCTION pg_temp.reject_atomic_link_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.external_user_id = 'alpha-staff-failing' THEN
    RAISE EXCEPTION 'forced_link_insert_failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reject_atomic_link_insert
  BEFORE INSERT ON public.partner_user_links
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_atomic_link_insert();

DO $$
DECLARE
  tech_a uuid := (SELECT id FROM public.profiles WHERE display_name = 'tech-a@example.com');
  transaction_status text;
  active_link_count integer;
BEGIN
  INSERT INTO public.partner_user_link_transactions (
    id, partner_connection_id, external_user_id, state, redirect_uri, status,
    authorized_profile_id, authorization_code_hash, code_expires_at, expires_at,
    authorized_at
  ) VALUES (
    'd0000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-00000000000a',
    'alpha-staff-failing', 'state-atomic-failure',
    'https://alpha.example.com/callback', 'authorized', tech_a,
    'hash-atomic-failure', now() + interval '5 minutes',
    now() + interval '10 minutes', now()
  );

  BEGIN
    PERFORM *
    FROM public.partner_exchange_user_link(
      'c0000000-0000-4000-8000-00000000000a',
      'd0000000-0000-4000-8000-000000000002',
      'hash-atomic-failure'
    );
    RAISE EXCEPTION 'FAIL - forced link insertion failure was not raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL - forced link insertion failure was not raised' THEN
      RAISE;
    END IF;
    PERFORM pg_temp.eq(SQLERRM, 'forced_link_insert_failure'::text, 'forced insert failure is observed');
  END;

  SELECT status INTO transaction_status
  FROM public.partner_user_link_transactions
  WHERE id = 'd0000000-0000-4000-8000-000000000002';
  PERFORM pg_temp.eq(
    transaction_status,
    'authorized'::text,
    'failed exchange leaves the authorization code usable'
  );

  SELECT count(*) INTO active_link_count
  FROM public.partner_user_links
  WHERE partner_connection_id = 'c0000000-0000-4000-8000-00000000000a'
    AND external_user_id = 'alpha-staff-atomic'
    AND profile_id = tech_a
    AND status = 'active';
  PERFORM pg_temp.eq(active_link_count, 1, 'failed exchange preserves the prior active link');
END $$;

DROP TRIGGER reject_atomic_link_insert ON public.partner_user_links;

-- ---------------------------------------------------------------------------
-- 14. Existing consumer flows are untouched (acceptance test 11)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  consumer uuid := (SELECT id FROM public.profiles WHERE display_name = 'consumer@example.com');
  visible integer;
BEGIN
  PERFORM pg_temp.act_as('55550000-0000-4000-8000-000000000001');

  SELECT count(*) INTO visible FROM public.vehicles WHERE owner_id = consumer;
  PERFORM pg_temp.eq(visible, 1, 'a consumer still sees their own vehicle');

  SELECT count(*) INTO visible FROM public.ppi_requests WHERE requester_id = consumer;
  PERFORM pg_temp.eq(visible, 1, 'a consumer still sees their own inspection request');

  -- And nothing belonging to a dealership.
  SELECT count(*) INTO visible FROM public.ppi_requests WHERE source_system = 'dealerspace';
  PERFORM pg_temp.eq(visible, 0, 'a consumer sees no dealership inspections');

  SELECT count(*) INTO visible FROM public.external_inspection_refs;
  PERFORM pg_temp.eq(visible, 0, 'a consumer sees no integration records');

  PERFORM pg_temp.act_as_service();
END $$;

DO $$ BEGIN RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE ' All partner integration database tests passed.';
  RAISE NOTICE '================================================';
END $$;

ROLLBACK;
