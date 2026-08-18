-- ============================================================================
-- Role switching and privilege-escalation tests (database layer).
--
-- Run against a database with every migration applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/role_switching.test.sql
--
-- Everything happens inside one transaction that is rolled back at the end, so
-- the test leaves no rows behind and is safe to run repeatedly against a local
-- or branch database. It is NOT safe to point at production.
--
-- Covers: the developer grant, one-click role switching, and the two escalation
-- holes closed by 20260818130000 — a self-assignable profiles.role, and the
-- SECURITY DEFINER provision_admin helper.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off
BEGIN;

SET client_min_messages TO NOTICE;

-- A hosted project grants anon/authenticated DML on public tables and leans on
-- RLS to decide what is actually reachable; a local `supabase start` image does
-- not always reproduce those grants. Normalized here so the assertions below
-- exercise policy and trigger logic rather than missing GRANTs.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
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

-- Asserts that a statement is rejected. A test that only checked "the role did
-- not change" would also pass if the statement silently matched zero rows, so
-- the raised message is checked too.
CREATE OR REPLACE FUNCTION pg_temp.rejects(
  p_sql text,
  p_expected_fragment text,
  p_description text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(lower(p_expected_fragment) IN lower(SQLERRM)) > 0 THEN
      RAISE NOTICE 'ok   - %', p_description;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL - % (rejected, but with the wrong error: %)',
      p_description, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL - % (statement was allowed)', p_description;
END $$;

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

  UPDATE public.profiles SET role = p_role, display_name = p_email
  WHERE auth_user_id = p_auth_id
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END $$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  plain uuid := 'd0000000-0000-4000-8000-000000000001';
  dev   uuid := 'd0000000-0000-4000-8000-000000000002';
  adm   uuid := 'd0000000-0000-4000-8000-000000000003';
BEGIN
  PERFORM pg_temp.make_user(plain, 'plain@test.dev', 'consumer');
  PERFORM pg_temp.make_user(dev,   'dev@test.dev',   'developer');
  PERFORM pg_temp.make_user(adm,   'admin@test.dev', 'admin');

  -- Granted out of band, exactly as the migration documents.
  UPDATE public.profiles SET is_developer = true WHERE auth_user_id = dev;
END $$;

-- ---------------------------------------------------------------------------
-- The developer grant is not self-issuable
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  plain uuid := 'd0000000-0000-4000-8000-000000000001';
  dev   uuid := 'd0000000-0000-4000-8000-000000000002';
  adm   uuid := 'd0000000-0000-4000-8000-000000000003';
  flag  boolean;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '-- developer grant --';

  PERFORM pg_temp.act_as(plain);
  PERFORM pg_temp.rejects(
    format('UPDATE public.profiles SET is_developer = true WHERE auth_user_id = %L', plain),
    'is_developer cannot be self-granted',
    'an ordinary account cannot grant itself the developer flag'
  );

  PERFORM pg_temp.act_as(dev);
  PERFORM pg_temp.rejects(
    format('UPDATE public.profiles SET is_developer = false WHERE auth_user_id = %L', dev),
    'is_developer cannot be self-granted',
    'a developer cannot even clear its own flag'
  );

  -- Admins are the in-app path for handing the grant out.
  PERFORM pg_temp.act_as(adm);
  UPDATE public.profiles SET is_developer = true WHERE auth_user_id = plain;
  PERFORM pg_temp.act_as_service();
  SELECT is_developer INTO flag FROM public.profiles WHERE auth_user_id = plain;
  PERFORM pg_temp.eq(flag, true, 'an admin can grant the developer flag');

  UPDATE public.profiles SET is_developer = false WHERE auth_user_id = plain;
END $$;

-- ---------------------------------------------------------------------------
-- Revoking the grant cannot strand an account on the developer role
--
-- role = 'developer' with is_developer = false is unroutable: /dev bounces it
-- to getRoleHomePath('developer'), which is /dev again. The database prevents
-- the combination from existing at all.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  adm   uuid := 'd0000000-0000-4000-8000-000000000003';
  strand uuid := 'd0000000-0000-4000-8000-000000000004';
  r     public.user_role;
  flag  boolean;
  n     integer;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '-- grant/role consistency --';

  PERFORM pg_temp.make_user(strand, 'strand@test.dev', 'developer');
  UPDATE public.profiles SET is_developer = true WHERE auth_user_id = strand;

  -- An admin revokes the grant while the account sits on the developer role.
  PERFORM pg_temp.act_as(adm);
  UPDATE public.profiles SET is_developer = false WHERE auth_user_id = strand;
  PERFORM pg_temp.act_as_service();

  SELECT role, is_developer INTO r, flag
  FROM public.profiles WHERE auth_user_id = strand;

  PERFORM pg_temp.eq(flag, false, 'revoking the grant clears is_developer');
  PERFORM pg_temp.eq(r, 'consumer'::public.user_role,
    'revoking the grant also drops the account off the developer role');

  -- Nothing anywhere may sit in the unroutable combination.
  SELECT count(*) INTO n FROM public.profiles
  WHERE role = 'developer' AND is_developer = false;
  PERFORM pg_temp.eq(n, 0, 'no profile is stranded on developer without the grant');

  -- Revoking from any other role leaves that role alone.
  UPDATE public.profiles SET is_developer = true WHERE auth_user_id = strand;
  UPDATE public.profiles SET role = 'technician' WHERE auth_user_id = strand;
  UPDATE public.profiles SET is_developer = false WHERE auth_user_id = strand;
  SELECT role INTO r FROM public.profiles WHERE auth_user_id = strand;
  PERFORM pg_temp.eq(r, 'technician'::public.user_role,
    'revoking the grant from another role does not change that role');
END $$;

-- ---------------------------------------------------------------------------
-- profiles.role is not writable from the client
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  plain uuid := 'd0000000-0000-4000-8000-000000000001';
  r public.user_role;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '-- role immutability --';

  PERFORM pg_temp.act_as(plain);

  PERFORM pg_temp.rejects(
    format('UPDATE public.profiles SET role = ''admin'' WHERE auth_user_id = %L', plain),
    'role cannot be self-assigned',
    'a consumer cannot promote itself to admin with a direct update'
  );

  PERFORM pg_temp.rejects(
    format('UPDATE public.profiles SET role = ''technician'' WHERE auth_user_id = %L', plain),
    'role cannot be self-assigned',
    'a consumer cannot promote itself to technician with a direct update'
  );

  PERFORM pg_temp.rejects(
    format('UPDATE public.profiles SET role = ''developer'' WHERE auth_user_id = %L', plain),
    'role cannot be self-assigned',
    'a consumer cannot promote itself to developer with a direct update'
  );

  PERFORM pg_temp.rejects(
    'SELECT public.set_own_role(''admin'')',
    'cannot be self-assigned',
    'set_own_role refuses to hand out admin'
  );

  PERFORM pg_temp.rejects(
    'SELECT public.set_own_role(''developer'')',
    'cannot be self-assigned',
    'set_own_role refuses to hand out developer'
  );

  PERFORM pg_temp.rejects(
    'SELECT public.set_own_role(''technician'')',
    'technician profile is required',
    'set_own_role refuses technician without a technician profile'
  );

  PERFORM pg_temp.rejects(
    'SELECT public.dev_switch_role(''admin'')',
    'Developer access required',
    'dev_switch_role refuses a caller without the developer grant'
  );

  PERFORM pg_temp.act_as_service();
  SELECT role INTO r FROM public.profiles WHERE auth_user_id = plain;
  PERFORM pg_temp.eq(r, 'consumer'::public.user_role,
    'the account is still a consumer after every escalation attempt');
END $$;

-- ---------------------------------------------------------------------------
-- The legitimate self-serve upgrades still work
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  plain    uuid := 'd0000000-0000-4000-8000-000000000001';
  prof_id  uuid;
  tech_id  uuid;
  org_id   uuid := '0c000000-0000-4000-8000-000000000001';
  r        public.user_role;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '-- self-serve upgrade paths --';

  SELECT id INTO prof_id FROM public.profiles WHERE auth_user_id = plain;
  PERFORM pg_temp.act_as(plain);

  -- enableTechnicianAccess: provision first, then claim.
  INSERT INTO public.technician_profiles (profile_id, certification_level, specialties, is_independent)
  VALUES (prof_id, 'none', '{}', true)
  RETURNING id INTO tech_id;

  SELECT public.set_own_role('technician') INTO r;
  PERFORM pg_temp.eq(r, 'technician'::public.user_role,
    'a provisioned technician profile unlocks the technician role');

  -- org_manager needs the organization and the manager membership too.
  PERFORM pg_temp.rejects(
    'SELECT public.set_own_role(''org_manager'')',
    'organization is required',
    'set_own_role refuses org_manager before an organization exists'
  );

  INSERT INTO public.organizations (id, name, slug) VALUES (org_id, 'Test Shop', 'test-shop-roles');
  UPDATE public.technician_profiles
    SET organization_id = org_id, is_independent = false
  WHERE id = tech_id;

  PERFORM pg_temp.rejects(
    'SELECT public.set_own_role(''org_manager'')',
    'manager membership is required',
    'set_own_role refuses org_manager before a manager membership exists'
  );

  INSERT INTO public.organization_memberships (technician_profile_id, organization_id, role)
  VALUES (tech_id, org_id, 'manager');

  SELECT public.set_own_role('org_manager') INTO r;
  PERFORM pg_temp.eq(r, 'org_manager'::public.user_role,
    'a full organization setup unlocks the org_manager role');

  -- switchToConsumer is always available as a downgrade.
  SELECT public.set_own_role('consumer') INTO r;
  PERFORM pg_temp.eq(r, 'consumer'::public.user_role,
    'any account can drop back to consumer');

  PERFORM pg_temp.act_as_service();
END $$;

-- ---------------------------------------------------------------------------
-- A developer switches freely, and keeps the grant across every switch
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  dev  uuid := 'd0000000-0000-4000-8000-000000000002';
  r    public.user_role;
  flag boolean;
  target public.user_role;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '-- developer switching --';

  PERFORM pg_temp.act_as(dev);

  FOREACH target IN ARRAY ARRAY[
    'consumer', 'technician', 'org_manager', 'admin', 'developer'
  ]::public.user_role[]
  LOOP
    SELECT public.dev_switch_role(target) INTO r;
    PERFORM pg_temp.eq(r, target, format('a developer can become %s', target));

    SELECT is_developer INTO flag FROM public.profiles WHERE auth_user_id = dev;
    PERFORM pg_temp.eq(flag, true,
      format('the developer grant survives the switch to %s', target));
  END LOOP;

  -- No scaffolding was created here, so this also pins the deliberate
  -- difference from set_own_role: dev_switch_role does not require it.
  PERFORM pg_temp.act_as_service();
  SELECT role INTO r FROM public.profiles WHERE auth_user_id = dev;
  PERFORM pg_temp.eq(r, 'developer'::public.user_role,
    'the developer lands back on the developer role');
END $$;

-- ---------------------------------------------------------------------------
-- The switcher's scaffolding works while sitting on the developer role
--
-- switchRole() provisions the technician profile / organization / membership
-- before flipping the role, so those inserts run as a 'developer'. Every policy
-- involved is written against profile ownership rather than role, and this
-- pins that: if any of them ever grows a role check, the org portal would open
-- on an empty workspace and /org/settings would bounce to /login.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  dev     uuid := 'd0000000-0000-4000-8000-000000000002';
  prof_id uuid;
  tech_id uuid;
  org_id  uuid := '0c000000-0000-4000-8000-000000000002';
  r       public.user_role;
  n       integer;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '-- developer scaffolding --';

  SELECT id INTO prof_id FROM public.profiles WHERE auth_user_id = dev;
  PERFORM pg_temp.act_as(dev);

  PERFORM pg_temp.eq(public.get_my_role(), 'developer'::public.user_role,
    'the scaffolding below runs while the caller is a developer');

  INSERT INTO public.technician_profiles (profile_id, certification_level, specialties, is_independent)
  VALUES (prof_id, 'none', '{}', true)
  RETURNING id INTO tech_id;
  PERFORM pg_temp.ok(tech_id IS NOT NULL,
    'a developer can create its own technician profile');

  INSERT INTO public.organizations (id, name, slug)
  VALUES (org_id, 'Dev Workspace', 'dev-workspace-roles');

  UPDATE public.technician_profiles
    SET organization_id = org_id, is_independent = false
  WHERE id = tech_id;
  SELECT count(*) INTO n FROM public.technician_profiles
  WHERE id = tech_id AND organization_id = org_id;
  PERFORM pg_temp.eq(n, 1, 'a developer can attach itself to the new organization');

  INSERT INTO public.organization_memberships (technician_profile_id, organization_id, role)
  VALUES (tech_id, org_id, 'manager');
  SELECT count(*) INTO n FROM public.organization_memberships
  WHERE technician_profile_id = tech_id AND organization_id = org_id;
  PERFORM pg_temp.eq(n, 1, 'a developer can create its own manager membership');

  SELECT public.dev_switch_role('org_manager') INTO r;
  PERFORM pg_temp.eq(r, 'org_manager'::public.user_role,
    'the developer lands on org_manager with a usable workspace');

  -- getMyOrg() resolves through this helper; if it returns null the org portal
  -- redirects to /login instead of rendering.
  PERFORM pg_temp.eq(public.get_my_org_id(), org_id,
    'the org portal can resolve the organization after the switch');

  SELECT public.dev_switch_role('developer') INTO r;
  PERFORM pg_temp.act_as_service();
END $$;

-- ---------------------------------------------------------------------------
-- Admin and service paths are unaffected
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  plain uuid := 'd0000000-0000-4000-8000-000000000001';
  adm   uuid := 'd0000000-0000-4000-8000-000000000003';
  r     public.user_role;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '-- admin and service paths --';

  -- The admin portal promotes and demotes other accounts.
  PERFORM pg_temp.act_as(adm);
  UPDATE public.profiles SET role = 'admin' WHERE auth_user_id = plain;
  PERFORM pg_temp.act_as_service();
  SELECT role INTO r FROM public.profiles WHERE auth_user_id = plain;
  PERFORM pg_temp.eq(r, 'admin'::public.user_role, 'an admin can promote another account');

  PERFORM pg_temp.act_as(adm);
  UPDATE public.profiles SET role = 'consumer' WHERE auth_user_id = plain;
  PERFORM pg_temp.act_as_service();
  SELECT role INTO r FROM public.profiles WHERE auth_user_id = plain;
  PERFORM pg_temp.eq(r, 'consumer'::public.user_role, 'an admin can demote another account');

  -- set_own_role keeps the pre-existing rule that admin is not dropped by
  -- walking through the settings page.
  PERFORM pg_temp.act_as(adm);
  PERFORM pg_temp.rejects(
    'SELECT public.set_own_role(''consumer'')',
    'Admin role cannot be changed here',
    'an admin cannot demote itself through set_own_role'
  );
  PERFORM pg_temp.act_as_service();
END $$;

-- ---------------------------------------------------------------------------
-- Signup still works, and provision_admin is gone
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fresh uuid := 'd0000000-0000-4000-8000-000000000009';
  r     public.user_role;
  flag  boolean;
  n     integer;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '-- signup and legacy helpers --';

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  ) VALUES (
    fresh, '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'fresh@test.dev', 'x', now(), now(), now()
  );

  SELECT role, is_developer INTO r, flag
  FROM public.profiles WHERE auth_user_id = fresh;

  PERFORM pg_temp.eq(r, 'consumer'::public.user_role,
    'the signup trigger still creates a consumer profile');
  PERFORM pg_temp.eq(flag, false,
    'a new account does not carry the developer grant');

  SELECT count(*) INTO n FROM pg_proc
  WHERE proname = 'provision_admin'
    AND pronamespace = 'public'::regnamespace;
  PERFORM pg_temp.eq(n, 0,
    'the SECURITY DEFINER provision_admin helper no longer exists');
END $$;

-- ---------------------------------------------------------------------------
-- The switching RPCs are not reachable anonymously
-- ---------------------------------------------------------------------------

DO $$
DECLARE n integer;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '-- function privileges --';

  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('set_own_role', 'dev_switch_role')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM pg_temp.eq(n, 0, 'anon cannot execute either switching function');

  SELECT count(*) INTO n
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('set_own_role', 'dev_switch_role')
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  PERFORM pg_temp.eq(n, 2, 'authenticated can execute both switching functions');
END $$;

DO $$ BEGIN RAISE NOTICE '';
  RAISE NOTICE '================================================';
  RAISE NOTICE ' All role switching database tests passed.';
  RAISE NOTICE '================================================';
END $$;

ROLLBACK;
