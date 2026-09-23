BEGIN;

-- Inspection report redesign: typed observations, role requirements, the
-- certified submit transaction and frozen submitted inspections.

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('71000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'v2owner@example.test', '', '{}', '{"username":"V2Owner"}', now(), now()),
  ('71000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'v2tech@example.test', '', '{}', '{"username":"V2Tech"}', now(), now()),
  ('71000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'v2stranger@example.test', '', '{}', '{"username":"V2Stranger"}', now(), now());

UPDATE public.profiles SET role = 'technician'
WHERE auth_user_id IN ('71000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000003');

INSERT INTO public.vehicles (id, owner_id, vin, year, make, model, visibility)
SELECT '72000000-0000-0000-0000-000000000001', id, '1HGCV1F30LA000001', 2021, 'Sample', 'Sedan', 'private'
FROM public.profiles WHERE auth_user_id = '71000000-0000-0000-0000-000000000001';

-- Technician inspection (Dents & Tires, catalog 2)
INSERT INTO public.ppi_requests (
  id, vehicle_id, requester_id, assigned_tech_id, whose_car, requester_role,
  performer_type, ppi_type, status, inspection_scope
)
SELECT '73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001',
  owner_profile.id, tech_profile.id, 'own', 'buying', 'technician', 'general_tech', 'in_progress', 'dents_tires'
FROM public.profiles owner_profile CROSS JOIN public.profiles tech_profile
WHERE owner_profile.auth_user_id = '71000000-0000-0000-0000-000000000001'
  AND tech_profile.auth_user_id = '71000000-0000-0000-0000-000000000002';

INSERT INTO public.ppi_submissions (id, ppi_request_id, performer_id, version, is_current, status, catalog_version)
SELECT '74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', id, 1, true, 'in_progress', 2
FROM public.profiles WHERE auth_user_id = '71000000-0000-0000-0000-000000000002';

INSERT INTO public.ppi_sections (id, ppi_submission_id, section_type, sort_order)
VALUES
  ('75000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001', 'wheels_tires', 1),
  ('75000000-0000-0000-0000-000000000002', '74000000-0000-0000-0000-000000000001', 'body_damage', 2);

INSERT INTO public.ppi_answers (id, ppi_section_id, prompt, question_key, answer_type, is_required, sort_order)
VALUES
  ('76000000-0000-0000-0000-000000000001', '75000000-0000-0000-0000-000000000001', 'Measure the front left tire tread depth', 'tires.front_left.tread', 'measurement', true, 1),
  ('76000000-0000-0000-0000-000000000002', '75000000-0000-0000-0000-000000000001', 'Measure the front left tire pressure', 'tires.front_left.pressure', 'measurement', true, 2),
  ('76000000-0000-0000-0000-000000000003', '75000000-0000-0000-0000-000000000001', 'Front left tire: damage or foreign objects', 'tires.front_left.damage', 'defect_list', true, 3),
  ('76000000-0000-0000-0000-000000000004', '75000000-0000-0000-0000-000000000002', 'Hood: visible condition', 'body.hood.condition', 'panel_condition', true, 1),
  ('76000000-0000-0000-0000-000000000005', '75000000-0000-0000-0000-000000000001', 'Brake pad (optional)', 'brakes.front_left.pad_thickness', 'measurement', false, 4);

-- A structured answer type without a semantic key is refused.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ppi_answers (ppi_section_id, prompt, answer_type, observation)
    VALUES ('75000000-0000-0000-0000-000000000001', 'Keyless', 'measurement',
      '{"v":1,"state":"observed","value":{"reading":"5","unit":"mm","method":"tread_depth_gauge"}}');
    RAISE EXCEPTION 'structured answer without a key was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Observation validation at the database boundary
-- ---------------------------------------------------------------------------

UPDATE public.ppi_answers
SET observation = '{"v":1,"state":"observed","value":{"reading":"5","unit":"thirty_seconds_inch","method":"tread_depth_gauge"},"source":"inspector_entry"}'
WHERE id = '76000000-0000-0000-0000-000000000001';

DO $$
BEGIN
  IF (SELECT answer_value FROM public.ppi_answers WHERE id = '76000000-0000-0000-0000-000000000001') <> '5/32 in' THEN
    RAISE EXCEPTION 'tread summary was not derived from the observation';
  END IF;
END;
$$;

-- A client cannot write its own summary over a structured answer.
UPDATE public.ppi_answers SET answer_value = 'looks great' WHERE id = '76000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT answer_value FROM public.ppi_answers WHERE id = '76000000-0000-0000-0000-000000000001') <> '5/32 in' THEN
    RAISE EXCEPTION 'client overwrote a derived structured summary';
  END IF;
END;
$$;

DO $$
DECLARE
  v_case record;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('76000000-0000-0000-0000-000000000001'::uuid, '{"v":1,"state":"observed","value":{"reading":"33","unit":"thirty_seconds_inch","method":"tread_depth_gauge"}}'::jsonb, 'tread above 32/32'),
      ('76000000-0000-0000-0000-000000000001', '{"v":1,"state":"observed","value":{"reading":"25.5","unit":"mm","method":"tread_depth_gauge"}}', 'tread above 25.4 mm'),
      ('76000000-0000-0000-0000-000000000001', '{"v":1,"state":"observed","value":{"reading":"-1","unit":"mm","method":"tread_depth_gauge"}}', 'negative tread'),
      ('76000000-0000-0000-0000-000000000001', '{"v":1,"state":"observed","value":{"reading":"1e1","unit":"mm","method":"tread_depth_gauge"}}', 'exponent tread'),
      ('76000000-0000-0000-0000-000000000001', '{"v":1,"state":"not_applicable","reason":{"code":"not_equipped"}}', 'not applicable tread'),
      ('76000000-0000-0000-0000-000000000001', '{"v":1,"state":"unable_to_assess"}', 'unavailable without reason'),
      ('76000000-0000-0000-0000-000000000001', '{"v":1,"state":"unable_to_assess","reason":{"code":"other"}}', 'other reason without explanation'),
      ('76000000-0000-0000-0000-000000000001', '{"v":1,"state":"outside_scope","reason":{"code":"other","explanation":"skip"}}', 'inspector-selected outside scope'),
      ('76000000-0000-0000-0000-000000000001', '{"v":1,"state":"not_recorded","reason":{"code":"other","explanation":"skip"}}', 'inspector-selected not recorded'),
      ('76000000-0000-0000-0000-000000000002', '{"v":1,"state":"observed","value":{"reading":"34","unit":"psi","context":"hot","method":"pressure_gauge"}}', 'pressure context'),
      ('76000000-0000-0000-0000-000000000002', '{"v":1,"state":"observed","value":{"reading":"34","unit":"psi","context":"cold","method":"pressure_gauge","pressure_loss":"observed"}}', 'pressure loss without a recheck'),
      ('76000000-0000-0000-0000-000000000002', '{"v":1,"state":"observed","value":{"reading":"34","unit":"psi","context":"cold","method":"pressure_gauge","pressure_loss":"not_observed_during_test","recheck":{"reading":"34","minutes_elapsed":"0"}}}', 'pressure recheck without elapsed time'),
      ('76000000-0000-0000-0000-000000000003', '{"v":1,"state":"observed","value":{"none_observed":true,"defects":[{"id":"abcd1","type":"puncture"}]}}', 'none observed with defects'),
      ('76000000-0000-0000-0000-000000000003', '{"v":1,"state":"observed","value":{"defects":[{"id":"abcd1","type":"scratch_curb_rash","certainty":"confirmed"}]}}', 'wheel defect type on a tire'),
      ('76000000-0000-0000-0000-000000000003', '{"v":1,"state":"observed","value":{"defects":[{"id":"abcd1","type":"puncture","location":"tread"}]}}', 'defect without a confirmation state'),
      ('76000000-0000-0000-0000-000000000003', '{"v":1,"state":"observed","value":{"defects":[]}}', 'empty defect list'),
      ('76000000-0000-0000-0000-000000000004', '{"v":1,"state":"observed","value":{"condition":"damage_present","defects":[]}}', 'damage without entries'),
      ('76000000-0000-0000-0000-000000000004', '{"v":1,"state":"observed","value":{"condition":"damage_present","defects":[{"id":"abcd2","type":"dent","severity":"minor","marker":{"x":2,"y":0.5}}]}}', 'marker outside the diagram'),
      ('76000000-0000-0000-0000-000000000004', '{"v":1,"state":"observed","value":{"condition":"damage_present","defects":[{"id":"abcd2","type":"dent","severity":"minor","marker":{"view":"side","x":0.5,"y":0.5}}]}}', 'marker on an unknown diagram view'),
      ('76000000-0000-0000-0000-000000000004', '{"v":1,"state":"observed","value":{"condition":"damage_present","defects":[{"id":"abcd2","type":"dent"}]}}', 'body defect without an extent')
    ) AS cases(answer_id, observation, label)
  LOOP
    BEGIN
      UPDATE public.ppi_answers SET observation = v_case.observation WHERE id = v_case.answer_id;
      RAISE EXCEPTION 'invalid observation accepted: %', v_case.label;
    EXCEPTION WHEN invalid_parameter_value OR check_violation THEN NULL;
    END;
  END LOOP;
END;
$$;

-- Body summaries use controlled values only, never the free-text note.
UPDATE public.ppi_answers
SET observation = '{"v":1,"state":"observed","value":{"condition":"damage_present","defects":[{"id":"abcd2","type":"dent","severity":"minor","note":"call me at 555-0100","marker":{"view":"top","x":0.5,"y":0.15}}]}}'
WHERE id = '76000000-0000-0000-0000-000000000004';
DO $$
BEGIN
  IF (SELECT answer_value FROM public.ppi_answers WHERE id = '76000000-0000-0000-0000-000000000004') <> 'Damage: minor dent' THEN
    RAISE EXCEPTION 'panel summary leaked free text or changed format: %',
      (SELECT answer_value FROM public.ppi_answers WHERE id = '76000000-0000-0000-0000-000000000004');
  END IF;
END;
$$;

-- Requirement flags stay server-managed.
DO $$
BEGIN
  BEGIN
    UPDATE public.ppi_answers SET is_required = false WHERE id = '76000000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'client changed a requirement flag';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Transitions only through the certified RPC
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    UPDATE public.ppi_submissions SET status = 'submitted' WHERE id = '74000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'direct status update bypassed certification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.submit_ppi_atomic('74000000-0000-0000-0000-000000000001', now());
    RAISE EXCEPTION 'uncertified submit RPC is still executable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

DO $$
DECLARE
  v_revision integer := (SELECT revision FROM public.ppi_submissions WHERE id = '74000000-0000-0000-0000-000000000001');
BEGIN
  IF v_revision < 2 THEN
    RAISE EXCEPTION 'answer edits did not advance the revision (%)', v_revision;
  END IF;

  BEGIN
    PERFORM public.submit_ppi_certified('74000000-0000-0000-0000-000000000001', v_revision, 'inspection_accuracy/1', false);
    RAISE EXCEPTION 'unchecked certification accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  BEGIN
    PERFORM public.submit_ppi_certified('74000000-0000-0000-0000-000000000001', v_revision, 'made_up/9', true);
    RAISE EXCEPTION 'unknown certification text accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  BEGIN
    PERFORM public.submit_ppi_certified('74000000-0000-0000-0000-000000000001', v_revision - 1, 'inspection_accuracy/1', true);
    RAISE EXCEPTION 'stale revision accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'stale_revision' THEN RAISE; END IF;
  END;

  -- Pressure and damage are still unanswered.
  BEGIN
    PERFORM public.submit_ppi_certified('74000000-0000-0000-0000-000000000001', v_revision, 'inspection_accuracy/1', true);
    RAISE EXCEPTION 'incomplete inspection submitted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'required_answers_incomplete' THEN RAISE; END IF;
  END;
END;
$$;

-- A technician cannot finalize with an unmeasured pressure, even with a reason.
UPDATE public.ppi_answers SET observation = '{"v":1,"state":"unable_to_assess","reason":{"code":"no_gauge"}}'
WHERE id = '76000000-0000-0000-0000-000000000002';
UPDATE public.ppi_answers SET observation = '{"v":1,"state":"observed","value":{"defects":[{"id":"abcd3","type":"foreign_object","location":"tread","certainty":"confirmed"}]}}'
WHERE id = '76000000-0000-0000-0000-000000000003';

DO $$
BEGIN
  PERFORM public.submit_ppi_certified(
    '74000000-0000-0000-0000-000000000001',
    (SELECT revision FROM public.ppi_submissions WHERE id = '74000000-0000-0000-0000-000000000001'),
    'inspection_accuracy/1', true
  );
  RAISE EXCEPTION 'technician submitted without a pressure measurement';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'technician_measurements_required' THEN RAISE; END IF;
END;
$$;

UPDATE public.ppi_answers
SET observation = '{"v":1,"state":"observed","value":{"reading":"34","unit":"psi","context":"cold","method":"pressure_gauge","pressure_loss":"not_observed_during_test","recheck":{"reading":"34","minutes_elapsed":"15"}}}'
WHERE id = '76000000-0000-0000-0000-000000000002';

-- Tread reading, declared tire damage and body damage each need a photo.
DO $$
BEGIN
  PERFORM public.submit_ppi_certified(
    '74000000-0000-0000-0000-000000000001',
    (SELECT revision FROM public.ppi_submissions WHERE id = '74000000-0000-0000-0000-000000000001'),
    'inspection_accuracy/1', true
  );
  RAISE EXCEPTION 'submitted without required evidence photos';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'required_photos_incomplete' THEN RAISE; END IF;
END;
$$;

INSERT INTO public.ppi_media (ppi_section_id, ppi_answer_id, url, media_type)
VALUES
  ('75000000-0000-0000-0000-000000000001', '76000000-0000-0000-0000-000000000001', 'r2-private:///ppi_media/x/tread.jpg', 'image'),
  ('75000000-0000-0000-0000-000000000001', '76000000-0000-0000-0000-000000000003', 'r2-private:///ppi_media/x/nail.jpg', 'image');

-- The body damage can use an explicit evidence exception instead of a photo.
UPDATE public.ppi_answers
SET observation = '{"v":1,"state":"observed","value":{"condition":"damage_present","defects":[{"id":"abcd2","type":"dent","severity":"minor"}]},"evidence_exception":{"code":"weather_or_lighting"}}'
WHERE id = '76000000-0000-0000-0000-000000000004';

-- A stranger cannot certify someone else's inspection.
SELECT set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
DO $$
BEGIN
  PERFORM public.submit_ppi_certified('74000000-0000-0000-0000-000000000001', 0, 'inspection_accuracy/1', true);
  RAISE EXCEPTION 'stranger certified an inspection';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$$;

-- The server records each photo's content facts (normally right after upload);
-- certification freezes them into the manifest.
SET LOCAL ROLE service_role;
UPDATE public.ppi_media
SET content_sha256 = encode(sha256(convert_to(url, 'UTF8')), 'hex'), byte_size = 2048,
    content_type = 'image/jpeg', content_verified_at = now()
WHERE ppi_section_id = '75000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

CREATE TEMP TABLE v2_result ON COMMIT DROP AS
SELECT public.submit_ppi_certified(
  '74000000-0000-0000-0000-000000000001',
  (SELECT revision FROM public.ppi_submissions WHERE id = '74000000-0000-0000-0000-000000000001'),
  'inspection_accuracy/1', true, 'en-US'
) AS result;

DO $$
DECLARE
  v_result jsonb := (SELECT result FROM v2_result);
  v_cert public.ppi_submission_certifications%ROWTYPE;
BEGIN
  IF (v_result->>'replayed')::boolean THEN
    RAISE EXCEPTION 'first submit reported as a replay';
  END IF;
  SELECT * INTO v_cert FROM public.ppi_submission_certifications
  WHERE ppi_submission_id = '74000000-0000-0000-0000-000000000001';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'certification was not recorded';
  END IF;
  IF v_cert.facts_hash <> v_result->>'facts_hash' OR length(v_cert.facts_hash) <> 64 THEN
    RAISE EXCEPTION 'facts hash mismatch';
  END IF;
  IF v_cert.certification_text <> 'I certify that the observations and answers in this inspection are accurate to the best of my knowledge and ability.' THEN
    RAISE EXCEPTION 'certification wording not frozen';
  END IF;
  IF v_cert.performer_mode <> 'technician' THEN
    RAISE EXCEPTION 'performer mode not derived from the request';
  END IF;
  IF jsonb_array_length(v_cert.media_manifest) <> 2
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_cert.media_manifest) AS entry WHERE entry->>'sha256' IS NULL)
  THEN
    RAISE EXCEPTION 'media manifest not frozen with content hashes';
  END IF;
  -- The stored hash is reproducible from the stored snapshot.
  IF encode(sha256(convert_to(v_cert.facts_snapshot::text, 'UTF8')), 'hex') <> v_cert.facts_hash THEN
    RAISE EXCEPTION 'facts hash is not reproducible from the snapshot';
  END IF;
  IF (SELECT status FROM public.ppi_submissions WHERE id = '74000000-0000-0000-0000-000000000001') <> 'submitted' THEN
    RAISE EXCEPTION 'submission not marked submitted';
  END IF;
  IF (SELECT status FROM public.ppi_requests WHERE id = '73000000-0000-0000-0000-000000000001') <> 'submitted' THEN
    RAISE EXCEPTION 'request not marked submitted';
  END IF;
END;
$$;

-- Retrying the same submit replays; a different revision cannot replace it.
DO $$
DECLARE
  v_first jsonb := (SELECT result FROM v2_result);
  v_retry jsonb;
BEGIN
  v_retry := public.submit_ppi_certified(
    '74000000-0000-0000-0000-000000000001', (v_first->>'revision')::integer, 'inspection_accuracy/1', true
  );
  IF NOT (v_retry->>'replayed')::boolean OR v_retry->>'certification_id' <> v_first->>'certification_id' THEN
    RAISE EXCEPTION 'retry did not replay the same certification';
  END IF;
  BEGIN
    PERFORM public.submit_ppi_certified(
      '74000000-0000-0000-0000-000000000001', (v_first->>'revision')::integer + 1, 'inspection_accuracy/1', true
    );
    RAISE EXCEPTION 'a different revision replaced a certification';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'submission_not_editable' THEN RAISE; END IF;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Frozen after submission
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    UPDATE public.ppi_answers SET observation = '{"v":1,"state":"observed","value":{"none_observed":true}}'
    WHERE id = '76000000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'submitted answer changed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.ppi_media (ppi_section_id, url, media_type)
    VALUES ('75000000-0000-0000-0000-000000000001', 'r2-private:///ppi_media/x/late.jpg', 'image');
    RAISE EXCEPTION 'photo added after submission';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Deletion is refused by the trigger or filtered by the draft-only delete
  -- policy; either way the evidence must still exist.
  BEGIN
    DELETE FROM public.ppi_media WHERE ppi_answer_id = '76000000-0000-0000-0000-000000000003';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT count(*) FROM public.ppi_media WHERE ppi_answer_id = '76000000-0000-0000-0000-000000000003') <> 1 THEN
    RAISE EXCEPTION 'evidence photo deleted after submission';
  END IF;
  BEGIN
    UPDATE public.ppi_sections SET notes = 'edited later' WHERE id = '75000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'section notes changed after submission';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.ppi_submissions SET status = 'in_progress' WHERE id = '74000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'submitted inspection reopened in place';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.ppi_submission_certifications SET facts_hash = repeat('0', 64)
    WHERE ppi_submission_id = '74000000-0000-0000-0000-000000000001';
    IF FOUND THEN
      RAISE EXCEPTION 'certification changed';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- Starting a revision may retire the submitted version.
UPDATE public.ppi_submissions SET is_current = false WHERE id = '74000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT is_current FROM public.ppi_submissions WHERE id = '74000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'submitted version could not be retired for a revision';
  END IF;
END;
$$;

-- The owner can read the certification; a stranger cannot.
SELECT set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ppi_submission_certifications WHERE ppi_submission_id = '74000000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'requester cannot read the certification';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.ppi_submission_certifications) <> 0 THEN
    RAISE EXCEPTION 'stranger can read certifications';
  END IF;
  IF (SELECT count(*) FROM public.inspection_output_exports) <> 0 THEN
    RAISE EXCEPTION 'stranger can read exports';
  END IF;
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Self-inspector: explicit unavailable readings are allowed with a reason
-- ---------------------------------------------------------------------------

INSERT INTO public.ppi_requests (
  id, vehicle_id, requester_id, whose_car, requester_role, performer_type, ppi_type, status, inspection_scope
)
SELECT '73000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', id,
  'own', 'documenting', 'self', 'personal', 'in_progress', 'dents_tires'
FROM public.profiles WHERE auth_user_id = '71000000-0000-0000-0000-000000000001';

INSERT INTO public.ppi_submissions (id, ppi_request_id, performer_id, version, is_current, status, catalog_version)
SELECT '74000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000002', id, 1, true, 'in_progress', 2
FROM public.profiles WHERE auth_user_id = '71000000-0000-0000-0000-000000000001';

INSERT INTO public.ppi_sections (id, ppi_submission_id, section_type, sort_order)
VALUES ('75000000-0000-0000-0000-000000000003', '74000000-0000-0000-0000-000000000002', 'wheels_tires', 1);

INSERT INTO public.ppi_answers (id, ppi_section_id, prompt, question_key, answer_type, is_required, sort_order)
VALUES
  ('76000000-0000-0000-0000-000000000011', '75000000-0000-0000-0000-000000000003', 'Measure the rear left tire tread depth', 'tires.rear_left.tread', 'measurement', true, 1),
  ('76000000-0000-0000-0000-000000000012', '75000000-0000-0000-0000-000000000003', 'Measure the rear left tire pressure', 'tires.rear_left.pressure', 'measurement', true, 2);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- A client cannot create a submission that is already submitted.
DO $$
BEGIN
  INSERT INTO public.ppi_submissions (ppi_request_id, performer_id, version, is_current, status)
  SELECT '73000000-0000-0000-0000-000000000002', id, 2, false, 'submitted'
  FROM public.profiles WHERE auth_user_id = '71000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'client inserted a submitted submission';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$$;

UPDATE public.ppi_answers SET observation = '{"v":1,"state":"unable_to_assess","reason":{"code":"no_gauge"}}'
WHERE id IN ('76000000-0000-0000-0000-000000000011', '76000000-0000-0000-0000-000000000012');

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.submit_ppi_certified(
    '74000000-0000-0000-0000-000000000002',
    (SELECT revision FROM public.ppi_submissions WHERE id = '74000000-0000-0000-0000-000000000002'),
    'inspection_accuracy/1', true
  );
  IF (SELECT performer_mode FROM public.ppi_submission_certifications WHERE ppi_submission_id = '74000000-0000-0000-0000-000000000002') <> 'self' THEN
    RAISE EXCEPTION 'self-inspection mode not recorded';
  END IF;
  IF (SELECT answer_value FROM public.ppi_answers WHERE id = '76000000-0000-0000-0000-000000000011') <> 'Unable to assess (no gauge)' THEN
    RAISE EXCEPTION 'unavailable summary changed: %', (SELECT answer_value FROM public.ppi_answers WHERE id = '76000000-0000-0000-0000-000000000011');
  END IF;
END;
$$;

ROLLBACK;
