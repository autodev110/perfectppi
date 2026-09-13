\set ON_ERROR_STOP on
BEGIN;

-- Section 37 production-like journey: onboarding through final retention.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('d1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'journey-owner@example.test', '', '{}',
   '{"username":"JourneyOwner"}', now(), now()),
  ('d1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'journey-author@example.test', '', '{}',
   '{}', now(), now()),
  ('d1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'journey-moderator@example.test', '', '{}',
   '{"username":"JourneyMod"}', now(), now());

UPDATE public.profiles
SET is_public = true,
    default_post_audience = 'public',
    created_at = now() - interval '10 days',
    role = CASE
      WHEN auth_user_id = 'd1000000-0000-4000-8000-000000000003'
        THEN 'admin'::public.user_role
      ELSE role
    END
WHERE auth_user_id IN (
  'd1000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000003'
);

CREATE TEMP TABLE journey_ids AS
SELECT
  max(id::text) FILTER (WHERE auth_user_id = 'd1000000-0000-4000-8000-000000000001')::uuid AS owner_id,
  max(id::text) FILTER (WHERE auth_user_id = 'd1000000-0000-4000-8000-000000000002')::uuid AS author_id,
  max(id::text) FILTER (WHERE auth_user_id = 'd1000000-0000-4000-8000-000000000003')::uuid AS moderator_id,
  NULL::uuid AS group_id,
  NULL::uuid AS restored_case_id,
  NULL::integer AS restored_case_version,
  NULL::uuid AS removed_case_id,
  NULL::integer AS removed_case_version
FROM public.profiles;

GRANT SELECT ON journey_ids TO authenticated;

-- A pending account claims its permanent username before any social action.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SELECT public.claim_own_username('JourneyAuthor');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT author_id FROM journey_ids)
      AND username = 'JourneyAuthor'
      AND username_state = 'claimed'
  ) THEN
    RAISE EXCEPTION 'journey onboarding did not produce a claimed username';
  END IF;
END
$$;

-- Garage ownership and mutual friendship precede Community participation.
INSERT INTO public.vehicles (id, owner_id, vin, year, make, model, mileage)
SELECT 'd2000000-0000-4000-8000-000000000001', author_id,
       '1HGCM82633A004352', 2003, 'Honda', 'Accord', 78000
FROM journey_ids;

SELECT public.send_friend_request(author_id, owner_id) FROM journey_ids;
SELECT public.respond_friend_request(owner_id, author_id, true) FROM journey_ids;

DO $$
BEGIN
  IF NOT public.social_profiles_are_friends(
    (SELECT author_id FROM journey_ids), (SELECT owner_id FROM journey_ids)
  ) THEN
    RAISE EXCEPTION 'journey friendship was not accepted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = 'd2000000-0000-4000-8000-000000000001'
      AND owner_id = (SELECT author_id FROM journey_ids)
  ) THEN
    RAISE EXCEPTION 'journey vehicle was not attached to its owner';
  END IF;
END
$$;

-- The group owner creates a private group and approves the author's request.
DO $$
DECLARE
  v_group public.community_groups;
BEGIN
  v_group := public.create_community_group(
    (SELECT owner_id FROM journey_ids),
    'release-journey-garage',
    'Release Journey Garage',
    'Private release verification group.',
    'general',
    ARRAY['Keep vehicle details respectful and relevant'],
    NULL, NULL, NULL, NULL, NULL,
    'members',
    'private',
    'request_approval'
  );
  UPDATE journey_ids SET group_id = v_group.id;
END
$$;

SELECT public.request_group_membership(author_id, group_id, 'Please add me for release testing.')
FROM journey_ids;
SELECT public.decide_group_join_request(owner_id, group_id, author_id, true)
FROM journey_ids;
SELECT public.acknowledge_community_group_rules(author_id, group_id)
FROM journey_ids;

DO $$
BEGIN
  IF NOT public.community_group_content_visible(
    (SELECT author_id FROM journey_ids), (SELECT group_id FROM journey_ids)
  ) THEN
    RAISE EXCEPTION 'approved journey member could not read the private group';
  END IF;
  IF (SELECT count(*) FROM public.list_owned_active_groups((SELECT author_id FROM journey_ids))) <> 0 THEN
    RAISE EXCEPTION 'journey author unexpectedly owns a group and cannot be deleted';
  END IF;
END
$$;

-- Two ordinary posts let the journey exercise both Restore and Remove.
INSERT INTO public.community_posts (
  id, author_id, group_id, content, audience, status, moderation_status
)
SELECT 'd3000000-0000-4000-8000-000000000001', author_id, group_id,
       'First release journey post.', 'public', 'active', 'active'
FROM journey_ids;

INSERT INTO public.community_posts (
  id, author_id, group_id, content, audience, status, moderation_status
)
SELECT 'd3000000-0000-4000-8000-000000000002', author_id, group_id,
       'Second release journey post.', 'public', 'active', 'active'
FROM journey_ids;

-- Grant only the capabilities needed by this test's moderator and establish
-- an approved retention period before either case closes.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
SELECT public.grant_moderation_capability(
  (SELECT moderator_id FROM journey_ids), 'queue_read',
  'release journey moderator queue access'
);
SELECT public.grant_moderation_capability(
  (SELECT moderator_id FROM journey_ids), 'content_decide',
  'release journey content decisions'
);
SELECT public.grant_moderation_capability(
  (SELECT moderator_id FROM journey_ids), 'legal_hold_review',
  'release journey retention approval'
);
SELECT public.set_moderation_retention_policy(
  'community_safety', 30,
  'Release journey approved test policy reference QA-37'
);
RESET ROLE;

-- One eligible report globally hides the first post; the moderator restores it.
SELECT public.submit_moderation_report(
  owner_id,
  'community_post',
  'd3000000-0000-4000-8000-000000000001',
  (SELECT active_revision_id FROM public.community_posts
   WHERE id = 'd3000000-0000-4000-8000-000000000001'),
  'spam',
  NULL,
  'release-journey-restore-report'
)
FROM journey_ids;

UPDATE journey_ids
SET restored_case_id = moderation_case.id,
    restored_case_version = moderation_case.decision_version
FROM public.moderation_cases AS moderation_case
WHERE moderation_case.entity_type = 'community_post'
  AND moderation_case.entity_id = 'd3000000-0000-4000-8000-000000000001';

DO $$
BEGIN
  IF public.social_can_view_community_post(
    (SELECT owner_id FROM journey_ids),
    'd3000000-0000-4000-8000-000000000001',
    false
  ) THEN
    RAISE EXCEPTION 'first journey report did not globally hide the post';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT public.decide_moderation_case(
  restored_case_id, restored_case_version,
  'restore', NULL, NULL, 'none', 7
)
FROM journey_ids;
RESET ROLE;

DO $$
BEGIN
  IF NOT public.social_can_view_community_post(
    (SELECT owner_id FROM journey_ids),
    'd3000000-0000-4000-8000-000000000001',
    false
  ) THEN
    RAISE EXCEPTION 'restored journey post did not return to its private audience';
  END IF;
END
$$;

-- The second post is removed, appealed by its author, and upheld.
SELECT public.submit_moderation_report(
  owner_id,
  'community_post',
  'd3000000-0000-4000-8000-000000000002',
  (SELECT active_revision_id FROM public.community_posts
   WHERE id = 'd3000000-0000-4000-8000-000000000002'),
  'spam',
  NULL,
  'release-journey-remove-report'
)
FROM journey_ids;

UPDATE journey_ids
SET removed_case_id = moderation_case.id,
    removed_case_version = moderation_case.decision_version
FROM public.moderation_cases AS moderation_case
WHERE moderation_case.entity_type = 'community_post'
  AND moderation_case.entity_id = 'd3000000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT public.decide_moderation_case(
  removed_case_id, removed_case_version,
  'remove', 'spam', 'Confirmed duplicate promotional content.', 'none', 7
)
FROM journey_ids;
RESET ROLE;

SELECT public.open_moderation_appeal(
  moderation_case.moderation_item_id,
  journey_ids.author_id,
  'Please reconsider this Community removal decision.'
)
FROM journey_ids
JOIN public.moderation_cases AS moderation_case
  ON moderation_case.id = journey_ids.removed_case_id;

UPDATE journey_ids
SET removed_case_version = moderation_case.decision_version
FROM public.moderation_cases AS moderation_case
WHERE moderation_case.id = journey_ids.removed_case_id;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.purge_moderation_case((SELECT removed_case_id FROM journey_ids));
  IF v_result->>'reason' <> 'case_open' THEN
    RAISE EXCEPTION 'open journey appeal did not block retention purge: %', v_result;
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT public.decide_moderation_case(
  removed_case_id, removed_case_version,
  'remove', 'spam', 'Appeal reviewed; the original decision is upheld.', 'none', 7
)
FROM journey_ids;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_appeals
    WHERE case_id = (SELECT removed_case_id FROM journey_ids)
      AND status = 'denied'
  ) THEN
    RAISE EXCEPTION 'journey appeal was not durably decided';
  END IF;
END
$$;

-- Mirror the durable deletion worker contract: claim the request, remove the
-- Auth account, then retain only the minimized completion record.
INSERT INTO public.privacy_requests (
  id, profile_id, auth_user_id, subject_reference_hash,
  request_type, source, details
)
SELECT
  'd4000000-0000-4000-8000-000000000001',
  author_id,
  'd1000000-0000-4000-8000-000000000002',
  encode(extensions.digest('d1000000-0000-4000-8000-000000000002', 'sha256'), 'hex'),
  'deletion', 'ios', 'User confirmed account deletion.'
FROM journey_ids;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.claim_privacy_deletion_requests(1, 'release-journey-worker')) <> 1 THEN
    RAISE EXCEPTION 'journey deletion request was not claimed';
  END IF;
END
$$;

DELETE FROM auth.users
WHERE id = 'd1000000-0000-4000-8000-000000000002';

UPDATE public.privacy_requests
SET status = 'completed',
    auth_user_id = NULL,
    details = NULL,
    account_deleted_at = now(),
    completed_at = now(),
    retention_expires_at = now() + interval '24 months',
    locked_at = NULL,
    lock_expires_at = NULL,
    locked_by = NULL,
    result_metadata = '{"storageObjectsDeleted":0,"retainedEvidenceObjects":0}'::jsonb
WHERE id = 'd4000000-0000-4000-8000-000000000001';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT author_id FROM journey_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE owner_id = (SELECT author_id FROM journey_ids)
  ) OR EXISTS (
    SELECT 1 FROM public.community_group_memberships
    WHERE profile_id = (SELECT author_id FROM journey_ids)
  ) THEN
    RAISE EXCEPTION 'account deletion left live profile-owned journey data';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.privacy_requests
    WHERE id = 'd4000000-0000-4000-8000-000000000001'
      AND profile_id IS NULL
      AND auth_user_id IS NULL
      AND details IS NULL
      AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'privacy request was not retained in minimized form';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_cases
    WHERE id = (SELECT removed_case_id FROM journey_ids)
      AND state = 'closed'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.moderation_evidence
    WHERE case_id = (SELECT removed_case_id FROM journey_ids)
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.moderation_items AS item
    JOIN public.moderation_cases AS moderation_case
      ON moderation_case.moderation_item_id = item.id
    WHERE moderation_case.id = (SELECT removed_case_id FROM journey_ids)
      AND item.author_id IS NULL
  ) THEN
    RAISE EXCEPTION 'account deletion did not preserve anonymized moderation evidence';
  END IF;
END
$$;

-- Once the approved period expires, evidence is purged but its audit tombstone
-- and immutable decision timeline remain.
UPDATE public.moderation_cases
SET retention_expires_at = now() - interval '1 day'
WHERE id = (SELECT removed_case_id FROM journey_ids);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.purge_moderation_case((SELECT removed_case_id FROM journey_ids));
  IF v_result->>'outcome' <> 'purged'
     OR NOT (v_result->>'contentRemoved')::boolean THEN
    RAISE EXCEPTION 'eligible journey evidence was not purged: %', v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.moderation_evidence
    WHERE case_id = (SELECT removed_case_id FROM journey_ids)
  ) THEN
    RAISE EXCEPTION 'journey evidence survived its eligible purge';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_cases
    WHERE id = (SELECT removed_case_id FROM journey_ids)
      AND disposition_state = 'purged'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.moderation_events
    WHERE case_id = (SELECT removed_case_id FROM journey_ids)
      AND event_type = 'evidence_purged'
  ) THEN
    RAISE EXCEPTION 'journey purge did not preserve its audit tombstone';
  END IF;
END
$$;

ROLLBACK;
