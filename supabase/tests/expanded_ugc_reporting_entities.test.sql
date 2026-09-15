\set ON_ERROR_STOP on
BEGIN;

-- Plan 16.4/16.5: every expanded entity type is reportable through one RPC,
-- the reporter only ever hides what they could see, a moderator's Remove
-- takes exactly that entity out of circulation, and retention disposal never
-- deletes stored objects that live rows still display.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('94000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ee-author@example.test', '', '{}', '{"username":"EeAuthor"}', now(), now()),
  ('94000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ee-reporter@example.test', '', '{}', '{"username":"EeReporter"}', now(), now()),
  ('94000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ee-tech@example.test', '', '{}', '{"username":"EeTech"}', now(), now()),
  ('94000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ee-admin@example.test', '', '{}', '{"username":"EeAdmin"}', now(), now()),
  ('94000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ee-outsider@example.test', '', '{}', '{"username":"EeOutsider"}', now(), now());
UPDATE public.profiles
SET is_public = true, username_state = 'claimed', created_at = now() - interval '30 days'
WHERE auth_user_id::text LIKE '94000000-%';
UPDATE public.profiles SET role = 'technician' WHERE auth_user_id = '94000000-0000-0000-0000-000000000003';
UPDATE public.profiles SET role = 'admin' WHERE auth_user_id = '94000000-0000-0000-0000-000000000004';

CREATE TEMP TABLE ee AS SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '94000000-0000-0000-0000-000000000001') AS author,
  (SELECT id FROM public.profiles WHERE auth_user_id = '94000000-0000-0000-0000-000000000002') AS reporter,
  (SELECT id FROM public.profiles WHERE auth_user_id = '94000000-0000-0000-0000-000000000003') AS tech,
  (SELECT id FROM public.profiles WHERE auth_user_id = '94000000-0000-0000-0000-000000000004') AS admin,
  (SELECT id FROM public.profiles WHERE auth_user_id = '94000000-0000-0000-0000-000000000005') AS outsider,
  NULL::uuid AS group_id;
GRANT SELECT ON ee TO PUBLIC;

DO $$
DECLARE g public.community_groups;
BEGIN
  g := public.create_community_group((SELECT author FROM ee), 'ee-club', 'EE Club', 'Reportable group.', 'general');
  UPDATE ee SET group_id = g.id;
END $$;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '94100000-0000-0000-0000-000000000001', author, 2018, 'Honda', 'Civic', 'public' FROM ee;
INSERT INTO public.vehicle_media (id, vehicle_id, url, media_type, is_primary, sort_order, moderation_status) VALUES
  ('94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000001', 'https://cdn.example.test/ee-1.jpg', 'image', true, 0, 'active'),
  ('94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000001', 'https://cdn.example.test/ee-2.jpg', 'image', false, 1, 'pending_review');
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status)
SELECT '94300000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000001', author, 'EE Civic', 1500000, 'active' FROM ee;

INSERT INTO public.technician_profiles (id, profile_id) SELECT '94400000-0000-0000-0000-000000000001', tech FROM ee;
INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '94100000-0000-0000-0000-000000000002', author, 2020, 'Honda', 'Accord', 'private' FROM ee;
INSERT INTO public.ppi_requests (id, vehicle_id, requester_id, assigned_tech_id, whose_car, requester_role, performer_type, ppi_type, status)
SELECT '94500000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000002', author, tech,
       'own', 'buying', 'technician', 'general_tech', 'completed' FROM ee;
INSERT INTO public.ppi_submissions (ppi_request_id, performer_id, status, submitted_at, completed_at)
SELECT '94500000-0000-0000-0000-000000000001', tech, 'completed', now() - interval '1 day', now() - interval '1 day' FROM ee;
INSERT INTO public.technician_reviews (id, technician_profile_id, reviewer_id, ppi_request_id, rating, title, content)
SELECT '94600000-0000-0000-0000-000000000001', '94400000-0000-0000-0000-000000000001', author,
       '94500000-0000-0000-0000-000000000001', 4, 'Review title', 'Review content here.' FROM ee;

INSERT INTO public.friend_relationships (profile_low_id, profile_high_id, requested_by, status, responded_at)
SELECT LEAST(author, reporter), GREATEST(author, reporter), author, 'friends', now() FROM ee;
UPDATE public.profiles SET allow_friend_messages = true
WHERE id IN (SELECT author FROM ee UNION SELECT reporter FROM ee);
INSERT INTO public.conversations (id, request_status, requested_by)
SELECT '94700000-0000-0000-0000-000000000001', 'accepted', author FROM ee;
INSERT INTO public.conversation_participants (conversation_id, profile_id)
SELECT '94700000-0000-0000-0000-000000000001'::uuid, author FROM ee
UNION ALL SELECT '94700000-0000-0000-0000-000000000001'::uuid, reporter FROM ee;
INSERT INTO public.messages (id, conversation_id, sender_id, content)
SELECT '94800000-0000-0000-0000-000000000001', '94700000-0000-0000-0000-000000000001', author, 'hello' FROM ee;

-- 1. Every entity type reports, hides for the reporter only, and captures
--    evidence of what the reporter could actually see.
DO $$
DECLARE
  result jsonb;
  hit boolean;
BEGIN
  FOREACH result IN ARRAY ARRAY[
    public.submit_extended_moderation_report((SELECT reporter FROM ee), 'group', (SELECT group_id FROM ee), 'spam', NULL, 'ee-group-report-0000000000001'),
    public.submit_extended_moderation_report((SELECT reporter FROM ee), 'listing', '94300000-0000-0000-0000-000000000001', 'fraud', NULL, 'ee-listing-report-000000000001'),
    public.submit_extended_moderation_report((SELECT reporter FROM ee), 'review', '94600000-0000-0000-0000-000000000001', 'harassment', NULL, 'ee-review-report-0000000000001'),
    public.submit_extended_moderation_report((SELECT reporter FROM ee), 'message', '94800000-0000-0000-0000-000000000001', 'harassment', NULL, 'ee-message-report-000000000001'),
    public.submit_extended_moderation_report((SELECT reporter FROM ee), 'media', '94200000-0000-0000-0000-000000000001', 'sexual_content', NULL, 'ee-media-report-00000000000001')
  ] LOOP
    IF result->>'contentStatus' <> 'hidden_for_reporter' OR (result->>'hiddenGlobally')::boolean THEN
      RAISE EXCEPTION 'unexpected report result: %', result;
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT entity_type) FROM public.moderation_reporter_hidden_entities
      WHERE reporter_id = (SELECT reporter FROM ee)) <> 5 THEN
    RAISE EXCEPTION 'reporter-only hides were not recorded for every entity type';
  END IF;

  -- Listing evidence carries only the photos that were visible.
  IF (SELECT jsonb_array_length(evidence.media_references)
      FROM public.moderation_evidence evidence
      JOIN public.moderation_cases c ON c.id = evidence.case_id
      WHERE c.entity_type = 'listing' AND c.entity_id = '94300000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'listing evidence included media the reporter could not see';
  END IF;

  -- A photo the upload scan is holding is not reachable by id.
  hit := false;
  BEGIN
    PERFORM public.submit_extended_moderation_report((SELECT reporter FROM ee), 'media', '94200000-0000-0000-0000-000000000002', 'spam', NULL, 'ee-media-report-00000000000002');
  EXCEPTION WHEN no_data_found THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'held media was reportable'; END IF;

  -- A message in someone else's conversation is not reportable.
  hit := false;
  BEGIN
    PERFORM public.submit_extended_moderation_report((SELECT outsider FROM ee), 'message', '94800000-0000-0000-0000-000000000001', 'spam', NULL, 'ee-message-report-000000000009');
  EXCEPTION WHEN no_data_found THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'outsider could report a private message'; END IF;

  -- Nothing is globally hidden by a single report.
  IF NOT public.social_can_view_profile((SELECT outsider FROM ee), (SELECT author FROM ee)) THEN
    RAISE EXCEPTION 'author profile hidden by an unrelated report';
  END IF;
  IF (SELECT moderation_status FROM public.vehicle_media WHERE id = '94200000-0000-0000-0000-000000000001') <> 'active' THEN
    RAISE EXCEPTION 'one media report changed the media status';
  END IF;
END $$;

-- 2. Moderator decisions: Remove rejects exactly the media row; Restore
--    reactivates it and clears the reporter hide.
SELECT set_config('test.ee_media_case', (SELECT id::text FROM public.moderation_cases WHERE entity_type = 'media' AND entity_id = '94200000-0000-0000-0000-000000000001' AND state = 'open'), true);
SELECT set_config('test.ee_listing_case', (SELECT id::text FROM public.moderation_cases WHERE entity_type = 'listing' AND entity_id = '94300000-0000-0000-0000-000000000001' AND state = 'open'), true);
SELECT set_config('test.ee_review_case', (SELECT id::text FROM public.moderation_cases WHERE entity_type = 'review' AND entity_id = '94600000-0000-0000-0000-000000000001' AND state = 'open'), true);
SELECT set_config('test.ee_admin', (SELECT admin::text FROM ee), true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"94000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT public.grant_moderation_capability(current_setting('test.ee_admin')::uuid, 'content_decide', 'expanded UGC entity regression suite');
SELECT public.decide_moderation_case(current_setting('test.ee_media_case')::uuid, 1, 'remove', 'sexual_content', 'Confirmed policy violation in the photo.', 'none', 7);
SELECT public.decide_moderation_case(current_setting('test.ee_listing_case')::uuid, 1, 'remove', 'fraud', 'Listing misrepresents the vehicle.', 'none', 7);
SELECT public.decide_moderation_case(current_setting('test.ee_review_case')::uuid, 1, 'restore', NULL, 'No violation in the review.', 'none', 7);
RESET ROLE;

DO $$
BEGIN
  IF (SELECT moderation_status FROM public.vehicle_media WHERE id = '94200000-0000-0000-0000-000000000001') <> 'rejected' THEN
    RAISE EXCEPTION 'media removal did not reject the vehicle photo';
  END IF;
  IF (SELECT moderation_status FROM public.vehicle_media WHERE id = '94200000-0000-0000-0000-000000000002') <> 'pending_review' THEN
    RAISE EXCEPTION 'media removal touched a sibling photo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.moderation_reporter_hidden_entities
    WHERE entity_type = 'review' AND entity_id = '94600000-0000-0000-0000-000000000001'
  ) THEN RAISE EXCEPTION 'restore left the review hidden for the reporter'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.moderation_items
    WHERE entity_type = 'listing' AND entity_id = '94300000-0000-0000-0000-000000000001' AND status = 'rejected'
  ) THEN RAISE EXCEPTION 'listing removal did not reject the listing'; END IF;
  -- The listing row itself is untouched: the seller's Garage and history keep it.
  IF (SELECT status FROM public.marketplace_listings WHERE id = '94300000-0000-0000-0000-000000000001') <> 'active' THEN
    RAISE EXCEPTION 'listing removal rewrote the listing status';
  END IF;
END $$;

-- 3. Retention disposal of a removed listing case must not queue the
--    vehicle's Garage photos for deletion; a removed photo case does.
UPDATE public.moderation_cases
SET retention_expires_at = now() - interval '1 day', retention_basis = 'community_safety'
WHERE entity_type IN ('listing', 'media') AND state = 'closed';

DO $$
DECLARE
  result jsonb;
BEGIN
  result := public.purge_moderation_case((SELECT id FROM public.moderation_cases WHERE entity_type = 'listing' AND entity_id = '94300000-0000-0000-0000-000000000001'));
  IF result->>'outcome' <> 'purged' THEN RAISE EXCEPTION 'listing purge failed: %', result; END IF;
  IF EXISTS (SELECT 1 FROM public.storage_cleanup_jobs WHERE storage_reference = 'https://cdn.example.test/ee-1.jpg') THEN
    RAISE EXCEPTION 'listing purge queued the vehicle photo for deletion';
  END IF;

  result := public.purge_moderation_case((SELECT id FROM public.moderation_cases WHERE entity_type = 'media' AND entity_id = '94200000-0000-0000-0000-000000000001'));
  IF result->>'outcome' <> 'purged' THEN RAISE EXCEPTION 'media purge failed: %', result; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.storage_cleanup_jobs WHERE storage_reference = 'https://cdn.example.test/ee-1.jpg') THEN
    RAISE EXCEPTION 'media purge did not queue the removed photo';
  END IF;
END $$;

-- 4. A member whose profile was removed still sees their own profile so
--    they can fix it; nobody else does.
DO $$
BEGIN
  PERFORM public.submit_extended_moderation_report((SELECT reporter FROM ee), 'profile', (SELECT author FROM ee), 'harassment', 'Abusive display name.', 'ee-profile-report-000000000001');
END $$;
SELECT set_config('test.ee_profile_case', (SELECT id::text FROM public.moderation_cases WHERE entity_type = 'profile' AND entity_id = (SELECT author FROM ee) AND state = 'open'), true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"94000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT public.decide_moderation_case(current_setting('test.ee_profile_case')::uuid, 1, 'remove', 'harassment', 'Display name violates policy.', 'none', 7);
RESET ROLE;
DO $$
BEGIN
  IF public.social_can_view_profile((SELECT outsider FROM ee), (SELECT author FROM ee)) THEN
    RAISE EXCEPTION 'removed profile still visible to others';
  END IF;
  IF NOT public.social_can_view_profile((SELECT author FROM ee), (SELECT author FROM ee)) THEN
    RAISE EXCEPTION 'member lost access to their own removed profile';
  END IF;
END $$;

ROLLBACK;
