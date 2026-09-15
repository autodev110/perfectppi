\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('93000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'extended-admin@example.test', '',
   '{}', '{"username":"ExtendedAdmin"}', now(), now()),
  ('93000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'extended-author@example.test', '',
   '{}', '{"username":"ExtendedAuthor"}', now(), now()),
  ('93000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'extended-reporter@example.test', '',
   '{}', '{"username":"ExtendedReporter"}', now(), now());

SELECT set_config('test.extended_admin', (SELECT id::text FROM public.profiles WHERE auth_user_id = '93000000-0000-0000-0000-000000000001'), true);
SELECT set_config('test.extended_author', (SELECT id::text FROM public.profiles WHERE auth_user_id = '93000000-0000-0000-0000-000000000002'), true);
SELECT set_config('test.extended_reporter', (SELECT id::text FROM public.profiles WHERE auth_user_id = '93000000-0000-0000-0000-000000000003'), true);

UPDATE public.profiles
SET is_public = true, username_state = 'claimed'
WHERE id IN (
  current_setting('test.extended_admin')::uuid,
  current_setting('test.extended_author')::uuid,
  current_setting('test.extended_reporter')::uuid
);
UPDATE public.profiles SET role = 'admin'
WHERE id = current_setting('test.extended_admin')::uuid;

-- A UUID collision with an unrelated comment must survive profile-case purge.
INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status)
VALUES (
  '93100000-0000-0000-0000-000000000001',
  current_setting('test.extended_admin')::uuid,
  'Unrelated retention fixture', 'public', 'active', 'active'
);
INSERT INTO public.community_comments (id, post_id, author_id, content, status, moderation_status)
VALUES (
  current_setting('test.extended_author')::uuid,
  '93100000-0000-0000-0000-000000000001',
  current_setting('test.extended_admin')::uuid,
  'Must not be deleted by a profile case purge', 'active', 'active'
);

SELECT public.submit_extended_moderation_report(
  current_setting('test.extended_reporter')::uuid,
  'profile', current_setting('test.extended_author')::uuid,
  'harassment', 'Abusive profile content in the public bio.',
  'extended-profile-report-00000001'
);

DO $$
BEGIN
  IF public.social_can_view_profile(
    current_setting('test.extended_reporter')::uuid,
    current_setting('test.extended_author')::uuid
  ) THEN RAISE EXCEPTION 'reporter still sees the reported profile'; END IF;
  IF NOT public.social_can_view_profile(
    current_setting('test.extended_admin')::uuid,
    current_setting('test.extended_author')::uuid
  ) THEN RAISE EXCEPTION 'one report globally hid the profile'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_reporter_hidden_entities hidden
    WHERE hidden.reporter_id = current_setting('test.extended_reporter')::uuid
      AND hidden.entity_type = 'profile'
      AND hidden.entity_id = current_setting('test.extended_author')::uuid
  ) THEN RAISE EXCEPTION 'reporter-only hide was not recorded'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_cases case_row
    JOIN public.moderation_evidence evidence ON evidence.case_id = case_row.id
    WHERE case_row.entity_type = 'profile'
      AND case_row.entity_id = current_setting('test.extended_author')::uuid
      AND case_row.state = 'open'
  ) THEN RAISE EXCEPTION 'expanded case evidence was not captured'; END IF;

  BEGIN
    PERFORM public.submit_extended_moderation_report(
      current_setting('test.extended_author')::uuid,
      'profile', current_setting('test.extended_author')::uuid,
      'spam', NULL, 'extended-profile-self-000000001'
    );
    RAISE EXCEPTION 'self-report was accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END
$$;

SELECT set_config('test.extended_case', (
  SELECT id::text FROM public.moderation_cases
  WHERE entity_type = 'profile'
    AND entity_id = current_setting('test.extended_author')::uuid
  ORDER BY created_at DESC LIMIT 1
), true);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SELECT public.grant_moderation_capability(
  current_setting('test.extended_admin')::uuid,
  'content_decide', 'expanded UGC reporting regression suite'
);
SELECT public.decide_moderation_case(
  current_setting('test.extended_case')::uuid,
  1, 'restore', NULL, 'The reported profile does not violate policy.', 'none', 7
);
RESET ROLE;

DO $$
BEGIN
  IF NOT public.social_can_view_profile(
    current_setting('test.extended_reporter')::uuid,
    current_setting('test.extended_author')::uuid
  ) THEN RAISE EXCEPTION 'restore did not clear the reporter-only hide'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.moderation_reporter_hidden_entities hidden
    WHERE hidden.reporter_id = current_setting('test.extended_reporter')::uuid
      AND hidden.entity_type = 'profile'
      AND hidden.entity_id = current_setting('test.extended_author')::uuid
  ) THEN RAISE EXCEPTION 'restored entity remains reporter-hidden'; END IF;
END
$$;

-- A changed snapshot after restore is a new reportable revision, not a stale
-- duplicate of the closed case.
UPDATE public.profiles SET bio = 'Changed profile content after review.'
WHERE id = current_setting('test.extended_author')::uuid;
SELECT public.submit_extended_moderation_report(
  current_setting('test.extended_reporter')::uuid,
  'profile', current_setting('test.extended_author')::uuid,
  'harassment', 'The changed bio contains new abusive content.',
  'extended-profile-report-00000002'
);
SELECT set_config('test.extended_case', (
  SELECT id::text FROM public.moderation_cases
  WHERE entity_type = 'profile'
    AND entity_id = current_setting('test.extended_author')::uuid
    AND state = 'open'
  ORDER BY created_at DESC LIMIT 1
), true);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SELECT public.decide_moderation_case(
  current_setting('test.extended_case')::uuid,
  1, 'remove', 'harassment', 'Confirmed abusive profile content.', 'none', 7
);
RESET ROLE;

DO $$
BEGIN
  IF public.social_can_view_profile(
    current_setting('test.extended_admin')::uuid,
    current_setting('test.extended_author')::uuid
  ) THEN RAISE EXCEPTION 'removed profile remains globally visible'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_items
    WHERE entity_type = 'profile'
      AND entity_id = current_setting('test.extended_author')::uuid
      AND status = 'rejected'
  ) THEN RAISE EXCEPTION 'moderator removal did not reject the entity'; END IF;
END
$$;

UPDATE public.moderation_cases
SET retention_expires_at = now() - interval '1 day', retention_basis = 'community_safety'
WHERE entity_type = 'profile'
  AND entity_id = current_setting('test.extended_author')::uuid;

DO $$
DECLARE result jsonb;
BEGIN
  result := public.purge_moderation_case(current_setting('test.extended_case')::uuid);
  IF result->>'outcome' <> 'purged' OR NOT (result->>'contentRemoved')::boolean THEN
    RAISE EXCEPTION 'expanded evidence purge failed: %', result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.moderation_reports
    WHERE case_id = current_setting('test.extended_case')::uuid
  ) OR EXISTS (
    SELECT 1 FROM public.moderation_evidence
    WHERE case_id = current_setting('test.extended_case')::uuid
  ) THEN RAISE EXCEPTION 'expanded evidence survived retention purge'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_comments
    WHERE id = current_setting('test.extended_author')::uuid
  ) THEN RAISE EXCEPTION 'profile purge deleted an unrelated comment'; END IF;
END
$$;

ROLLBACK;
