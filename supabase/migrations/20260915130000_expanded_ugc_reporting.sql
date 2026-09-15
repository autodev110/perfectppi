BEGIN;

-- Evidence leaves the protected moderation UI only through the capability-
-- gated export endpoint. Record the export as a distinct immutable event so
-- it can be separated from an ordinary evidence view during an audit.
ALTER TABLE public.moderation_events
  DROP CONSTRAINT IF EXISTS moderation_events_event_type_check;
ALTER TABLE public.moderation_events
  ADD CONSTRAINT moderation_events_event_type_check CHECK (event_type IN (
    'submitted', 'auto_allowed', 'auto_blocked', 'escalated', 'reported',
    'manual_approved', 'manual_rejected', 'legal_hold_applied',
    'user_warned', 'posting_hold_applied', 'appeal_opened', 'appeal_resolved',
    'report_created', 'case_auto_hidden', 'case_claimed', 'case_claim_expired',
    'content_restored', 'content_removed', 'legal_hold_released',
    'appeal_decided', 'enforcement_applied', 'media_restricted', 'evidence_purged',
    'evidence_accessed', 'evidence_exported'
  ));

-- Plan 16.2/16.4: every shipped UGC surface uses one entity vocabulary and
-- one protected case queue. Community post/comment identifiers retain their
-- historical names; the remaining values match the public API codes.
ALTER TABLE public.moderation_items DROP CONSTRAINT IF EXISTS moderation_items_entity_type_check;
ALTER TABLE public.moderation_items ADD CONSTRAINT moderation_items_entity_type_check
  CHECK (entity_type IN (
    'community_post', 'community_comment', 'community_post_media',
    'vehicle_media', 'community_group_image',
    'profile', 'group', 'listing', 'review', 'message', 'media'
  ));
ALTER TABLE public.moderation_reports DROP CONSTRAINT IF EXISTS moderation_reports_entity_type_check;
ALTER TABLE public.moderation_reports ADD CONSTRAINT moderation_reports_entity_type_check
  CHECK (entity_type IN (
    'community_post', 'community_comment',
    'profile', 'group', 'listing', 'review', 'message', 'media'
  ));
ALTER TABLE public.moderation_cases DROP CONSTRAINT IF EXISTS moderation_cases_entity_type_check;
ALTER TABLE public.moderation_cases ADD CONSTRAINT moderation_cases_entity_type_check
  CHECK (entity_type IN (
    'community_post', 'community_comment',
    'profile', 'group', 'listing', 'review', 'message', 'media'
  ));

-- Non-post reports hide only the selected entity for the reporter until a
-- moderator decides the case. This prevents one malicious report from
-- globally erasing a profile, group, listing, review, or conversation item.
CREATE TABLE public.moderation_reporter_hidden_entities (
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('profile', 'group', 'listing', 'review', 'message', 'media')),
  entity_id uuid NOT NULL,
  report_id uuid NOT NULL REFERENCES public.moderation_reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reporter_id, entity_type, entity_id)
);
CREATE INDEX moderation_reporter_hidden_report_idx
  ON public.moderation_reporter_hidden_entities(report_id);
ALTER TABLE public.moderation_reporter_hidden_entities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_reporter_hidden_entities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.moderation_reporter_hidden_entities TO service_role;

CREATE FUNCTION public.submit_extended_moderation_report(
  p_reporter_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_reason_code text,
  p_details text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_author_id uuid;
  v_snapshot jsonb;
  v_media_references jsonb := '[]'::jsonb;
  v_revision_id uuid;
  v_item public.moderation_items%ROWTYPE;
  v_case public.moderation_cases%ROWTYPE;
  v_existing public.moderation_reports%ROWTYPE;
  v_report_id uuid;
  v_priority text;
  v_now timestamptz := now();
BEGIN
  IF p_entity_type NOT IN ('profile', 'group', 'listing', 'review', 'message', 'media') THEN
    RAISE EXCEPTION 'unsupported report entity' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_reason_code NOT IN (
    'spam', 'harassment', 'hate', 'violence', 'sexual_content',
    'personal_information', 'fraud', 'illegal_content',
    'dangerous_vehicle_advice', 'intellectual_property', 'other'
  ) THEN RAISE EXCEPTION 'invalid report reason' USING ERRCODE = 'invalid_parameter_value'; END IF;
  IF p_details IS NOT NULL AND char_length(p_details) > 500 THEN
    RAISE EXCEPTION 'report details are too long' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_reason_code IN ('other', 'intellectual_property')
     AND char_length(COALESCE(trim(p_details), '')) < 10 THEN
    RAISE EXCEPTION 'report details are required for this reason' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 200 THEN
    RAISE EXCEPTION 'invalid idempotency key' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT public.social_profile_is_available(p_reporter_id) OR EXISTS (
    SELECT 1 FROM public.user_enforcement_actions action
    WHERE action.profile_id = p_reporter_id AND action.action_type = 'reporting_hold'
      AND action.starts_at <= v_now AND (action.ends_at IS NULL OR action.ends_at > v_now)
  ) THEN RAISE EXCEPTION 'reporting is unavailable' USING ERRCODE = 'insufficient_privilege'; END IF;

  -- Serialize reports for one target so concurrent callers cannot race the
  -- moderation item/case unique keys or lose a report-count increment.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_entity_type || ':' || p_entity_id::text, 0)
  );

  SELECT * INTO v_existing FROM public.moderation_reports
  WHERE reporter_id = p_reporter_id
    AND (
      idempotency_key = p_idempotency_key
      OR (
        entity_type = p_entity_type AND entity_id = p_entity_id
        AND EXISTS (
          SELECT 1 FROM public.moderation_reporter_hidden_entities hidden
          WHERE hidden.report_id = moderation_reports.id
        )
      )
    )
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.moderation_reporter_hidden_entities (
      reporter_id, entity_type, entity_id, report_id
    ) VALUES (p_reporter_id, p_entity_type, p_entity_id, v_existing.id)
    ON CONFLICT (reporter_id, entity_type, entity_id)
    DO UPDATE SET report_id = EXCLUDED.report_id, created_at = v_now;
    RETURN jsonb_build_object(
      'reportId', v_existing.id, 'caseId', v_existing.case_id,
      'entityType', p_entity_type, 'entityId', p_entity_id,
      'revisionId', v_existing.revision_id, 'caseState',
        (SELECT state FROM public.moderation_cases WHERE id = v_existing.case_id),
      'contentStatus', 'hidden_for_reporter', 'moderationStatus', 'pending_review',
      'hiddenGlobally', false, 'duplicate', true
    );
  END IF;

  -- Resolve both authorship and the reporter's current entitlement before
  -- taking a snapshot. Exact location, full VIN, and unrelated thread data
  -- are deliberately excluded from every snapshot below.
  IF p_entity_type = 'profile' THEN
    SELECT profile.id, jsonb_build_object(
      'entityType', p_entity_type, 'entityId', profile.id,
      'username', profile.username, 'displayName', profile.display_name,
      'bio', profile.bio, 'avatarUrl', profile.avatar_url
    ) INTO v_author_id, v_snapshot
    FROM public.profiles profile
    WHERE profile.id = p_entity_id AND profile.id <> p_reporter_id
      AND public.social_can_view_profile(p_reporter_id, profile.id);
  ELSIF p_entity_type = 'group' THEN
    SELECT group_row.created_by, jsonb_build_object(
      'entityType', p_entity_type, 'entityId', group_row.id,
      'name', group_row.name, 'description', group_row.description,
      'avatarUrl', group_row.avatar_url, 'coverUrl', group_row.cover_url,
      'visibility', group_row.visibility
    ) INTO v_author_id, v_snapshot
    FROM public.community_groups group_row
    WHERE group_row.id = p_entity_id AND group_row.status = 'active'
      AND group_row.created_by IS DISTINCT FROM p_reporter_id
      AND (group_row.visibility = 'public' OR EXISTS (
        SELECT 1 FROM public.community_group_memberships membership
        WHERE membership.group_id = group_row.id AND membership.profile_id = p_reporter_id
          AND membership.status = 'active'
      ));
  ELSIF p_entity_type = 'listing' THEN
    SELECT listing.seller_id, jsonb_build_object(
      'entityType', p_entity_type, 'entityId', listing.id,
      'title', listing.title, 'description', listing.description,
      'askingPriceCents', listing.asking_price_cents, 'location', listing.location,
      'status', listing.status, 'vehicleId', listing.vehicle_id
    ) INTO v_author_id, v_snapshot
    FROM public.marketplace_listings listing
    JOIN public.vehicles vehicle ON vehicle.id = listing.vehicle_id
    WHERE listing.id = p_entity_id AND listing.seller_id <> p_reporter_id
      AND listing.status IN ('active', 'pending') AND vehicle.visibility = 'public';
  ELSIF p_entity_type = 'review' THEN
    SELECT review.reviewer_id, jsonb_build_object(
      'entityType', p_entity_type, 'entityId', review.id,
      'technicianProfileId', review.technician_profile_id,
      'rating', review.rating, 'title', review.title, 'content', review.content,
      'createdAt', review.created_at
    ) INTO v_author_id, v_snapshot
    FROM public.technician_reviews review
    WHERE review.id = p_entity_id AND review.status = 'active'
      AND review.reviewer_id <> p_reporter_id;
  ELSIF p_entity_type = 'message' THEN
    SELECT message.sender_id, jsonb_build_object(
      'entityType', p_entity_type, 'entityId', message.id,
      'conversationId', message.conversation_id, 'senderId', message.sender_id,
      'content', message.content, 'hasAttachment', message.has_attachment,
      'attachmentUrl', message.attachment_url, 'attachmentType', message.attachment_type,
      'createdAt', message.created_at
    ) INTO v_author_id, v_snapshot
    FROM public.messages message
    WHERE message.id = p_entity_id AND message.sender_id <> p_reporter_id
      AND EXISTS (
        SELECT 1 FROM public.conversation_participants participant
        WHERE participant.conversation_id = message.conversation_id
          AND participant.profile_id = p_reporter_id
      );
    IF v_snapshot IS NOT NULL AND (v_snapshot->>'attachmentUrl') IS NOT NULL THEN
      v_media_references := jsonb_build_array(jsonb_build_object(
        'url', v_snapshot->>'attachmentUrl', 'contentType', v_snapshot->>'attachmentType'
      ));
    END IF;
  ELSE
    SELECT vehicle.owner_id, jsonb_build_object(
      'entityType', p_entity_type, 'entityId', media.id,
      'vehicleId', media.vehicle_id, 'mediaType', media.media_type,
      'contentType', media.content_type, 'url', media.url,
      'uploadedAt', media.uploaded_at
    ), jsonb_build_array(jsonb_build_object(
      'url', media.url, 'mediaType', media.media_type, 'contentType', media.content_type
    )) INTO v_author_id, v_snapshot, v_media_references
    FROM public.vehicle_media media
    JOIN public.vehicles vehicle ON vehicle.id = media.vehicle_id
    WHERE media.id = p_entity_id AND vehicle.owner_id <> p_reporter_id
      -- Only media the reporter can currently see is reportable; a photo the
      -- upload scan already holds must not be reachable by id, otherwise a
      -- restore on the report case would lift the scan hold.
      AND media.moderation_status = 'active'
      AND public.social_can_view_vehicle(p_reporter_id, vehicle.id);
  END IF;

  IF v_snapshot IS NULL OR v_author_id IS NULL THEN
    RAISE EXCEPTION 'report is not available' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_entity_type = 'profile' AND COALESCE(v_snapshot->>'avatarUrl', '') <> '' THEN
    v_media_references := jsonb_build_array(jsonb_build_object(
      'url', v_snapshot->>'avatarUrl', 'kind', 'profile_avatar'
    ));
  ELSIF p_entity_type = 'group' THEN
    SELECT COALESCE(jsonb_agg(reference), '[]'::jsonb) INTO v_media_references
    FROM (
      SELECT jsonb_build_object('url', v_snapshot->>'avatarUrl', 'kind', 'group_avatar') AS reference
      WHERE COALESCE(v_snapshot->>'avatarUrl', '') <> ''
      UNION ALL
      SELECT jsonb_build_object('url', v_snapshot->>'coverUrl', 'kind', 'group_cover')
      WHERE COALESCE(v_snapshot->>'coverUrl', '') <> ''
    ) refs;
  ELSIF p_entity_type = 'listing' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'url', media.url, 'mediaType', media.media_type, 'contentType', media.content_type
    ) ORDER BY media.sort_order, media.uploaded_at), '[]'::jsonb)
    INTO v_media_references
    FROM public.marketplace_listings listing
    JOIN public.vehicle_media media ON media.vehicle_id = listing.vehicle_id
    WHERE listing.id = p_entity_id AND media.moderation_status = 'active';
  END IF;
  IF public.social_profiles_are_blocked(p_reporter_id, v_author_id) THEN
    RAISE EXCEPTION 'report is not available' USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.moderation_items item
    WHERE item.entity_type = p_entity_type AND item.entity_id = p_entity_id
      AND item.status IN ('rejected', 'legal_hold')
  ) THEN
    RAISE EXCEPTION 'report is not available' USING ERRCODE = 'no_data_found';
  END IF;
  IF (SELECT count(*) FROM public.moderation_reports
      WHERE reporter_id = p_reporter_id AND created_at >= v_now - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'report rate limit reached' USING ERRCODE = 'program_limit_exceeded';
  END IF;

  v_revision_id := (
    substr(md5(v_snapshot::text), 1, 8) || '-' || substr(md5(v_snapshot::text), 9, 4) || '-' ||
    substr(md5(v_snapshot::text), 13, 4) || '-' || substr(md5(v_snapshot::text), 17, 4) || '-' ||
    substr(md5(v_snapshot::text), 21, 12)
  )::uuid;

  -- After a restore, a changed snapshot is a new reportable revision. An
  -- unchanged retry remains idempotent and re-applies only the reporter's
  -- personal hide without reopening the resolved case.
  SELECT * INTO v_existing FROM public.moderation_reports
  WHERE reporter_id = p_reporter_id AND entity_type = p_entity_type
    AND entity_id = p_entity_id AND revision_id = v_revision_id
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.moderation_reporter_hidden_entities (
      reporter_id, entity_type, entity_id, report_id
    ) VALUES (p_reporter_id, p_entity_type, p_entity_id, v_existing.id)
    ON CONFLICT (reporter_id, entity_type, entity_id)
    DO UPDATE SET report_id = EXCLUDED.report_id, created_at = v_now;
    RETURN jsonb_build_object(
      'reportId', v_existing.id, 'caseId', v_existing.case_id,
      'entityType', p_entity_type, 'entityId', p_entity_id,
      'revisionId', v_existing.revision_id, 'caseState',
        (SELECT state FROM public.moderation_cases WHERE id = v_existing.case_id),
      'contentStatus', 'hidden_for_reporter', 'moderationStatus',
        (SELECT status FROM public.moderation_items WHERE entity_type = p_entity_type AND entity_id = p_entity_id),
      'hiddenGlobally', false, 'duplicate', true
    );
  END IF;
  v_priority := CASE WHEN p_reason_code IN (
    'violence', 'sexual_content', 'personal_information', 'illegal_content'
  ) THEN 'urgent' ELSE 'normal' END;

  SELECT * INTO v_item FROM public.moderation_items
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.moderation_items (
      entity_type, entity_id, author_id, status, risk_level, decision,
      reason_codes, content_preview, model_provider, model_version, report_count
    ) VALUES (
      p_entity_type, p_entity_id, v_author_id, 'pending_review',
      CASE WHEN v_priority = 'urgent' THEN 'high' ELSE 'medium' END,
      'review', ARRAY['user_report:' || p_reason_code], left(v_snapshot::text, 500),
      'user_report', 'perfectppi-moderation-v2', 0
    ) RETURNING * INTO v_item;
  END IF;

  SELECT * INTO v_case FROM public.moderation_cases
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id
    AND revision_id = v_revision_id
    AND state IN ('monitoring', 'open', 'claimed', 'escalated', 'appeal_open')
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.moderation_cases (
      moderation_item_id, entity_type, entity_id, revision_id, state,
      priority, sla_due_at, first_reported_at, last_reported_at
    ) VALUES (
      v_item.id, p_entity_type, p_entity_id, v_revision_id, 'open', v_priority,
      v_now + CASE WHEN v_priority = 'urgent' THEN interval '4 hours' ELSE interval '24 hours' END,
      v_now, v_now
    ) RETURNING * INTO v_case;
    INSERT INTO public.moderation_evidence (
      case_id, revision_id, content_snapshot, media_references, content_sha256
    ) VALUES (
      v_case.id, v_revision_id, v_snapshot, v_media_references,
      encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex')
    );
  ELSE
    UPDATE public.moderation_cases
    SET last_reported_at = v_now,
        priority = CASE WHEN v_priority = 'urgent' THEN 'urgent' ELSE priority END,
        sla_due_at = CASE WHEN v_priority = 'urgent' THEN LEAST(sla_due_at, v_now + interval '4 hours') ELSE sla_due_at END,
        updated_at = v_now
    WHERE id = v_case.id RETURNING * INTO v_case;
  END IF;

  INSERT INTO public.moderation_reports (
    reporter_id, entity_type, entity_id, revision_id, case_id,
    idempotency_key, reason_code, details
  ) VALUES (
    p_reporter_id, p_entity_type, p_entity_id, v_revision_id, v_case.id,
    p_idempotency_key, p_reason_code, NULLIF(trim(p_details), '')
  ) RETURNING id INTO v_report_id;

  INSERT INTO public.moderation_reporter_hidden_entities (
    reporter_id, entity_type, entity_id, report_id
  ) VALUES (p_reporter_id, p_entity_type, p_entity_id, v_report_id)
  ON CONFLICT (reporter_id, entity_type, entity_id)
  DO UPDATE SET report_id = EXCLUDED.report_id, created_at = v_now;

  UPDATE public.moderation_items
  SET status = 'pending_review', decision = 'review',
      risk_level = CASE WHEN v_priority = 'urgent' THEN 'high'
        WHEN risk_level IN ('high', 'critical') THEN risk_level ELSE 'medium' END,
      reason_codes = CASE WHEN ('user_report:' || p_reason_code) = ANY(reason_codes)
        THEN reason_codes ELSE array_append(reason_codes, 'user_report:' || p_reason_code) END,
      report_count = report_count + 1, updated_at = v_now
  WHERE id = v_item.id;

  INSERT INTO public.moderation_events (
    moderation_item_id, case_id, revision_id, actor_type, actor_id,
    event_type, previous_status, next_status, metadata
  ) VALUES (
    v_item.id, v_case.id, v_revision_id, 'user', p_reporter_id,
    'report_created', v_item.status, 'pending_review',
    jsonb_build_object('reasonCode', p_reason_code, 'reportId', v_report_id, 'hiddenGlobally', false)
  );

  RETURN jsonb_build_object(
    'reportId', v_report_id, 'caseId', v_case.id,
    'entityType', p_entity_type, 'entityId', p_entity_id,
    'revisionId', v_revision_id, 'caseState', v_case.state,
    'contentStatus', 'hidden_for_reporter', 'moderationStatus', 'pending_review',
    'hiddenGlobally', false, 'duplicate', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_extended_moderation_report(uuid, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_extended_moderation_report(uuid, text, uuid, text, text, text)
  TO service_role;

-- Profile checks are used by every discovery/search/contact path, so folding
-- reporter-only profile hiding into this canonical predicate closes all of
-- those surfaces without relying on client-side filtering.
CREATE OR REPLACE FUNCTION public.social_can_view_profile(
  p_viewer_id uuid,
  p_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_viewer_id IS NOT NULL
    AND public.social_profile_is_available(p_viewer_id)
    AND public.social_profile_is_available(p_profile_id)
    AND NOT public.social_profiles_are_blocked(p_viewer_id, p_profile_id)
    -- Members always see their own profile so they can correct what a
    -- moderator removed; the hides below apply to every other viewer.
    AND (
      p_viewer_id = p_profile_id
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.moderation_reporter_hidden_entities hidden
          WHERE hidden.reporter_id = p_viewer_id AND hidden.entity_type = 'profile'
            AND hidden.entity_id = p_profile_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_items item
          WHERE item.entity_type = 'profile' AND item.entity_id = p_profile_id
            AND item.status IN ('rejected', 'legal_hold')
        )
      )
    );
$$;

CREATE FUNCTION public.decide_extended_moderation_case(
  p_case_id uuid,
  p_expected_version integer,
  p_decision text,
  p_policy_category text,
  p_rationale text,
  p_enforcement text DEFAULT 'none',
  p_enforcement_days integer DEFAULT 7
)
RETURNS public.moderation_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.get_my_profile_id();
  v_case public.moderation_cases%ROWTYPE;
  v_item public.moderation_items%ROWTYPE;
  v_now timestamptz := now();
  v_next_status text;
  v_resolution text;
  v_action text;
  v_ends_at timestamptz;
BEGIN
  IF p_decision NOT IN ('restore', 'remove', 'escalate') THEN
    RAISE EXCEPTION 'invalid decision' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_enforcement NOT IN ('none', 'warning', 'posting_hold', 'media_hold', 'reporting_hold', 'suspension', 'ban') THEN
    RAISE EXCEPTION 'invalid enforcement' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_decision IN ('restore', 'remove') AND NOT public.moderation_has_capability(v_actor, 'content_decide') THEN
    RAISE EXCEPTION 'moderation capability required: content_decide' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision = 'escalate' AND NOT public.moderation_has_capability(v_actor, 'legal_hold_review') THEN
    RAISE EXCEPTION 'moderation capability required: legal_hold_review' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_enforcement <> 'none' AND NOT public.moderation_has_capability(v_actor, 'account_enforce') THEN
    RAISE EXCEPTION 'moderation capability required: account_enforce' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision = 'remove' AND (
    p_policy_category IS NULL OR p_policy_category NOT IN (
      'spam', 'harassment', 'hate', 'violence', 'sexual_content',
      'personal_information', 'fraud', 'illegal_content',
      'dangerous_vehicle_advice', 'intellectual_property', 'other'
    )
  ) THEN
    RAISE EXCEPTION 'removal requires a policy category' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_decision <> 'restore' AND char_length(trim(COALESCE(p_rationale, ''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_enforcement IN ('posting_hold', 'media_hold', 'reporting_hold', 'suspension')
     AND (p_enforcement_days IS NULL OR p_enforcement_days NOT BETWEEN 1 AND 365) THEN
    RAISE EXCEPTION 'enforcement duration must be 1-365 days' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT * INTO v_case FROM public.moderation_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND OR v_case.entity_type NOT IN ('profile', 'group', 'listing', 'review', 'message', 'media') THEN
    RAISE EXCEPTION 'case not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_case.state = 'closed' THEN RAISE EXCEPTION 'case_already_closed' USING ERRCODE = 'invalid_parameter_value'; END IF;
  IF v_case.state = 'escalated' AND NOT public.moderation_has_capability(v_actor, 'legal_hold_review') THEN
    RAISE EXCEPTION 'moderation capability required: legal_hold_review' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_case.decision_version <> p_expected_version THEN RAISE EXCEPTION 'case_version_conflict' USING ERRCODE = 'serialization_failure'; END IF;
  IF v_case.assigned_moderator_id IS NOT NULL AND v_case.assigned_moderator_id <> v_actor
     AND v_case.claim_expires_at > v_now THEN
    RAISE EXCEPTION 'case_claimed_by_other' USING ERRCODE = 'lock_not_available';
  END IF;
  SELECT * INTO v_item FROM public.moderation_items WHERE id = v_case.moderation_item_id FOR UPDATE;
  v_next_status := CASE p_decision WHEN 'restore' THEN 'active' WHEN 'remove' THEN 'rejected' ELSE 'legal_hold' END;
  v_resolution := CASE
    WHEN p_decision = 'escalate' THEN NULL
    WHEN p_decision = 'restore' AND v_case.state = 'appeal_open' THEN 'appeal_overturned'
    WHEN p_decision = 'restore' THEN 'no_violation_restored'
    WHEN v_case.state = 'appeal_open' THEN 'appeal_upheld'
    ELSE 'violation_removed' END;

  UPDATE public.moderation_items SET
    status = v_next_status,
    decision = CASE p_decision WHEN 'restore' THEN 'allow' WHEN 'remove' THEN 'block' ELSE 'legal_hold' END,
    risk_level = CASE p_decision WHEN 'restore' THEN 'none' WHEN 'remove' THEN 'high' ELSE 'critical' END,
    reason_codes = CASE WHEN p_decision = 'remove' AND NOT ('policy:' || p_policy_category) = ANY(reason_codes)
      THEN array_append(reason_codes, 'policy:' || p_policy_category) ELSE reason_codes END,
    decided_by = v_actor, decided_at = v_now, updated_at = v_now
  WHERE id = v_item.id;
  IF v_case.entity_type = 'media' THEN
    UPDATE public.vehicle_media
    SET moderation_status = v_next_status,
        moderation_reason = CASE WHEN p_decision = 'remove' THEN p_policy_category ELSE moderation_reason END,
        moderation_checked_at = v_now,
        moderation_version = 'perfectppi-moderation-v2'
    WHERE id = v_case.entity_id;
  END IF;
  IF p_decision = 'restore' THEN
    DELETE FROM public.moderation_reporter_hidden_entities hidden
    USING public.moderation_reports report
    WHERE hidden.report_id = report.id AND report.case_id = v_case.id;
  END IF;
  UPDATE public.moderation_cases SET
    state = CASE WHEN p_decision = 'escalate' THEN 'escalated' ELSE 'closed' END,
    resolution = v_resolution,
    closed_at = CASE WHEN p_decision = 'escalate' THEN NULL ELSE v_now END,
    legal_hold = p_decision = 'escalate' OR legal_hold,
    decision_version = decision_version + 1,
    assigned_moderator_id = v_actor,
    claimed_at = COALESCE(claimed_at, v_now),
    claim_expires_at = CASE WHEN p_decision = 'escalate' THEN v_now + interval '15 minutes' ELSE claim_expires_at END,
    updated_at = v_now
  WHERE id = v_case.id RETURNING * INTO v_case;
  INSERT INTO public.moderation_events (
    moderation_item_id, case_id, revision_id, actor_type, actor_id, event_type,
    previous_status, next_status, notes, metadata
  ) VALUES (
    v_item.id, v_case.id, v_case.revision_id, 'admin', v_actor,
    CASE p_decision WHEN 'restore' THEN 'content_restored' WHEN 'remove' THEN 'content_removed' ELSE 'legal_hold_applied' END,
    v_item.status, v_next_status, NULLIF(trim(p_rationale), ''),
    jsonb_build_object('policyCategory', p_policy_category, 'decisionVersion', v_case.decision_version,
      'resolution', v_resolution)
  );
  IF p_enforcement <> 'none' AND v_item.author_id IS NOT NULL THEN
    v_action := CASE p_enforcement WHEN 'posting_hold' THEN 'temporary_posting_hold'
      WHEN 'media_hold' THEN 'media_upload_hold' ELSE p_enforcement END;
    v_ends_at := CASE WHEN p_enforcement IN ('warning', 'ban') THEN NULL
      ELSE v_now + make_interval(days => p_enforcement_days) END;
    INSERT INTO public.user_enforcement_actions (
      profile_id, action_type, reason_code, related_moderation_item_id, ends_at, created_by
    ) VALUES (v_item.author_id, v_action, COALESCE(p_policy_category, 'community_guidelines'), v_item.id, v_ends_at, v_actor);
  END IF;
  RETURN v_case;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_extended_moderation_case(uuid, integer, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;

-- Keep the public decision signature stable for every client while dispatching
-- non-post cases to their entity-specific visibility semantics.
CREATE OR REPLACE FUNCTION public.decide_moderation_case(
  p_case_id uuid,
  p_expected_version integer,
  p_decision text,
  p_policy_category text,
  p_rationale text,
  p_enforcement text DEFAULT 'none',
  p_enforcement_days integer DEFAULT 7
)
RETURNS public.moderation_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_type text;
BEGIN
  IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'case and expected version are required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('restore', 'remove', 'escalate') THEN
    RAISE EXCEPTION 'invalid decision' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_enforcement IS NULL OR p_enforcement NOT IN ('none', 'warning', 'posting_hold', 'media_hold', 'reporting_hold', 'suspension', 'ban') THEN
    RAISE EXCEPTION 'invalid enforcement' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_enforcement <> 'none' AND p_decision <> 'remove' THEN
    RAISE EXCEPTION 'account enforcement requires a removal decision' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT entity_type INTO v_type FROM public.moderation_cases WHERE id = p_case_id;
  IF v_type IN ('community_post', 'community_comment') THEN
    RETURN public.decide_moderation_case_internal(
      p_case_id, p_expected_version, p_decision, p_policy_category,
      p_rationale, p_enforcement, p_enforcement_days
    );
  END IF;
  RETURN public.decide_extended_moderation_case(
    p_case_id, p_expected_version, p_decision, p_policy_category,
    p_rationale, p_enforcement, p_enforcement_days
  );
END;
$$;
REVOKE ALL ON FUNCTION public.decide_moderation_case(uuid, integer, text, text, text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_moderation_case(uuid, integer, text, text, text, text, integer)
  TO authenticated, service_role;

-- Listing removal already consults moderation obligations. Use the canonical
-- entity code while retaining the old spelling for any pre-migration rows.
CREATE OR REPLACE FUNCTION public.marketplace_listing_has_obligations(p_listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.ppi_requests request WHERE request.marketplace_listing_id = p_listing_id)
      OR EXISTS (SELECT 1 FROM public.conversations conversation WHERE conversation.marketplace_listing_id = p_listing_id)
      OR EXISTS (
        SELECT 1 FROM public.marketplace_listing_saves saved
        JOIN public.marketplace_listings listing ON listing.id = saved.listing_id
        WHERE saved.listing_id = p_listing_id AND saved.profile_id <> listing.seller_id
      )
      OR EXISTS (SELECT 1 FROM public.community_posts post WHERE post.marketplace_listing_id = p_listing_id)
      OR EXISTS (
        SELECT 1 FROM public.moderation_reports report
        WHERE report.entity_type IN ('listing', 'marketplace_listing')
          AND report.entity_id = p_listing_id
      );
$$;

-- The pre-existing retention function assumes every non-post case is a
-- comment. Preserve it for the two legacy entity types and dispatch expanded
-- UGC cases to a purge path that removes evidence without touching an
-- unrelated comment that happens to share the same UUID.
ALTER FUNCTION public.purge_moderation_case(uuid)
  RENAME TO purge_community_moderation_case_internal;

CREATE FUNCTION public.purge_moderation_case(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case public.moderation_cases%ROWTYPE;
  v_content_removed boolean;
  v_references text[] := ARRAY[]::text[];
  v_reports integer := 0;
  v_evidence integer := 0;
  v_now timestamptz := now();
  v_reason text := NULL;
BEGIN
  SELECT * INTO v_case FROM public.moderation_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'skipped', 'reason', 'not_found'); END IF;
  IF v_case.entity_type IN ('community_post', 'community_comment') THEN
    RETURN public.purge_community_moderation_case_internal(p_case_id);
  END IF;
  IF v_case.entity_type NOT IN ('profile', 'group', 'listing', 'review', 'message', 'media') THEN
    RETURN jsonb_build_object('outcome', 'skipped', 'reason', 'unsupported_entity_type');
  END IF;

  IF v_case.disposition_state = 'purged' THEN v_reason := 'already_purged';
  ELSIF v_case.state <> 'closed' THEN v_reason := 'case_open';
  ELSIF v_case.legal_hold OR v_case.resolution = 'legal_escalation' THEN v_reason := 'legal_hold';
  ELSIF v_case.retention_expires_at IS NULL THEN v_reason := 'no_approved_retention_period';
  ELSIF v_case.retention_expires_at > v_now THEN v_reason := 'retention_period_active';
  ELSIF EXISTS (
    SELECT 1 FROM public.moderation_appeals appeal
    WHERE appeal.case_id = v_case.id AND appeal.status = 'pending'
  ) THEN v_reason := 'appeal_open';
  ELSIF EXISTS (
    SELECT 1 FROM public.moderation_cases sibling
    WHERE sibling.entity_type = v_case.entity_type AND sibling.entity_id = v_case.entity_id
      AND sibling.id <> v_case.id AND sibling.disposition_state <> 'purged'
      AND (
        sibling.state <> 'closed' OR sibling.legal_hold
        OR sibling.resolution = 'legal_escalation'
        OR sibling.retention_expires_at IS NULL OR sibling.retention_expires_at > v_now
        OR EXISTS (
          SELECT 1 FROM public.moderation_appeals appeal
          WHERE appeal.case_id = sibling.id AND appeal.status = 'pending'
        )
      )
  ) THEN v_reason := 'linked_case_retention_active';
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'skipped', 'reason', v_reason);
  END IF;

  v_content_removed := v_case.resolution IN ('violation_removed', 'appeal_upheld');
  -- Stored objects are disposed of only when they belong exclusively to the
  -- removed entity (a reported photo, a message attachment). Listing, group,
  -- and profile evidence references objects that live rows still display —
  -- a removed listing does not remove the vehicle's Garage photos — so those
  -- references stay until their own entity is removed.
  IF v_content_removed THEN
    IF v_case.entity_type IN ('media', 'message') THEN
      SELECT COALESCE(array_agg(DISTINCT reference), ARRAY[]::text[])
      INTO v_references
      FROM (
        SELECT ref->>'url' AS reference
        FROM public.moderation_evidence evidence
        CROSS JOIN LATERAL jsonb_array_elements(evidence.media_references) ref
        WHERE evidence.case_id = v_case.id AND ref->>'url' IS NOT NULL
      ) refs;

      INSERT INTO public.storage_cleanup_jobs (storage_reference, reason, status, next_attempt_at)
      SELECT reference, 'retention_purge', 'pending', v_now
      FROM unnest(v_references) reference
      WHERE reference ~ '^(https://|r2-private:///)'
      ON CONFLICT (storage_reference) DO UPDATE
        SET status = 'pending', reason = 'retention_purge', next_attempt_at = v_now, completed_at = NULL;
    END IF;

    UPDATE public.moderation_items
    SET content_preview = NULL, raw_result = '{}'::jsonb, evidence_reference = NULL
    WHERE id = v_case.moderation_item_id;
  END IF;

  DELETE FROM public.moderation_reports WHERE case_id = v_case.id;
  GET DIAGNOSTICS v_reports = ROW_COUNT;
  DELETE FROM public.moderation_evidence WHERE case_id = v_case.id;
  GET DIAGNOSTICS v_evidence = ROW_COUNT;
  UPDATE public.moderation_cases
  SET disposition_state = 'purged', updated_at = v_now
  WHERE id = v_case.id;

  INSERT INTO public.moderation_events (
    moderation_item_id, case_id, revision_id, actor_type, event_type,
    previous_status, next_status, metadata
  ) VALUES (
    v_case.moderation_item_id, v_case.id, v_case.revision_id, 'system', 'evidence_purged',
    'closed', 'closed',
    jsonb_build_object(
      'contentRemoved', v_content_removed,
      'objectsQueued', COALESCE(array_length(v_references, 1), 0),
      'reportsDeleted', v_reports, 'evidenceDeleted', v_evidence,
      'basis', v_case.retention_basis
    )
  );
  INSERT INTO public.retention_purge_events (entity_type, entity_id, case_id, basis, summary)
  VALUES (
    'moderation_case', v_case.id, v_case.id, v_case.retention_basis,
    jsonb_build_object(
      'entityType', v_case.entity_type, 'entityId', v_case.entity_id,
      'contentRemoved', v_content_removed, 'contentRowsDeleted', 0,
      'objectsQueued', COALESCE(array_length(v_references, 1), 0),
      'reportsDeleted', v_reports, 'evidenceDeleted', v_evidence
    )
  );
  RETURN jsonb_build_object(
    'outcome', 'purged', 'contentRemoved', v_content_removed,
    'contentRowsDeleted', 0,
    'objectsQueued', COALESCE(array_length(v_references, 1), 0),
    'reportsDeleted', v_reports, 'evidenceDeleted', v_evidence
  );
END;
$$;
REVOKE ALL ON FUNCTION public.purge_community_moderation_case_internal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.purge_moderation_case(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_moderation_case(uuid) TO service_role;

COMMIT;
