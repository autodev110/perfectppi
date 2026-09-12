\set ON_ERROR_STOP on
BEGIN;

-- Plan 25.3: seller-attached inspections and the redacted buyer projection.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('9e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'is-seller@example.test', '', '{}', '{"username":"IsSeller"}', now(), now()),
  ('9e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'is-buyer@example.test', '', '{}', '{"username":"IsBuyer"}', now(), now()),
  ('9e000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'is-tech@example.test', '', '{}', '{"username":"IsTech"}', now(), now());
UPDATE public.profiles SET is_public = true WHERE auth_user_id::text LIKE '9e000000-%';
UPDATE public.profiles SET role = 'technician', display_name = 'Tess Technician' WHERE auth_user_id = '9e000000-0000-0000-0000-000000000003';

CREATE TEMP TABLE isx AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '9e000000-0000-0000-0000-000000000001') AS seller,
  (SELECT id FROM public.profiles WHERE auth_user_id = '9e000000-0000-0000-0000-000000000002') AS buyer,
  (SELECT id FROM public.profiles WHERE auth_user_id = '9e000000-0000-0000-0000-000000000003') AS tech;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '9e000000-0000-0000-0000-000000000100', seller, 2017, 'Mazda', '3', 'public' FROM isx;
INSERT INTO public.marketplace_listings (id, vehicle_id, seller_id, title, asking_price_cents, status)
SELECT '9e000000-0000-0000-0000-000000000200', '9e000000-0000-0000-0000-000000000100', seller, 'Mazda 3 hatch', 1200000, 'active' FROM isx;

-- Seller's completed technician inspection.
INSERT INTO public.ppi_requests (id, vehicle_id, requester_id, assigned_tech_id, whose_car, requester_role, performer_type, ppi_type, status, inspection_scope)
SELECT '9e000000-0000-0000-0000-000000000300', '9e000000-0000-0000-0000-000000000100', seller, tech, 'own', 'selling', 'technician', 'general_tech', 'completed', 'complete' FROM isx;
INSERT INTO public.ppi_submissions (id, ppi_request_id, performer_id, version, is_current, status, submitted_at, completed_at)
SELECT '9e000000-0000-0000-0000-000000000400', '9e000000-0000-0000-0000-000000000300', tech, 1, true, 'completed', now() - interval '40 days', now() - interval '39 days' FROM isx;
INSERT INTO public.ppi_sections (id, ppi_submission_id, section_type, completion_state, notes, sort_order) VALUES
  ('9e000000-0000-0000-0000-000000000500', '9e000000-0000-0000-0000-000000000400', 'vehicle_basics', 'completed', 'Met owner at 12 Elm St, plate 7ABC123', 0),
  ('9e000000-0000-0000-0000-000000000501', '9e000000-0000-0000-0000-000000000400', 'tires_brakes', 'completed', NULL, 1);
INSERT INTO public.ppi_answers (ppi_section_id, prompt, answer_type, answer_value, sort_order) VALUES
  ('9e000000-0000-0000-0000-000000000500', 'Confirm the VIN on the vehicle', 'text', 'JM1BN1V70H1000000', 0),
  ('9e000000-0000-0000-0000-000000000500', 'Current odometer reading (miles)', 'number', '61250', 1),
  ('9e000000-0000-0000-0000-000000000500', 'Title status', 'select', 'Clean', 2),
  ('9e000000-0000-0000-0000-000000000500', 'Any accidents reported on history report?', 'yes_no', 'no', 3),
  ('9e000000-0000-0000-0000-000000000500', 'Additional notes on vehicle basics', 'text', 'Seller phone 555-0100', 4),
  ('9e000000-0000-0000-0000-000000000500', 'Owner name matches title?', 'yes_no', 'yes', 5),
  ('9e000000-0000-0000-0000-000000000501', 'Front tire tread depth (32nds)', 'number', '6', 0),
  ('9e000000-0000-0000-0000-000000000501', 'Brake pad condition', 'select', 'Fair', 1),
  ('9e000000-0000-0000-0000-000000000501', 'Unanswered prompt', 'yes_no', NULL, 2);
INSERT INTO public.ppi_media (ppi_section_id, url, media_type) VALUES
  ('9e000000-0000-0000-0000-000000000501', 'private://ppi/tire.jpg', 'image');

-- A buyer's own request for the same vehicle is not the seller's to share.
INSERT INTO public.ppi_requests (id, vehicle_id, requester_id, whose_car, requester_role, performer_type, ppi_type, status, inspection_scope)
SELECT '9e000000-0000-0000-0000-000000000301', '9e000000-0000-0000-0000-000000000100', buyer, 'other', 'buying', 'technician', 'general_tech', 'completed', 'complete' FROM isx;
INSERT INTO public.ppi_submissions (id, ppi_request_id, performer_id, version, is_current, status, submitted_at, completed_at)
SELECT '9e000000-0000-0000-0000-000000000401', '9e000000-0000-0000-0000-000000000301', tech, 1, true, 'completed', now(), now() FROM isx;

DO $$
DECLARE
  listing uuid := '9e000000-0000-0000-0000-000000000200';
  own_req uuid := '9e000000-0000-0000-0000-000000000300';
  buyer_req uuid := '9e000000-0000-0000-0000-000000000301';
  report jsonb;
  basics jsonb;
  hit boolean;
  row_out public.marketplace_listings;
BEGIN
  -- Attachable: only the seller's own inspection.
  IF (SELECT count(*) FROM public.list_attachable_listing_inspections((SELECT seller FROM isx), listing)) <> 1 THEN
    RAISE EXCEPTION 'exactly one shareable inspection';
  END IF;
  IF EXISTS (SELECT 1 FROM public.list_attachable_listing_inspections((SELECT seller FROM isx), listing) WHERE request_id = buyer_req) THEN
    RAISE EXCEPTION 'another member''s inspection is not shareable';
  END IF;
  IF (SELECT count(*) FROM public.list_attachable_listing_inspections((SELECT buyer FROM isx), listing)) <> 0 THEN
    RAISE EXCEPTION 'non-owners see no options';
  END IF;

  -- Before attaching: the owner previews, buyers see nothing.
  report := public.marketplace_inspection_report((SELECT seller FROM isx), own_req);
  IF report IS NULL THEN RAISE EXCEPTION 'owner preview'; END IF;
  IF public.marketplace_inspection_report((SELECT buyer FROM isx), own_req) IS NOT NULL THEN
    RAISE EXCEPTION 'unattached inspections are private';
  END IF;
  IF public.marketplace_inspection_report(NULL, own_req) IS NOT NULL THEN
    RAISE EXCEPTION 'unattached inspections are private to anonymous viewers';
  END IF;

  -- Redaction rules.
  IF report->>'performed_by' <> 'Tess Technician' OR report->>'scope' <> 'complete' THEN RAISE EXCEPTION 'header: %', report; END IF;
  SELECT s INTO basics FROM jsonb_array_elements(report->'sections') s WHERE s->>'section_type' = 'vehicle_basics';
  IF (basics->>'notes_withheld')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'section notes are withheld'; END IF;
  IF report::text ILIKE '%JM1BN1V70H1000000%' OR report::text ILIKE '%555-0100%' OR report::text ILIKE '%Elm St%' THEN
    RAISE EXCEPTION 'VIN, phone, or address leaked: %', report;
  END IF;
  IF NOT (basics->'withheld' ? 'Confirm the VIN on the vehicle') OR NOT (basics->'withheld' ? 'Additional notes on vehicle basics')
     OR NOT (basics->'withheld' ? 'Owner name matches title?') THEN
    RAISE EXCEPTION 'withheld prompts are listed: %', basics->'withheld';
  END IF;
  IF jsonb_array_length(basics->'items') <> 3 THEN RAISE EXCEPTION 'structured answers published: %', basics->'items'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(basics->'items') i WHERE i->>'prompt' = 'Title status' AND i->>'value' = 'Clean') THEN
    RAISE EXCEPTION 'select answers published';
  END IF;
  IF (report->>'withheld_count')::integer <> 4 OR (report->>'media_count')::integer <> 1 THEN
    RAISE EXCEPTION 'counts: % %', report->>'withheld_count', report->>'media_count';
  END IF;
  IF report ? 'score' OR report ? 'passed' THEN RAISE EXCEPTION 'no pass/fail or score'; END IF;

  -- Attach: only shareable inspections, only by the seller.
  hit := false;
  BEGIN
    PERFORM public.attach_listing_inspection((SELECT seller FROM isx), listing, buyer_req);
  EXCEPTION WHEN check_violation THEN hit := SQLERRM = 'inspection_not_shareable';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'unshareable inspection refused'; END IF;
  hit := false;
  BEGIN
    PERFORM public.attach_listing_inspection((SELECT buyer FROM isx), listing, own_req);
  EXCEPTION WHEN no_data_found THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'only the seller attaches'; END IF;

  IF public.marketplace_listing_matches_filters(listing, '{"inspected": true}') THEN RAISE EXCEPTION 'inspected means shared'; END IF;
  row_out := public.attach_listing_inspection((SELECT seller FROM isx), listing, own_req);
  IF row_out.attached_inspection_id <> own_req OR row_out.inspection_shared_at IS NULL THEN RAISE EXCEPTION 'attach'; END IF;
  IF NOT public.marketplace_listing_matches_filters(listing, '{"inspected": true}') THEN RAISE EXCEPTION 'inspected after sharing'; END IF;

  -- Now buyers and anonymous viewers see the redacted report; blocked viewers do not.
  IF public.marketplace_inspection_report((SELECT buyer FROM isx), own_req) IS NULL THEN RAISE EXCEPTION 'buyer sees the shared report'; END IF;
  IF public.marketplace_inspection_report(NULL, own_req) IS NULL THEN RAISE EXCEPTION 'anonymous sees the shared report'; END IF;
  INSERT INTO public.profile_blocks (blocker_id, blocked_id) SELECT seller, buyer FROM isx;
  IF public.marketplace_inspection_report((SELECT buyer FROM isx), own_req) IS NOT NULL THEN RAISE EXCEPTION 'blocked viewers see nothing'; END IF;
  DELETE FROM public.profile_blocks;

  -- Pausing the listing hides the report again; detaching clears it.
  PERFORM public.set_marketplace_listing_status((SELECT seller FROM isx), listing, 'paused');
  IF public.marketplace_inspection_report((SELECT buyer FROM isx), own_req) IS NOT NULL THEN RAISE EXCEPTION 'hidden listing hides the report'; END IF;
  PERFORM public.set_marketplace_listing_status((SELECT seller FROM isx), listing, 'active');
  row_out := public.attach_listing_inspection((SELECT seller FROM isx), listing, NULL);
  IF row_out.attached_inspection_id IS NOT NULL OR row_out.inspection_shared_at IS NOT NULL THEN RAISE EXCEPTION 'detach'; END IF;
  IF public.marketplace_inspection_report((SELECT buyer FROM isx), own_req) IS NOT NULL THEN RAISE EXCEPTION 'detached report is private again'; END IF;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.marketplace_inspection_report(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.attach_listing_inspection(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'inspection sharing leaked to clients';
  END IF;
END
$$;

ROLLBACK;
