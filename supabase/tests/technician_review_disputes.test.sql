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
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('d5000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dispute-requester@example.test', '', '{}', '{"username":"DisputeRequester"}', now(), now()),
  ('d5000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dispute-tech@example.test', '', '{}', '{"username":"DisputeTech"}', now(), now()),
  ('d5000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dispute-admin@example.test', '', '{}', '{"username":"DisputeAdmin"}', now(), now());

UPDATE public.profiles
SET role = CASE
  WHEN auth_user_id = 'd5000000-0000-4000-8000-000000000002' THEN 'technician'::public.user_role
  WHEN auth_user_id = 'd5000000-0000-4000-8000-000000000003' THEN 'admin'::public.user_role
  ELSE 'consumer'::public.user_role
END,
is_public = true
WHERE auth_user_id::text LIKE 'd5000000-%';

CREATE TEMP TABLE dispute_people AS
SELECT
  max(id::text) FILTER (WHERE auth_user_id = 'd5000000-0000-4000-8000-000000000001')::uuid AS requester,
  max(id::text) FILTER (WHERE auth_user_id = 'd5000000-0000-4000-8000-000000000002')::uuid AS technician,
  max(id::text) FILTER (WHERE auth_user_id = 'd5000000-0000-4000-8000-000000000003')::uuid AS administrator
FROM public.profiles;

INSERT INTO public.technician_profiles (id, profile_id)
SELECT 'd5100000-0000-4000-8000-000000000001', technician FROM dispute_people;

INSERT INTO public.vehicles (id, owner_id, vin, year, make, model, visibility)
SELECT 'd5200000-0000-4000-8000-000000000001', requester,
       '1HGCM82633A004352', 2020, 'Honda', 'Accord', 'private'
FROM dispute_people;

INSERT INTO public.ppi_requests (
  id, vehicle_id, requester_id, assigned_tech_id, whose_car,
  requester_role, performer_type, ppi_type, status
)
SELECT request_id, 'd5200000-0000-4000-8000-000000000001', requester, technician,
       'own', 'buying', 'technician', 'general_tech', 'completed'
FROM dispute_people
CROSS JOIN (VALUES
  ('d5300000-0000-4000-8000-000000000001'::uuid),
  ('d5300000-0000-4000-8000-000000000002'::uuid)
) requests(request_id);

INSERT INTO public.ppi_submissions (
  ppi_request_id, performer_id, status, submitted_at, completed_at
)
SELECT request_id, technician, 'completed', now() - interval '1 day', now() - interval '1 day'
FROM dispute_people
CROSS JOIN (VALUES
  ('d5300000-0000-4000-8000-000000000001'::uuid),
  ('d5300000-0000-4000-8000-000000000002'::uuid)
) requests(request_id);

INSERT INTO public.technician_reviews (
  id, technician_profile_id, reviewer_id, ppi_request_id, rating, title, content
)
SELECT review_id, 'd5100000-0000-4000-8000-000000000001', requester,
       request_id, rating, 'Transaction-linked review', 'Factual feedback for the completed inspection.'
FROM dispute_people
CROSS JOIN (VALUES
  ('d5400000-0000-4000-8000-000000000001'::uuid, 'd5300000-0000-4000-8000-000000000001'::uuid, 4),
  ('d5400000-0000-4000-8000-000000000002'::uuid, 'd5300000-0000-4000-8000-000000000002'::uuid, 3)
) reviews(review_id, request_id, rating);

DO $$
BEGIN
  PERFORM pg_temp.ok(
    NOT has_table_privilege('authenticated', 'public.ppi_service_disputes', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.ppi_service_dispute_events', 'SELECT'),
    'private dispute records are not exposed through the authenticated Data API role'
  );
  PERFORM pg_temp.ok(
    NOT has_function_privilege('authenticated', 'public.open_ppi_service_dispute(uuid,uuid,text,text)', 'EXECUTE'),
    'the dispute RPC is service-only'
  );
END $$;

DO $$
DECLARE
  v_requester uuid := (SELECT requester FROM dispute_people);
  v_technician uuid := (SELECT technician FROM dispute_people);
  v_dispute public.ppi_service_disputes;
  v_blocked boolean := false;
BEGIN
  v_dispute := public.open_ppi_service_dispute(
    v_requester,
    'd5300000-0000-4000-8000-000000000001',
    'incorrect_information',
    'Several factual inspection findings do not match the vehicle condition.'
  );

  PERFORM pg_temp.ok(v_dispute.status = 'open', 'requester can open a private dispute');
  PERFORM pg_temp.ok(
    EXISTS (
      SELECT 1 FROM public.technician_reviews
      WHERE id = 'd5400000-0000-4000-8000-000000000001'
        AND status = 'hidden' AND dispute_hold_id = v_dispute.id
    ),
    'opening a dispute hides and marks its active public review'
  );

  BEGIN
    UPDATE public.technician_reviews
    SET content = 'Changed while the dispute is active.'
    WHERE id = 'd5400000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    v_blocked := SQLERRM LIKE '%review_blocked_by_active_dispute%';
  END;
  PERFORM pg_temp.ok(v_blocked, 'review edits are frozen during an active dispute');

  v_blocked := false;
  BEGIN
    PERFORM public.open_ppi_service_dispute(
      v_technician,
      'd5300000-0000-4000-8000-000000000002',
      'other',
      'The assigned technician must not impersonate the inspection requester.'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  PERFORM pg_temp.ok(v_blocked, 'a technician cannot open a dispute as the requester');

  v_dispute := public.withdraw_ppi_service_dispute(v_requester, v_dispute.id);
  PERFORM pg_temp.ok(
    v_dispute.status = 'withdrawn'
    AND EXISTS (
      SELECT 1 FROM public.technician_reviews
      WHERE id = 'd5400000-0000-4000-8000-000000000001'
        AND status = 'active' AND dispute_hold_id IS NULL
    ),
    'withdrawal restores only the review held by that dispute'
  );

  v_blocked := false;
  BEGIN
    PERFORM public.open_ppi_service_dispute(
      v_requester,
      'd5300000-0000-4000-8000-000000000001',
      'other',
      'A second dispute for the same transaction should not be accepted.'
    );
  EXCEPTION WHEN OTHERS THEN
    v_blocked := SQLERRM LIKE '%dispute_already_open%';
  END;
  PERFORM pg_temp.ok(v_blocked, 'one inspection cannot create repetitive disputes');
END $$;

DO $$
DECLARE
  v_requester uuid := (SELECT requester FROM dispute_people);
  v_admin uuid := (SELECT administrator FROM dispute_people);
  v_dispute public.ppi_service_disputes;
  v_blocked boolean := false;
BEGIN
  v_dispute := public.open_ppi_service_dispute(
    v_requester,
    'd5300000-0000-4000-8000-000000000002',
    'quality_concern',
    'The inspection quality needs a private support review and documented decision.'
  );
  v_dispute := public.resolve_ppi_service_dispute(
    v_admin, v_dispute.id, 'resolved', 'partial_resolution',
    'Support confirmed part of the concern and documented the completed resolution.',
    false
  );

  PERFORM pg_temp.ok(
    v_dispute.status = 'resolved' AND v_dispute.review_action = 'kept_hidden'
    AND EXISTS (
      SELECT 1 FROM public.technician_reviews
      WHERE id = 'd5400000-0000-4000-8000-000000000002'
        AND status = 'hidden' AND dispute_hold_id IS NULL
    ),
    'an admin can explicitly resolve a dispute while keeping its review hidden'
  );

  BEGIN
    UPDATE public.technician_reviews
    SET content = 'A moderated hidden review must remain immutable to its author.'
    WHERE id = 'd5400000-0000-4000-8000-000000000002';
  EXCEPTION WHEN OTHERS THEN
    v_blocked := SQLERRM LIKE '%review_under_moderation%';
  END;
  PERFORM pg_temp.ok(v_blocked, 'a separately hidden review cannot be edited');

  v_blocked := false;
  BEGIN
    UPDATE public.ppi_service_dispute_events
    SET action = 'withdrawn'
    WHERE dispute_id = v_dispute.id;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := SQLERRM LIKE '%immutable%';
  END;
  PERFORM pg_temp.ok(v_blocked, 'dispute audit facts are immutable');
END $$;

-- Account deletion cascades profile and transaction rows. The audit trail may
-- lose identifying foreign keys, but it must not block deletion or disappear.
DELETE FROM auth.users WHERE id = 'd5000000-0000-4000-8000-000000000002';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.ppi_service_disputes WHERE technician_profile_id IS NULL) = 2,
  'technician account deletion anonymizes retained disputes without blocking'
);
DELETE FROM auth.users WHERE id = 'd5000000-0000-4000-8000-000000000001';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.ppi_service_dispute_events WHERE dispute_id IS NULL AND ppi_request_id IS NULL AND actor_id IS NULL) >= 2,
  'requester deletion preserves an anonymized dispute audit trail'
);

ROLLBACK;
