\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(assertion boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF assertion THEN
    RAISE NOTICE 'ok   - %', description;
  ELSE
    RAISE EXCEPTION 'FAIL - %', description;
  END IF;
END $$;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_user_meta_data, email_confirmed_at, created_at, updated_at
) VALUES
  ('bc000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'credential-tech@example.test', 'x',
   '{"username":"credentialtech"}', now(), now(), now()),
  ('bc000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'credential-admin@example.test', 'x',
   '{"username":"credentialadmin"}', now(), now(), now()),
  ('bc000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'credential-other@example.test', 'x',
   '{"username":"credentialother"}', now(), now(), now());

UPDATE public.profiles
SET role = CASE
  WHEN auth_user_id = 'bc000000-0000-4000-8000-000000000001' THEN 'technician'::public.user_role
  WHEN auth_user_id = 'bc000000-0000-4000-8000-000000000002' THEN 'admin'::public.user_role
  ELSE 'consumer'::public.user_role
END
WHERE auth_user_id::text LIKE 'bc000000-%';

CREATE TEMP TABLE credential_test_ids AS
SELECT
  max(id::text) FILTER (WHERE auth_user_id = 'bc000000-0000-4000-8000-000000000001')::uuid AS tech_profile_owner_id,
  max(id::text) FILTER (WHERE auth_user_id = 'bc000000-0000-4000-8000-000000000002')::uuid AS admin_profile_id,
  max(id::text) FILTER (WHERE auth_user_id = 'bc000000-0000-4000-8000-000000000003')::uuid AS other_profile_id
FROM public.profiles;

INSERT INTO public.technician_profiles (id, profile_id, specialties)
SELECT 'bc100000-0000-4000-8000-000000000001', tech_profile_owner_id, ARRAY['Diagnostics']
FROM credential_test_ids;

DO $$
BEGIN
  PERFORM pg_temp.ok(
    NOT has_table_privilege('anon', 'public.technician_credentials', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.technician_credentials', 'SELECT'),
    'credential evidence is unavailable through public Data API roles'
  );
  PERFORM pg_temp.ok(
    NOT has_function_privilege(
      'authenticated',
      'public.review_technician_credential(uuid,uuid,text,text,text)',
      'EXECUTE'
    ),
    'credential review RPC is service-only'
  );
  PERFORM pg_temp.ok(
    NOT has_function_privilege(
      'authenticated',
      'public.read_technician_credential_evidence(uuid,uuid)',
      'EXECUTE'
    ),
    'credential evidence RPC is service-only'
  );
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  BEGIN
    UPDATE public.technician_profiles
    SET certification_level = 'master', is_verified = true
    WHERE id = 'bc100000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'trust field update was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.technician_profiles
  SET service_area = 'Atlanta, GA', offers_mobile_service = true
  WHERE id = 'bc100000-0000-4000-8000-000000000001';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bc000000-0000-4000-8000-000000000003', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.technician_profiles (
      id, profile_id, certification_level, claimed_certification_level, is_verified
    )
    SELECT
      'bc100000-0000-4000-8000-000000000002', other_profile_id,
      'master'::public.certification_level, 'master'::public.certification_level, true
    FROM credential_test_ids;
    RAISE EXCEPTION 'trust field insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE
  v_credential public.technician_credentials;
  v_admin uuid := (SELECT admin_profile_id FROM credential_test_ids);
  v_other uuid := (SELECT other_profile_id FROM credential_test_ids);
  v_tech uuid := (SELECT tech_profile_owner_id FROM credential_test_ids);
  v_level public.certification_level;
  v_verified boolean;
  v_evidence text;
BEGIN
  v_credential := public.submit_technician_credential(
    v_tech, 'ase_master', 'ASE Master Automobile Technician', 'ASE', 'A1-A8',
    '1234', current_date - 365, current_date + 365, 'Registry record 1234', NULL
  );

  SELECT certification_level, is_verified INTO v_level, v_verified
  FROM public.technician_profiles WHERE id = v_credential.technician_profile_id;
  PERFORM pg_temp.ok(v_level = 'none' AND NOT v_verified, 'a pending claim grants no public trust');

  BEGIN
    PERFORM public.review_technician_credential(
      v_other, v_credential.id, 'approved', 'issuer_registry',
      'Matched the active record in the issuer registry.'
    );
    RAISE EXCEPTION 'non-admin review was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  v_evidence := public.read_technician_credential_evidence(v_admin, v_credential.id);
  PERFORM pg_temp.ok(
    v_evidence = 'Registry record 1234',
    'private evidence access returns proof and records the admin view'
  );

  v_credential := public.review_technician_credential(
    v_admin, v_credential.id, 'approved', 'issuer_registry',
    'Matched the active record in the issuer registry.'
  );
  SELECT certification_level, is_verified INTO v_level, v_verified
  FROM public.technician_profiles WHERE id = v_credential.technician_profile_id;
  PERFORM pg_temp.ok(v_level = 'master' AND v_verified, 'approved active ASE Master proof derives trust fields');

  CREATE TEMP TABLE approved_credential AS SELECT v_credential.id AS id;
END $$;

DO $$
DECLARE
  v_renewal public.technician_credentials;
  v_admin uuid := (SELECT admin_profile_id FROM credential_test_ids);
  v_tech uuid := (SELECT tech_profile_owner_id FROM credential_test_ids);
  v_old uuid := (SELECT id FROM approved_credential);
BEGIN
  v_renewal := public.submit_technician_credential(
    v_tech, 'ase_master', 'ASE Master Automobile Technician', 'ASE', 'A1-A8',
    '1234', current_date, current_date + 730, 'Renewed registry record 1234', v_old
  );
  PERFORM public.read_technician_credential_evidence(v_admin, v_renewal.id);
  PERFORM public.review_technician_credential(
    v_admin, v_renewal.id, 'approved', 'issuer_registry',
    'Confirmed renewal in the issuer registry and replaced the prior record.'
  );

  PERFORM pg_temp.ok(
    (SELECT status = 'revoked' FROM public.technician_credentials WHERE id = v_old)
    AND (SELECT status = 'approved' FROM public.technician_credentials WHERE id = v_renewal.id),
    'an approved renewal atomically revokes the replaced credential'
  );
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.technician_credential_events
     WHERE credential_id IN (v_old, v_renewal.id) AND action IN ('approved', 'revoked')) = 3,
    'approval and replacement decisions are preserved in the event history'
  );

  PERFORM public.revoke_technician_credential(
    v_admin, v_renewal.id, 'The issuer registry now reports this credential as inactive.'
  );
  PERFORM pg_temp.ok(
    (SELECT certification_level = 'none' AND NOT is_verified
     FROM public.technician_profiles WHERE id = 'bc100000-0000-4000-8000-000000000001'),
    'revoking the final active credential removes derived trust'
  );
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE public.technician_credential_events SET reason = 'Changed evidence record.';
    RAISE EXCEPTION 'credential event mutation was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'credential event mutation was allowed' THEN RAISE; END IF;
    PERFORM pg_temp.ok(
      SQLERRM = 'technician credential events are immutable',
      'credential decision history is immutable'
    );
  END;
END $$;

DELETE FROM auth.users
WHERE id = 'bc000000-0000-4000-8000-000000000001';

DO $$
BEGIN
  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM public.technician_profiles
      WHERE id = 'bc100000-0000-4000-8000-000000000001'
    )
    AND EXISTS (
      SELECT 1 FROM public.technician_credential_events
      WHERE technician_profile_id IS NULL AND credential_id IS NULL
    ),
    'account deletion removes live credentials and anonymizes retained audit events'
  );
END $$;

ROLLBACK;
