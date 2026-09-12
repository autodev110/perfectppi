BEGIN;

-- ============================================================================
-- Plan 25.3: inspection-native trust.
--
-- A seller attaches, explicitly, one inspection they are authorized to share
-- (they requested it, for the listed vehicle, and it was submitted or
-- completed). Buyers see a redacted projection of that inspection: scope,
-- date, who performed it, and the structured answers (yes/no, choice,
-- number). Free-text answers, technician section notes, media, the VIN and
-- anything that names people, plates, addresses or phones are withheld —
-- listed by prompt so the owner can preview exactly what is and is not
-- published. Nothing is reduced to a pass/fail or a single score.
-- ============================================================================

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS attached_inspection_id uuid REFERENCES public.ppi_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inspection_shared_at timestamptz;

CREATE INDEX IF NOT EXISTS marketplace_listings_attached_inspection_idx
  ON public.marketplace_listings(attached_inspection_id)
  WHERE attached_inspection_id IS NOT NULL;

-- Which inspections may this seller share on this listing?
CREATE OR REPLACE FUNCTION public.list_attachable_listing_inspections(
  p_actor_profile_id uuid,
  p_listing_id uuid
)
RETURNS TABLE (
  request_id uuid,
  scope public.inspection_scope,
  inspected_at timestamptz,
  performer_type public.performer_type,
  performed_by text,
  request_status public.ppi_request_status,
  attached boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    request.id,
    request.inspection_scope,
    COALESCE(submission.completed_at, submission.submitted_at),
    request.performer_type,
    CASE
      WHEN request.performer_type = 'self' THEN 'Owner self-inspection'
      WHEN performer.is_public THEN COALESCE(performer.display_name, performer.username, 'PerfectPPI technician')
      ELSE 'PerfectPPI technician'
    END,
    request.status,
    listing.attached_inspection_id = request.id
  FROM public.marketplace_listings listing
  JOIN public.ppi_requests request
    ON request.vehicle_id = listing.vehicle_id
   AND request.requester_id = listing.seller_id
   AND request.status IN ('submitted'::public.ppi_request_status, 'completed'::public.ppi_request_status)
  JOIN public.ppi_submissions submission
    ON submission.ppi_request_id = request.id
   AND submission.is_current
   AND submission.status IN ('submitted'::public.submission_status, 'completed'::public.submission_status)
  LEFT JOIN public.profiles performer ON performer.id = submission.performer_id
  WHERE listing.id = p_listing_id
    AND listing.seller_id = p_actor_profile_id
    AND COALESCE(submission.completed_at, submission.submitted_at) IS NOT NULL
  ORDER BY COALESCE(submission.completed_at, submission.submitted_at) DESC;
$$;

-- Attach (or detach with NULL). Only an attachable inspection is accepted.
CREATE OR REPLACE FUNCTION public.attach_listing_inspection(
  p_actor_profile_id uuid,
  p_listing_id uuid,
  p_request_id uuid
)
RETURNS public.marketplace_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_listing public.marketplace_listings;
BEGIN
  SELECT * INTO v_listing FROM public.marketplace_listings
  WHERE id = p_listing_id AND seller_id = p_actor_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_listing.status = 'removed'::public.listing_status THEN
    RAISE EXCEPTION 'listing_removed' USING ERRCODE = 'check_violation';
  END IF;
  IF p_request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.list_attachable_listing_inspections(p_actor_profile_id, p_listing_id) a
    WHERE a.request_id = p_request_id
  ) THEN
    RAISE EXCEPTION 'inspection_not_shareable' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.marketplace_listings
  SET attached_inspection_id = p_request_id,
      inspection_shared_at = CASE WHEN p_request_id IS NULL THEN NULL ELSE now() END
  WHERE id = p_listing_id
  RETURNING * INTO v_listing;
  RETURN v_listing;
END;
$$;

-- Prompts that can name a person, a plate, an address, or the VIN are never
-- published even when structured.
CREATE OR REPLACE FUNCTION public.inspection_prompt_is_sensitive(p_prompt text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_prompt ~* '(\mvin\M|plate|address|phone|e-?mail|owner''?s? name|seller''?s? name|contact)';
$$;

-- The redacted projection. NULL when the viewer may not see it: the viewer
-- must be the requester (owner preview) or the inspection must be attached
-- to a listing the viewer can see.
CREATE OR REPLACE FUNCTION public.marketplace_inspection_report(
  p_viewer_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.ppi_requests;
  v_submission public.ppi_submissions;
  v_performer public.profiles;
  v_authorized boolean := false;
  v_sections jsonb;
  v_withheld integer;
  v_media integer;
BEGIN
  SELECT * INTO v_request FROM public.ppi_requests WHERE id = p_request_id;
  IF NOT FOUND OR v_request.status NOT IN ('submitted'::public.ppi_request_status, 'completed'::public.ppi_request_status) THEN
    RETURN NULL;
  END IF;

  IF p_viewer_id IS NOT NULL AND p_viewer_id = v_request.requester_id THEN
    v_authorized := true;
  ELSE
    v_authorized := EXISTS (
      SELECT 1
      FROM public.marketplace_listings listing
      WHERE listing.attached_inspection_id = p_request_id
        AND listing.id IN (SELECT listing_id FROM public.marketplace_visible_listing_ids(p_viewer_id, ARRAY[listing.id]))
    );
  END IF;
  IF NOT v_authorized THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_submission FROM public.ppi_submissions
  WHERE ppi_request_id = p_request_id AND is_current
    AND status IN ('submitted'::public.submission_status, 'completed'::public.submission_status)
  ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_performer FROM public.profiles WHERE id = v_submission.performer_id;

  WITH answers AS (
    SELECT
      section.id AS section_id,
      answer.prompt,
      answer.answer_type,
      answer.answer_value,
      answer.sort_order,
      (
        answer.answer_type = 'text'::public.answer_type
        OR public.inspection_prompt_is_sensitive(answer.prompt)
      ) AS withheld
    FROM public.ppi_sections section
    JOIN public.ppi_answers answer ON answer.ppi_section_id = section.id
    WHERE section.ppi_submission_id = v_submission.id
      AND answer.answer_value IS NOT NULL
      AND btrim(answer.answer_value) <> ''
  ),
  section_rows AS (
    SELECT
      section.id,
      section.section_type,
      section.completion_state,
      section.sort_order,
      (section.notes IS NOT NULL AND btrim(section.notes) <> '') AS notes_withheld,
      (SELECT count(*) FROM public.ppi_media media WHERE media.ppi_section_id = section.id) AS media_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('prompt', a.prompt, 'answer_type', a.answer_type, 'value', a.answer_value) ORDER BY a.sort_order)
        FROM answers a WHERE a.section_id = section.id AND NOT a.withheld
      ), '[]'::jsonb) AS items,
      COALESCE((
        SELECT jsonb_agg(a.prompt ORDER BY a.sort_order)
        FROM answers a WHERE a.section_id = section.id AND a.withheld
      ), '[]'::jsonb) AS withheld
    FROM public.ppi_sections section
    WHERE section.ppi_submission_id = v_submission.id
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'section_type', s.section_type,
      'completion_state', s.completion_state,
      'items', s.items,
      'withheld', s.withheld,
      'notes_withheld', s.notes_withheld,
      'media_count', s.media_count
    ) ORDER BY s.sort_order), '[]'::jsonb),
    COALESCE(sum(jsonb_array_length(s.withheld) + CASE WHEN s.notes_withheld THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(sum(s.media_count), 0)::integer
  INTO v_sections, v_withheld, v_media
  FROM section_rows s;

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'scope', COALESCE(v_request.inspection_scope, 'complete'::public.inspection_scope),
    'inspected_at', COALESCE(v_submission.completed_at, v_submission.submitted_at),
    'performer_kind', CASE WHEN v_request.performer_type = 'self' THEN 'self' ELSE 'technician' END,
    'performed_by', CASE
      WHEN v_request.performer_type = 'self' THEN 'Owner self-inspection'
      WHEN v_performer.is_public THEN COALESCE(v_performer.display_name, v_performer.username, 'PerfectPPI technician')
      ELSE 'PerfectPPI technician'
    END,
    'sections', v_sections,
    'withheld_count', v_withheld,
    'media_count', v_media
  );
END;
$$;

-- Saved-search "inspected" now means the seller shared one.
CREATE OR REPLACE FUNCTION public.marketplace_listing_matches_filters(p_listing_id uuid, p_filters jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.marketplace_listings listing
    JOIN public.vehicles vehicle ON vehicle.id = listing.vehicle_id
    WHERE listing.id = p_listing_id
      AND listing.status = 'active'
      AND (
        NULLIF(btrim(p_filters->>'q'), '') IS NULL
        OR concat_ws(' ', listing.title, listing.location, vehicle.year::text, vehicle.make, vehicle.model, vehicle.trim)
           ILIKE '%' || replace(replace(replace(btrim(p_filters->>'q'), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
      AND (NULLIF(btrim(p_filters->>'make'), '') IS NULL OR lower(vehicle.make) = lower(btrim(p_filters->>'make')))
      AND (NULLIF(btrim(p_filters->>'model'), '') IS NULL OR vehicle.model ILIKE '%' || btrim(p_filters->>'model') || '%')
      AND (COALESCE(jsonb_typeof(p_filters->'minYear'), 'null') <> 'number' OR vehicle.year >= (p_filters->>'minYear')::integer)
      AND (COALESCE(jsonb_typeof(p_filters->'maxYear'), 'null') <> 'number' OR vehicle.year <= (p_filters->>'maxYear')::integer)
      AND (COALESCE(jsonb_typeof(p_filters->'maxPrice'), 'null') <> 'number' OR listing.asking_price_cents <= (p_filters->>'maxPrice')::numeric * 100)
      AND (COALESCE(jsonb_typeof(p_filters->'maxMileage'), 'null') <> 'number' OR (vehicle.mileage IS NOT NULL AND vehicle.mileage <= (p_filters->>'maxMileage')::integer))
      AND (NULLIF(btrim(p_filters->>'transmission'), '') IS NULL OR vehicle.transmission ILIKE '%' || btrim(p_filters->>'transmission') || '%')
      AND (NULLIF(btrim(p_filters->>'drivetrain'), '') IS NULL OR vehicle.drivetrain ILIKE '%' || btrim(p_filters->>'drivetrain') || '%')
      AND (NULLIF(btrim(p_filters->>'bodyStyle'), '') IS NULL OR vehicle.body_style ILIKE '%' || btrim(p_filters->>'bodyStyle') || '%')
      AND (NULLIF(btrim(p_filters->>'region'), '') IS NULL OR listing.location ILIKE '%' || btrim(p_filters->>'region') || '%')
      AND (
        COALESCE((p_filters->>'inspected')::boolean, false) = false
        OR listing.attached_inspection_id IS NOT NULL
      )
      AND (
        NULLIF(btrim(p_filters->>'sellerType'), '') IS NULL
        OR (p_filters->>'sellerType' = 'technician') = EXISTS (
          SELECT 1 FROM public.technician_profiles technician WHERE technician.profile_id = listing.seller_id
        )
      )
  );
$$;

-- Existing listings keep the badge they had: the seller's latest shareable
-- inspection becomes the attached one.
UPDATE public.marketplace_listings listing
SET attached_inspection_id = pick.request_id,
    inspection_shared_at = now()
FROM (
  SELECT DISTINCT ON (l.id) l.id AS listing_id, a.request_id
  FROM public.marketplace_listings l
  CROSS JOIN LATERAL public.list_attachable_listing_inspections(l.seller_id, l.id) a
  WHERE l.attached_inspection_id IS NULL
    AND l.status IN ('active'::public.listing_status, 'pending'::public.listing_status, 'paused'::public.listing_status)
  ORDER BY l.id, a.inspected_at DESC
) pick
WHERE listing.id = pick.listing_id;

REVOKE ALL ON FUNCTION public.list_attachable_listing_inspections(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_listing_inspection(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_inspection_report(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inspection_prompt_is_sensitive(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_attachable_listing_inspections(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_listing_inspection(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_inspection_report(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.inspection_prompt_is_sensitive(text) TO anon, authenticated, service_role;

COMMIT;
