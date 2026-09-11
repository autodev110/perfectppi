\set ON_ERROR_STOP on
BEGIN;

-- Plan 14.2: structured post types and polls.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('7c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pt-author@example.test', '', '{}', '{"username":"PtAuthor"}', now(), now()),
  ('7c000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pt-voter@example.test', '', '{}', '{"username":"PtVoter"}', now(), now()),
  ('7c000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pt-tech@example.test', '', '{}', '{"username":"PtTech"}', now(), now());
UPDATE public.profiles SET is_public = true WHERE auth_user_id::text LIKE '7c000000-%';
UPDATE public.profiles SET role = 'technician' WHERE auth_user_id = '7c000000-0000-0000-0000-000000000003';

CREATE TEMP TABLE pt AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '7c000000-0000-0000-0000-000000000001') AS author,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7c000000-0000-0000-0000-000000000002') AS voter,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7c000000-0000-0000-0000-000000000003') AS tech;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '7c000000-0000-0000-0000-000000000100', author, 2016, 'Mazda', 'MX-5', 'public' FROM pt;
INSERT INTO public.ppi_requests (id, vehicle_id, requester_id, assigned_tech_id, whose_car, requester_role, performer_type, ppi_type, status)
SELECT '7c000000-0000-0000-0000-000000000300', '7c000000-0000-0000-0000-000000000100', author, tech, 'own', 'buying', 'technician', 'general_tech', 'completed' FROM pt;

-- ---------------------------------------------------------------------------
-- 1. Details are validated per type
-- ---------------------------------------------------------------------------
DO $$
DECLARE hit boolean;
BEGIN
  -- General posts carry no details.
  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, content, audience, status, moderation_status, post_type, details)
    SELECT author, 'x', 'public', 'active', 'active', 'general', '{"stage":"planning"}' FROM pt;
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'general posts must not carry structured details'; END IF;

  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, content, audience, status, moderation_status, post_type, details)
    SELECT author, 'x', 'public', 'active', 'active', 'build_update', '{"stage":"someday"}' FROM pt;
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'build stage is validated'; END IF;

  INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status, post_type, details)
  SELECT '7c000000-0000-0000-0000-000000000201', author, 'Coilovers in.', 'public', 'active', 'active', 'build_update',
         '{"stage":"in_progress","parts":["Ohlins Road & Track","Front sway bar"]}' FROM pt;

  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, content, audience, status, moderation_status, post_type, details)
    SELECT author, 'x', 'public', 'active', 'active', 'maintenance', '{"mileage": 1000}' FROM pt;
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'maintenance needs a service'; END IF;
  INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status, post_type, details)
  SELECT '7c000000-0000-0000-0000-000000000202', author, 'Oil change day.', 'public', 'active', 'active', 'maintenance',
         '{"service":"Oil and filter","mileage":48210,"cost_cents":6500,"diy":true}' FROM pt;

  -- Inspection discussion: own completed inspection of the attached vehicle.
  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, content, audience, status, moderation_status, post_type, details)
    SELECT author, 'x', 'public', 'active', 'active', 'inspection_discussion',
           '{"inspection_request_id":"7c000000-0000-0000-0000-000000000300"}' FROM pt;
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'inspection discussions must attach the vehicle'; END IF;
  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, vehicle_id, content, audience, status, moderation_status, post_type, details)
    SELECT voter, '7c000000-0000-0000-0000-000000000100', 'x', 'public', 'active', 'active', 'inspection_discussion',
           '{"inspection_request_id":"7c000000-0000-0000-0000-000000000300"}' FROM pt;
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'only the requester discusses their inspection'; END IF;
  INSERT INTO public.community_posts (id, author_id, vehicle_id, content, audience, status, moderation_status, post_type, details)
  SELECT '7c000000-0000-0000-0000-000000000203', author, '7c000000-0000-0000-0000-000000000100', 'Thoughts on the report?', 'public', 'active', 'active', 'inspection_discussion',
         '{"inspection_request_id":"7c000000-0000-0000-0000-000000000300"}' FROM pt;

  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, content, audience, status, moderation_status, post_type, details)
    SELECT author, 'x', 'public', 'active', 'active', 'buying_advice', '{"year_min":2020,"year_max":2010}' FROM pt;
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'buying advice year range is validated'; END IF;
  INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status, post_type, details)
  SELECT '7c000000-0000-0000-0000-000000000204', author, 'ND2 or GR86?', 'public', 'active', 'active', 'buying_advice',
         '{"budget_cents":3000000,"makes":["Mazda","Toyota"],"use_case":"Weekend canyon car"}' FROM pt;

  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, content, audience, status, moderation_status, post_type, details)
    SELECT author, 'Fractional mileage', 'public', 'active', 'active', 'maintenance',
           '{"service":"Oil change","mileage":1200.5}' FROM pt;
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'whole-number structured fields must stay integral'; END IF;

  -- Revisions carry details; a details edit is an edit.
  UPDATE public.community_posts SET details = '{"stage":"complete","parts":["Ohlins Road & Track"]}'
  WHERE id = '7c000000-0000-0000-0000-000000000201';
  IF (SELECT count(*) FROM public.community_post_revisions WHERE post_id = '7c000000-0000-0000-0000-000000000201') <> 2 THEN
    RAISE EXCEPTION 'details edits must create a revision';
  END IF;
  IF (SELECT details->>'stage' FROM public.community_post_revisions WHERE post_id = '7c000000-0000-0000-0000-000000000201' ORDER BY revision_number DESC LIMIT 1) <> 'complete' THEN
    RAISE EXCEPTION 'revisions must snapshot details';
  END IF;
END
$$;

-- Before / After needs two photos on its assembly.
DO $$
DECLARE hit boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_community_post_assembly((SELECT author FROM pt), gen_random_uuid(), 1::smallint, 'public', NULL, NULL, NULL,
      'before_after', 'Paint correction', 'active', NULL, now(), 'test', '{}'::jsonb);
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'before/after with one photo must be refused'; END IF;
  PERFORM public.create_community_post_assembly((SELECT author FROM pt), gen_random_uuid(), 2::smallint, 'public', NULL, NULL, NULL,
    'before_after', 'Paint correction', 'active', NULL, now(), 'test', '{}'::jsonb);
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Polls
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean;
  r jsonb;
  closes timestamptz;
BEGIN
  -- A pre-existing ordinary post may become a poll before it has votes.
  INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status, post_type, details)
  SELECT '7c000000-0000-0000-0000-000000000206', author, 'Turn this into a poll', 'public', 'active', 'active', 'general', '{}' FROM pt;
  UPDATE public.community_posts
  SET post_type = 'poll', details = '{"poll":{"duration_hours":24,"options":[{"key":"yes","label":"Yes"},{"key":"no","label":"No"}]}}'
  WHERE id = '7c000000-0000-0000-0000-000000000206';
  IF (SELECT poll_closes_at FROM public.community_posts WHERE id = '7c000000-0000-0000-0000-000000000206') IS NULL THEN
    RAISE EXCEPTION 'changing an ordinary post to a poll must set its close time';
  END IF;

  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, content, audience, status, moderation_status, post_type, details)
    SELECT author, 'Pick one', 'public', 'active', 'active', 'poll',
           '{"poll":{"duration_hours":48,"options":[{"key":"a","label":"A"},{"key":"b","label":"B"}]}}' FROM pt;
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'poll durations are fixed'; END IF;
  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, content, audience, status, moderation_status, post_type, details)
    SELECT author, 'Pick one', 'public', 'active', 'active', 'poll',
           '{"poll":{"duration_hours":24,"options":[{"key":"a","label":"A"}]}}' FROM pt;
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'polls need at least two options'; END IF;

  INSERT INTO public.community_posts (id, author_id, content, audience, status, moderation_status, post_type, details)
  SELECT '7c000000-0000-0000-0000-000000000205', author, 'Track day tires?', 'public', 'active', 'active', 'poll',
         '{"poll":{"duration_hours":72,"options":[{"key":"re71","label":"RE-71RS"},{"key":"rt660","label":"RT660"},{"key":"a052","label":"A052"}]}}' FROM pt;
  SELECT poll_closes_at INTO closes FROM public.community_posts WHERE id = '7c000000-0000-0000-0000-000000000205';
  IF closes IS NULL OR closes < now() + interval '71 hours' THEN RAISE EXCEPTION 'closes_at should be stamped from the duration'; END IF;

  -- Before voting: no counts for the viewer.
  IF (SELECT options->0->'votes' FROM public.community_poll_results((SELECT voter FROM pt), ARRAY['7c000000-0000-0000-0000-000000000205'::uuid])) <> 'null'::jsonb THEN
    RAISE EXCEPTION 'results are hidden until the viewer votes';
  END IF;

  r := public.cast_community_poll_vote((SELECT voter FROM pt), '7c000000-0000-0000-0000-000000000205', 'rt660');
  IF r->>'viewerOptionKey' <> 'rt660' OR (r->>'totalVotes')::int <> 1 THEN RAISE EXCEPTION 'vote failed: %', r; END IF;
  -- Changing the vote keeps one vote per account.
  r := public.cast_community_poll_vote((SELECT voter FROM pt), '7c000000-0000-0000-0000-000000000205', 'a052');
  IF (r->>'totalVotes')::int <> 1 OR r->>'viewerOptionKey' <> 'a052' THEN RAISE EXCEPTION 'changing a vote must not add one: %', r; END IF;
  IF (SELECT count(*) FROM public.community_poll_votes WHERE post_id = '7c000000-0000-0000-0000-000000000205') <> 1 THEN
    RAISE EXCEPTION 'one row per account';
  END IF;

  hit := false;
  BEGIN
    PERFORM public.cast_community_poll_vote((SELECT voter FROM pt), '7c000000-0000-0000-0000-000000000205', 'nope');
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'unknown options are refused'; END IF;

  -- Options freeze after the first vote; labels too.
  hit := false;
  BEGIN
    UPDATE public.community_posts
    SET details = '{"poll":{"duration_hours":72,"options":[{"key":"re71","label":"RE-71RS"},{"key":"rt660","label":"RT660 (new)"},{"key":"a052","label":"A052"}]}}'
    WHERE id = '7c000000-0000-0000-0000-000000000205';
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'options must freeze after the first vote'; END IF;

  -- Author's view: not voted, still hidden counts; the author sees totals like anyone else after voting.
  IF (SELECT viewer_option_key FROM public.community_poll_results((SELECT author FROM pt), ARRAY['7c000000-0000-0000-0000-000000000205'::uuid])) IS NOT NULL THEN
    RAISE EXCEPTION 'author has not voted';
  END IF;

  -- Closing stops voting and reveals counts to everyone.
  UPDATE public.community_posts SET poll_closes_at = now() - interval '1 minute' WHERE id = '7c000000-0000-0000-0000-000000000205';
  hit := false;
  BEGIN
    PERFORM public.cast_community_poll_vote((SELECT author FROM pt), '7c000000-0000-0000-0000-000000000205', 're71');
  EXCEPTION WHEN check_violation THEN hit := SQLERRM = 'poll_closed';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'closed polls must refuse votes'; END IF;
  IF (SELECT (options->2->>'votes')::int FROM public.community_poll_results((SELECT author FROM pt), ARRAY['7c000000-0000-0000-0000-000000000205'::uuid])) <> 1 THEN
    RAISE EXCEPTION 'closed polls show counts';
  END IF;

  -- A hidden poll disappears from results and refuses votes.
  UPDATE public.community_posts SET poll_closes_at = now() + interval '1 day', moderation_status = 'pending_review'
  WHERE id = '7c000000-0000-0000-0000-000000000205';
  IF EXISTS (SELECT 1 FROM public.community_poll_results((SELECT voter FROM pt), ARRAY['7c000000-0000-0000-0000-000000000205'::uuid])) THEN
    RAISE EXCEPTION 'hidden polls must not report results';
  END IF;
  hit := false;
  BEGIN
    PERFORM public.cast_community_poll_vote((SELECT voter FROM pt), '7c000000-0000-0000-0000-000000000205', 're71');
  EXCEPTION WHEN no_data_found THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'hidden polls must stop voting'; END IF;
END
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.community_poll_votes', 'SELECT')
     OR has_function_privilege('authenticated', 'public.cast_community_poll_vote(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.community_poll_results(uuid,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'poll internals leaked to clients';
  END IF;
END
$$;

ROLLBACK;
