\set ON_ERROR_STOP on
BEGIN;

-- Build progression: stages, labor/cost, entry photos (approved media only),
-- private documents, owner-only totals.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bs-owner@example.test', '', '{}', '{"username":"BsOwner"}', now(), now()),
  ('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bs-other@example.test', '', '{}', '{"username":"BsOther"}', now(), now());

CREATE TEMP TABLE bs AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b0000000-0000-0000-0000-000000000001') AS owner,
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b0000000-0000-0000-0000-000000000002') AS other;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT 'b0000000-0000-0000-0000-000000000100', owner, 2015, 'Subaru', 'WRX', 'public' FROM bs;
INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT 'b0000000-0000-0000-0000-000000000101', other, 2018, 'Honda', 'Civic', 'public' FROM bs;

INSERT INTO public.vehicle_media (id, vehicle_id, url, media_type, is_primary, sort_order, moderation_status)
VALUES
  ('b0000000-0000-0000-0000-000000000300', 'b0000000-0000-0000-0000-000000000100', 'https://cdn.example.test/wrx-1.jpg', 'image', true, 0, 'active'),
  ('b0000000-0000-0000-0000-000000000301', 'b0000000-0000-0000-0000-000000000100', 'https://cdn.example.test/wrx-2.jpg', 'image', false, 1, 'pending_review'),
  ('b0000000-0000-0000-0000-000000000302', 'b0000000-0000-0000-0000-000000000101', 'https://cdn.example.test/civic-1.jpg', 'image', true, 0, 'active');

DO $$
DECLARE
  v_owner uuid := (SELECT owner FROM bs);
  v_other uuid := (SELECT other FROM bs);
  wrx uuid := 'b0000000-0000-0000-0000-000000000100';
  civic uuid := 'b0000000-0000-0000-0000-000000000101';
  stage1 uuid; stage2 uuid; entry1 uuid; entry2 uuid;
  hit boolean;
  t record;
BEGIN
  INSERT INTO public.vehicle_build_stages (vehicle_id, owner_id, title, position, status, is_public)
  VALUES (wrx, v_owner, 'Stage 1: Bolt-ons', 0, 'in_progress', true) RETURNING id INTO stage1;
  INSERT INTO public.vehicle_build_stages (vehicle_id, owner_id, title, position, status, completed_on)
  VALUES (wrx, v_owner, 'Stage 2: Turbo', 1, 'complete', current_date) RETURNING id INTO stage2;

  -- A complete stage needs its completion date (and vice versa).
  hit := false;
  BEGIN
    INSERT INTO public.vehicle_build_stages (vehicle_id, owner_id, title, status) VALUES (wrx, v_owner, 'Bad', 'complete');
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'complete stage without completed_on accepted'; END IF;

  -- Stage owner must own the vehicle.
  hit := false;
  BEGIN
    INSERT INTO public.vehicle_build_stages (vehicle_id, owner_id, title) VALUES (wrx, v_other, 'Hijack');
  EXCEPTION WHEN foreign_key_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'stage owner guard missing'; END IF;

  INSERT INTO public.vehicle_build_entries (vehicle_id, owner_id, category, title, stage_id, cost_cents, labor_cents, labor_hours, before_spec, after_spec, status, is_public)
  VALUES (wrx, v_owner, 'Intake', 'Cold air intake', stage1, 35000, 12000, 1.5, 'Stock airbox', 'Cobb SF intake', 'installed', true) RETURNING id INTO entry1;
  INSERT INTO public.vehicle_build_entries (vehicle_id, owner_id, category, title, stage_id, cost_cents, status)
  VALUES (wrx, v_owner, 'Exhaust', 'Cat-back', stage1, 90000, 'planned') RETURNING id INTO entry2;

  -- An entry cannot point at another vehicle's stage.
  hit := false;
  BEGIN
    INSERT INTO public.vehicle_build_entries (vehicle_id, owner_id, category, title, stage_id)
    VALUES (civic, v_other, 'Wheels', 'Enkei', stage1);
  EXCEPTION WHEN foreign_key_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'cross-vehicle stage link accepted'; END IF;

  -- Photos: only this vehicle's approved media.
  INSERT INTO public.vehicle_build_entry_photos (entry_id, media_id) VALUES (entry1, 'b0000000-0000-0000-0000-000000000300');
  hit := false;
  BEGIN
    INSERT INTO public.vehicle_build_entry_photos (entry_id, media_id) VALUES (entry1, 'b0000000-0000-0000-0000-000000000301');
  EXCEPTION WHEN check_violation THEN hit := SQLERRM = 'build_photo_not_approved';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'unapproved media attached to a build entry'; END IF;
  hit := false;
  BEGIN
    INSERT INTO public.vehicle_build_entry_photos (entry_id, media_id) VALUES (entry1, 'b0000000-0000-0000-0000-000000000302');
  EXCEPTION WHEN foreign_key_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'another vehicle''s media attached to a build entry'; END IF;

  -- Losing approval detaches the photo.
  UPDATE public.vehicle_media SET moderation_status = 'rejected' WHERE id = 'b0000000-0000-0000-0000-000000000300';
  IF EXISTS (SELECT 1 FROM public.vehicle_build_entry_photos WHERE media_id = 'b0000000-0000-0000-0000-000000000300') THEN
    RAISE EXCEPTION 'rejected media stayed attached to a build entry';
  END IF;

  -- Documents: private storage reference shape, must hang off an entry or stage of the same vehicle.
  INSERT INTO public.vehicle_build_documents (vehicle_id, owner_id, entry_id, kind, title, storage_reference, content_type, size_bytes)
  VALUES (wrx, v_owner, entry1, 'receipt', 'Intake receipt', 'r2-private:///vehicle_document/' || v_owner || '/' || wrx || '/1-abc.pdf', 'application/pdf', 1234);
  hit := false;
  BEGIN
    INSERT INTO public.vehicle_build_documents (vehicle_id, owner_id, kind, title, storage_reference, content_type, size_bytes)
    VALUES (wrx, v_owner, 'receipt', 'Loose', 'r2-private:///vehicle_document/' || v_owner || '/' || wrx || '/2-abc.pdf', 'application/pdf', 1234);
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'document without entry or stage accepted'; END IF;
  hit := false;
  BEGIN
    INSERT INTO public.vehicle_build_documents (vehicle_id, owner_id, entry_id, kind, title, storage_reference, content_type, size_bytes)
    VALUES (wrx, v_owner, entry1, 'receipt', 'Public url', 'https://cdn.example.test/receipt.pdf', 'application/pdf', 1234);
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'non-private document reference accepted'; END IF;

  -- Totals are per stage and owner-only.
  SELECT * INTO t FROM public.vehicle_build_stage_totals(v_owner, wrx) WHERE stage_id = stage1;
  IF t.entry_count <> 2 OR t.installed_count <> 1 OR t.parts_cents <> 125000 OR t.labor_cents <> 12000 OR t.labor_hours <> 1.5 THEN
    RAISE EXCEPTION 'stage totals wrong: %', t;
  END IF;
  IF EXISTS (SELECT 1 FROM public.vehicle_build_stage_totals(v_other, wrx)) THEN
    RAISE EXCEPTION 'totals leaked to a non-owner';
  END IF;

  -- Deleting a stage keeps its entries (unstaged).
  DELETE FROM public.vehicle_build_stages WHERE id = stage2;
  IF (SELECT stage_id FROM public.vehicle_build_entries WHERE id = entry2) IS DISTINCT FROM stage1 THEN
    RAISE EXCEPTION 'entry lost its stage unexpectedly';
  END IF;
  DELETE FROM public.vehicle_build_stages WHERE id = stage1;
  IF (SELECT count(*) FROM public.vehicle_build_entries WHERE id IN (entry1, entry2)) <> 2
     OR (SELECT stage_id FROM public.vehicle_build_entries WHERE id = entry1) IS NOT NULL THEN
    RAISE EXCEPTION 'deleting a stage must unstage, not delete, its entries';
  END IF;
END
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.vehicle_build_stages', 'SELECT')
     OR has_table_privilege('authenticated', 'public.vehicle_build_documents', 'SELECT')
     OR has_function_privilege('authenticated', 'public.vehicle_build_stage_totals(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'build progression tables leaked to clients';
  END IF;
END
$$;

ROLLBACK;
