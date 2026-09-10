\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('59000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cap-admin@example.test', '',
   '{}', '{"username":"CapAdmin"}', now(), now()),
  ('59000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cap-moderator@example.test', '',
   '{}', '{"username":"CapModerator"}', now(), now()),
  ('59000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cap-second@example.test', '',
   '{}', '{"username":"CapSecond"}', now(), now()),
  ('59000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cap-author@example.test', '',
   '{}', '{"username":"CapAuthor"}', now(), now()),
  ('59000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cap-reporter@example.test', '',
   '{}', '{"username":"CapReporter"}', now(), now());

SELECT set_config('test.admin_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '59000000-0000-0000-0000-000000000001'), true);
SELECT set_config('test.mod_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '59000000-0000-0000-0000-000000000002'), true);
SELECT set_config('test.second_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '59000000-0000-0000-0000-000000000003'), true);
SELECT set_config('test.author_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '59000000-0000-0000-0000-000000000004'), true);
SELECT set_config('test.reporter_id', (SELECT id::text FROM public.profiles WHERE auth_user_id = '59000000-0000-0000-0000-000000000005'), true);

-- Three admins: none of them may moderate until explicitly granted.
UPDATE public.profiles SET role = 'admin', is_public = true, default_post_audience = 'public'
WHERE id IN (current_setting('test.admin_id')::uuid, current_setting('test.mod_id')::uuid, current_setting('test.second_id')::uuid);
UPDATE public.profiles SET is_public = true, default_post_audience = 'public'
WHERE id IN (current_setting('test.author_id')::uuid, current_setting('test.reporter_id')::uuid);

DO $$
BEGIN
  IF public.moderation_has_capability(current_setting('test.admin_id')::uuid, 'queue_read')
     OR public.moderation_has_capability(current_setting('test.admin_id')::uuid, 'content_decide') THEN
    RAISE EXCEPTION 'admin role implied a moderation capability';
  END IF;
  IF public.moderation_has_capability(NULL, 'queue_read') THEN
    RAISE EXCEPTION 'NULL profile received a capability';
  END IF;
END
$$;

-- A reported post to work on.
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
VALUES ('59100000-0000-0000-0000-000000000001', current_setting('test.author_id')::uuid,
  'Post under review', 'public', 'active', 'active');
SELECT set_config('test.revision_id', (SELECT active_revision_id::text FROM public.community_posts
  WHERE id = '59100000-0000-0000-0000-000000000001'), true);
SELECT public.submit_moderation_report(
  current_setting('test.reporter_id')::uuid, 'community_post',
  '59100000-0000-0000-0000-000000000001', current_setting('test.revision_id')::uuid,
  'harassment', NULL, 'cap-test-reporter-report-0001'
);
SELECT set_config('test.case_id', (SELECT id::text FROM public.moderation_cases
  WHERE entity_id = '59100000-0000-0000-0000-000000000001' AND state = 'open'), true);

-- Nobody without content_decide can claim or decide, admin role or not.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.claim_moderation_case(current_setting('test.case_id')::uuid);
    RAISE EXCEPTION 'FAIL - ungranted admin claimed a case';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.decide_moderation_case(current_setting('test.case_id')::uuid, 1, 'restore', NULL, NULL, 'none', 7);
    RAISE EXCEPTION 'FAIL - ungranted admin decided a case';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.add_moderation_case_note(current_setting('test.case_id')::uuid, 'no access');
    RAISE EXCEPTION 'FAIL - ungranted admin added a note';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET ROLE;

-- Granting is explicit, reasoned, and audited; a non-admin cannot grant.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.grant_moderation_capability(current_setting('test.author_id')::uuid, 'content_decide', 'self service attempt');
    RAISE EXCEPTION 'FAIL - non-admin granted a capability';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT public.grant_moderation_capability(current_setting('test.mod_id')::uuid, 'queue_read', 'moderator onboarding: queue access');
SELECT public.grant_moderation_capability(current_setting('test.mod_id')::uuid, 'content_decide', 'moderator onboarding: decisions');
SELECT public.grant_moderation_capability(current_setting('test.second_id')::uuid, 'queue_read', 'second reviewer: queue access');
SELECT public.grant_moderation_capability(current_setting('test.second_id')::uuid, 'content_decide', 'second reviewer: decisions');
SELECT public.grant_moderation_capability(current_setting('test.second_id')::uuid, 'account_enforce', 'second reviewer: enforcement');
SELECT public.grant_moderation_capability(current_setting('test.admin_id')::uuid, 'legal_hold_review', 'designated legal hold reviewer');
RESET ROLE;

DO $$
BEGIN
  IF NOT public.moderation_has_capability(current_setting('test.mod_id')::uuid, 'content_decide') THEN
    RAISE EXCEPTION 'grant did not take effect';
  END IF;
  INSERT INTO public.user_enforcement_actions (profile_id, action_type, reason_code, created_by)
  VALUES (
    current_setting('test.mod_id')::uuid,
    'suspension',
    'moderator_access_test',
    current_setting('test.admin_id')::uuid
  );
  IF public.moderation_has_capability(current_setting('test.mod_id')::uuid, 'content_decide') THEN
    RAISE EXCEPTION 'suspended moderator retained an effective capability';
  END IF;
  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"59000000-0000-0000-0000-000000000002","role":"authenticated"}',
    true
  );
  IF public.social_current_user_is_available() THEN
    RAISE EXCEPTION 'suspended session remained available';
  END IF;
  BEGIN
    PERFORM public.grant_moderation_capability(
      current_setting('test.author_id')::uuid,
      'queue_read',
      'suspended administrator grant attempt'
    );
    RAISE EXCEPTION 'FAIL - suspended administrator granted a capability';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.user_enforcement_actions
  WHERE profile_id = current_setting('test.mod_id')::uuid AND reason_code = 'moderator_access_test';
  IF (SELECT count(*) FROM public.moderation_role_grant_events WHERE action = 'granted') <> 6 THEN
    RAISE EXCEPTION 'grants were not audited';
  END IF;
  -- legal_hold_review stays in sync with the legacy reviewer list.
  IF NOT EXISTS (SELECT 1 FROM public.moderation_legal_hold_reviewers
                 WHERE profile_id = current_setting('test.admin_id')::uuid) THEN
    RAISE EXCEPTION 'legal-hold grant did not sync the reviewer list';
  END IF;
  BEGIN
    DELETE FROM public.moderation_role_grant_events;
    RAISE EXCEPTION 'FAIL - grant history deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END
$$;

-- Claims: the moderator claims; a second moderator is blocked while the
-- claim is live, and their decision attempt conflicts instead of overwriting.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT public.claim_moderation_case(current_setting('test.case_id')::uuid);
SELECT public.add_moderation_case_note(current_setting('test.case_id')::uuid, 'Looking at this now.');

SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.claim_moderation_case(current_setting('test.case_id')::uuid);
    RAISE EXCEPTION 'FAIL - second moderator took a live claim';
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
  BEGIN
    PERFORM public.decide_moderation_case(current_setting('test.case_id')::uuid, 1, 'restore', NULL, NULL, 'none', 7);
    RAISE EXCEPTION 'FAIL - second moderator decided a claimed case';
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
END
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_cases
    WHERE id = current_setting('test.case_id')::uuid
      AND state = 'claimed'
      AND assigned_moderator_id = current_setting('test.mod_id')::uuid
      AND claim_expires_at > now() + interval '14 minutes'
  ) THEN RAISE EXCEPTION 'claim was not recorded with a 15 minute expiry'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_events
                 WHERE case_id = current_setting('test.case_id')::uuid AND event_type = 'case_claimed') THEN
    RAISE EXCEPTION 'claim was not audited';
  END IF;
  IF (SELECT count(*) FROM public.moderation_case_notes WHERE case_id = current_setting('test.case_id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'note was not stored';
  END IF;
END
$$;

-- An expired claim can be taken over, and the takeover is audited.
UPDATE public.moderation_cases
SET claimed_at = now() - interval '20 minutes', claim_expires_at = now() - interval '5 minutes'
WHERE id = current_setting('test.case_id')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT public.claim_moderation_case(current_setting('test.case_id')::uuid);
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.moderation_cases
                 WHERE id = current_setting('test.case_id')::uuid
                   AND assigned_moderator_id = current_setting('test.second_id')::uuid) THEN
    RAISE EXCEPTION 'expired claim was not taken over';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_events
                 WHERE case_id = current_setting('test.case_id')::uuid AND event_type = 'case_claim_expired') THEN
    RAISE EXCEPTION 'claim takeover was not audited';
  END IF;
END
$$;

-- Decisions: stale version conflicts; enforcement needs account_enforce;
-- removal needs a policy category; a valid removal updates content, item,
-- case, events, enforcement, and the author outbox in one transaction.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
  -- The moderator's claim expired and was taken over; a live claim by the
  -- second reviewer blocks the original moderator now.
  BEGIN
    PERFORM public.decide_moderation_case(current_setting('test.case_id')::uuid, 1, 'restore', NULL, NULL, 'none', 7);
    RAISE EXCEPTION 'FAIL - decided over a live claim held by someone else';
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
END
$$;

SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.decide_moderation_case(current_setting('test.case_id')::uuid, NULL, 'restore', NULL, NULL, 'none', 7);
    RAISE EXCEPTION 'FAIL - NULL decision version accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.decide_moderation_case(current_setting('test.case_id')::uuid, 1, NULL, NULL, NULL, 'none', 7);
    RAISE EXCEPTION 'FAIL - NULL decision accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.decide_moderation_case(current_setting('test.case_id')::uuid, 1, 'restore', NULL, NULL, 'ban', 7);
    RAISE EXCEPTION 'FAIL - account enforcement accepted with a restore';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.decide_moderation_case(current_setting('test.case_id')::uuid, 99, 'restore', NULL, NULL, 'none', 7);
    RAISE EXCEPTION 'FAIL - stale decision version accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  BEGIN
    PERFORM public.decide_moderation_case(current_setting('test.case_id')::uuid, 1, 'remove', NULL, 'no category given here', 'none', 7);
    RAISE EXCEPTION 'FAIL - removal without policy category accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.decide_moderation_case(current_setting('test.case_id')::uuid, 1, 'escalate', NULL, 'needs legal preservation', 'none', 7);
    RAISE EXCEPTION 'FAIL - escalation without legal_hold_review accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- The original moderator lacks account_enforce: even after the claim is
-- released to them, a ban must be refused.
SELECT public.release_moderation_case(current_setting('test.case_id')::uuid);
SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.decide_moderation_case(current_setting('test.case_id')::uuid, 1, 'remove', 'harassment', 'targeted harassment of another member', 'ban', 7);
    RAISE EXCEPTION 'FAIL - ban applied without account_enforce';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT public.decide_moderation_case(
  current_setting('test.case_id')::uuid, 1, 'remove', 'harassment',
  'targeted harassment of another member', 'reporting_hold', 14
);
RESET ROLE;

DO $$
DECLARE
  v_case public.moderation_cases%ROWTYPE;
BEGIN
  SELECT * INTO v_case FROM public.moderation_cases WHERE id = current_setting('test.case_id')::uuid;
  IF v_case.state <> 'closed' OR v_case.resolution <> 'violation_removed' OR v_case.decision_version <> 2 THEN
    RAISE EXCEPTION 'case was not closed with the removal resolution: % % %', v_case.state, v_case.resolution, v_case.decision_version;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_posts
                 WHERE id = '59100000-0000-0000-0000-000000000001'
                   AND status = 'hidden' AND moderation_status = 'rejected' AND moderation_reason = 'harassment') THEN
    RAISE EXCEPTION 'content row was not marked removed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_items
                 WHERE id = v_case.moderation_item_id AND status = 'rejected'
                   AND decided_by = current_setting('test.second_id')::uuid) THEN
    RAISE EXCEPTION 'compatibility item was not updated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_events
                 WHERE case_id = v_case.id AND event_type = 'content_removed'
                   AND actor_id = current_setting('test.second_id')::uuid) THEN
    RAISE EXCEPTION 'removal was not audited';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_enforcement_actions
                 WHERE profile_id = current_setting('test.author_id')::uuid
                   AND action_type = 'reporting_hold' AND ends_at > now() + interval '13 days') THEN
    RAISE EXCEPTION 'reporting hold was not applied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_events
                 WHERE case_id = v_case.id AND event_type = 'enforcement_applied') THEN
    RAISE EXCEPTION 'enforcement was not audited';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_outbox
                 WHERE case_id = v_case.id AND event_type = 'author_removed') THEN
    RAISE EXCEPTION 'author notification was not queued';
  END IF;
  -- Deciding the same version again is a conflict, not a second decision.
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
    PERFORM public.decide_moderation_case(v_case.id, 1, 'restore', NULL, NULL, 'none', 7);
    RAISE EXCEPTION 'FAIL - closed case decided again';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END
$$;

-- Revocation is immediate and audited.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"59000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT public.revoke_moderation_capability(current_setting('test.second_id')::uuid, 'account_enforce', 'rotation: enforcement authority withdrawn');
RESET ROLE;
DO $$
BEGIN
  IF public.moderation_has_capability(current_setting('test.second_id')::uuid, 'account_enforce') THEN
    RAISE EXCEPTION 'revoked capability still active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.moderation_role_grant_events WHERE action = 'revoked') THEN
    RAISE EXCEPTION 'revocation was not audited';
  END IF;
  IF has_table_privilege('authenticated', 'public.moderation_role_grants', 'SELECT')
     OR has_table_privilege('authenticated', 'public.moderation_case_notes', 'SELECT') THEN
    RAISE EXCEPTION 'moderation admin tables must be service-only';
  END IF;
END
$$;

ROLLBACK;
