BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Audience narrowing is a privacy action, not an edit.
--
-- set_own_social_privacy() bulk-narrows every public post to friends when a
-- profile goes private. The previous revision trigger treated any audience
-- change as an edit and raised for hidden/archived/rejected posts, so a member
-- with one reported or archived public post could never switch to private.
-- Narrowing public -> friends is now always allowed and never rotates the
-- active revision, which also keeps an open case bound to the revision the
-- reporter actually saw. Broadening and content changes remain edits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_community_post_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
  v_is_edit boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.active_revision_id := COALESCE(NEW.active_revision_id, gen_random_uuid());
    RETURN NEW;
  END IF;

  v_is_edit := NEW.content IS DISTINCT FROM OLD.content
    OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
    OR NEW.marketplace_listing_id IS DISTINCT FROM OLD.marketplace_listing_id
    OR (
      NEW.audience IS DISTINCT FROM OLD.audience
      AND NOT (OLD.audience = 'public' AND NEW.audience = 'friends')
    );

  IF NEW.active_revision_id IS DISTINCT FROM OLD.active_revision_id AND NOT v_is_edit THEN
    RAISE EXCEPTION 'active revision is managed by the revision trigger';
  END IF;

  IF v_is_edit THEN
    IF OLD.status <> 'active' OR OLD.moderation_status <> 'active' THEN
      RAISE EXCEPTION 'content under review or removal cannot be edited';
    END IF;
    SELECT revision_number + 1 INTO v_revision_number
    FROM public.community_post_revisions
    WHERE id = OLD.active_revision_id;
    IF v_revision_number IS NULL THEN
      RAISE EXCEPTION 'active post revision is unavailable';
    END IF;
    NEW.active_revision_id := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. NULL-safe admin gates.
--
-- get_my_role() now returns NULL for a pending (username-less) account. Any
-- guard written as `get_my_role() <> 'admin'` evaluates to NULL for such an
-- account and silently passes. Two gates had that shape: the is_developer
-- self-grant guard (a pending OAuth account could flip its own developer flag
-- through the RLS-permitted own-row update) and admin_correct_username(), which
-- is executable by every authenticated user and would have let a pending
-- account rename any claimed member.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_developer_grant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_developer THEN
      RAISE EXCEPTION 'is_developer cannot be self-granted';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_developer IS DISTINCT FROM OLD.is_developer
     AND public.get_my_role() IS DISTINCT FROM 'admin'
  THEN
    RAISE EXCEPTION 'is_developer cannot be self-granted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_correct_username(
  p_profile_id uuid,
  p_username text,
  p_reason text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_profile_id uuid := public.get_my_profile_id();
  previous_profile public.profiles%ROWTYPE;
  updated_profile public.profiles%ROWTYPE;
BEGIN
  IF actor_profile_id IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF char_length(trim(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A correction reason between 10 and 500 characters is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO previous_profile
  FROM public.profiles
  WHERE id = p_profile_id
  FOR UPDATE;
  IF NOT FOUND OR previous_profile.username_state <> 'claimed' THEN
    RAISE EXCEPTION 'Profile is not eligible for correction' USING ERRCODE = 'P0002';
  END IF;

  updated_profile := public.set_profile_username_internal(
    p_profile_id, p_username, 'admin_correction'
  );

  INSERT INTO public.username_correction_events (
    actor_id, profile_id, previous_username, new_username, reason
  ) VALUES (
    actor_profile_id, p_profile_id, previous_profile.username,
    updated_profile.username, trim(p_reason)
  );

  RETURN updated_profile;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Complete the launch reason-code set (plan section 16.2).
-- ---------------------------------------------------------------------------
ALTER TABLE public.moderation_reports
  DROP CONSTRAINT IF EXISTS moderation_reports_reason_code_check;
ALTER TABLE public.moderation_reports
  ADD CONSTRAINT moderation_reports_reason_code_check CHECK (reason_code IN (
    'spam', 'harassment', 'hate', 'violence', 'sexual_content',
    'personal_information', 'fraud', 'illegal_content',
    'dangerous_vehicle_advice', 'intellectual_property', 'other'
  ));

-- ---------------------------------------------------------------------------
-- 4. Report transaction: accept the full reason set, require details for
--    intellectual-property reports, reset the SLA clock when a monitoring case
--    escalates to open, snapshot the live audience the reporter saw, and return
--    the stable payload the clients are specified to consume.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_moderation_report(
  p_reporter_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_revision_id uuid,
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
  v_content text;
  v_content_status text;
  v_moderation_status text;
  v_active_revision_id uuid;
  v_post_id uuid;
  v_live_audience public.community_post_audience;
  v_item public.moderation_items%ROWTYPE;
  v_case public.moderation_cases%ROWTYPE;
  v_report_id uuid;
  v_existing_report public.moderation_reports%ROWTYPE;
  v_existing_case_state text;
  v_previous_restored boolean := false;
  v_should_hide boolean := true;
  v_report_count integer;
  v_snapshot jsonb;
  v_media_references jsonb := '[]'::jsonb;
  v_priority text;
  v_next_case_state text;
  v_now timestamptz := now();
BEGIN
  IF p_entity_type NOT IN ('community_post', 'community_comment') THEN
    RAISE EXCEPTION 'unsupported report entity';
  END IF;
  IF p_reason_code NOT IN (
    'spam', 'harassment', 'hate', 'violence', 'sexual_content',
    'personal_information', 'fraud', 'illegal_content',
    'dangerous_vehicle_advice', 'intellectual_property', 'other'
  ) THEN RAISE EXCEPTION 'invalid report reason'; END IF;
  IF p_details IS NOT NULL AND char_length(p_details) > 500 THEN
    RAISE EXCEPTION 'report details are too long';
  END IF;
  IF p_reason_code IN ('other', 'intellectual_property')
     AND char_length(COALESCE(trim(p_details), '')) < 10 THEN
    RAISE EXCEPTION 'report details are required for this reason';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 200 THEN
    RAISE EXCEPTION 'invalid idempotency key';
  END IF;

  SELECT * INTO v_existing_report
  FROM public.moderation_reports
  WHERE reporter_id = p_reporter_id
    AND (idempotency_key = p_idempotency_key OR (
      entity_type = p_entity_type AND entity_id = p_entity_id AND revision_id = p_revision_id
    ))
  ORDER BY created_at
  LIMIT 1;
  IF FOUND THEN
    IF p_entity_type = 'community_post' THEN
      SELECT status::text, moderation_status
      INTO v_content_status, v_moderation_status
      FROM public.community_posts WHERE id = p_entity_id;
    ELSE
      SELECT status::text, moderation_status
      INTO v_content_status, v_moderation_status
      FROM public.community_comments WHERE id = p_entity_id;
    END IF;
    SELECT state INTO v_existing_case_state
    FROM public.moderation_cases WHERE id = v_existing_report.case_id;
    RETURN jsonb_build_object(
      'reportId', v_existing_report.id,
      'caseId', v_existing_report.case_id,
      'entityType', p_entity_type,
      'entityId', p_entity_id,
      'revisionId', v_existing_report.revision_id,
      'caseState', v_existing_case_state,
      'contentStatus', v_content_status,
      'moderationStatus', v_moderation_status,
      'hiddenGlobally', v_content_status = 'hidden',
      'duplicate', true
    );
  END IF;

  IF NOT public.social_profile_is_available(p_reporter_id) OR EXISTS (
    SELECT 1 FROM public.user_enforcement_actions action
    WHERE action.profile_id = p_reporter_id
      AND action.action_type = 'reporting_hold'
      AND action.starts_at <= v_now
      AND (action.ends_at IS NULL OR action.ends_at > v_now)
  ) THEN RAISE EXCEPTION 'reporting is unavailable'; END IF;

  IF p_entity_type = 'community_post' THEN
    SELECT author_id, content, status::text, moderation_status, active_revision_id, audience
    INTO v_author_id, v_content, v_content_status, v_moderation_status, v_active_revision_id, v_live_audience
    FROM public.community_posts WHERE id = p_entity_id FOR UPDATE;
  ELSE
    SELECT author_id, content, status::text, moderation_status, active_revision_id, post_id
    INTO v_author_id, v_content, v_content_status, v_moderation_status, v_active_revision_id, v_post_id
    FROM public.community_comments WHERE id = p_entity_id FOR UPDATE;
  END IF;

  IF v_author_id IS NULL OR v_author_id = p_reporter_id OR v_active_revision_id <> p_revision_id THEN
    RAISE EXCEPTION 'report is not available';
  END IF;
  IF public.social_profiles_are_blocked(p_reporter_id, v_author_id) THEN
    RAISE EXCEPTION 'report is not available';
  END IF;

  SELECT * INTO v_case
  FROM public.moderation_cases
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id
    AND revision_id = p_revision_id
    AND state IN ('monitoring', 'open', 'claimed', 'escalated', 'appeal_open')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_content_status = 'active' AND v_moderation_status = 'active' THEN
    IF p_entity_type = 'community_post'
       AND NOT public.social_can_view_community_post(p_reporter_id, p_entity_id, true) THEN
      RAISE EXCEPTION 'report is not available';
    END IF;
    IF p_entity_type = 'community_comment'
       AND NOT public.social_can_view_community_post(p_reporter_id, v_post_id, true) THEN
      RAISE EXCEPTION 'report is not available';
    END IF;
  ELSIF v_case.id IS NULL OR v_content_status = 'archived'
      OR v_moderation_status IN ('rejected', 'legal_hold') THEN
    RAISE EXCEPTION 'report is not available';
  END IF;

  IF (SELECT count(*) FROM public.moderation_reports
      WHERE reporter_id = p_reporter_id AND created_at >= v_now - interval '1 hour') >= 10
     OR (SELECT count(*) FROM public.moderation_reports
      WHERE reporter_id = p_reporter_id AND created_at >= v_now - interval '24 hours') >= 30 THEN
    RAISE EXCEPTION 'report rate limit exceeded';
  END IF;

  SELECT * INTO v_item FROM public.moderation_items
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.moderation_items (
      entity_type, entity_id, author_id, status, risk_level, decision,
      reason_codes, content_preview, model_provider, model_version, report_count
    ) VALUES (
      p_entity_type, p_entity_id, v_author_id, 'active', 'none', 'allow',
      '{}', left(v_content, 500), 'user_report', 'perfectppi-moderation-v2', 0
    ) RETURNING * INTO v_item;
  END IF;

  v_priority := CASE WHEN p_reason_code IN (
    'violence', 'sexual_content', 'personal_information', 'illegal_content'
  ) THEN 'urgent' ELSE 'normal' END;

  IF v_case.id IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.moderation_cases prior
      WHERE prior.entity_type = p_entity_type AND prior.entity_id = p_entity_id
        AND prior.revision_id = p_revision_id AND prior.state = 'closed'
        AND prior.resolution IN ('no_violation_restored', 'appeal_overturned')
        AND prior.first_reported_at IS NOT NULL
    ) INTO v_previous_restored;
    v_should_hide := NOT v_previous_restored OR v_priority = 'urgent';

    INSERT INTO public.moderation_cases (
      moderation_item_id, entity_type, entity_id, revision_id, state,
      priority, sla_due_at, first_reported_at, last_reported_at
    ) VALUES (
      v_item.id, p_entity_type, p_entity_id, p_revision_id,
      CASE WHEN v_should_hide THEN 'open' ELSE 'monitoring' END,
      v_priority,
      v_now + CASE WHEN v_priority = 'urgent' THEN interval '4 hours' ELSE interval '24 hours' END,
      v_now, v_now
    ) RETURNING * INTO v_case;

    IF p_entity_type = 'community_post' THEN
      SELECT jsonb_build_object(
        'entityType', p_entity_type, 'entityId', p_entity_id, 'revisionId', revision.id,
        'revisionNumber', revision.revision_number, 'content', revision.content,
        'audience', revision.audience, 'audienceAtReport', v_live_audience,
        'vehicleId', revision.vehicle_id,
        'marketplaceListingId', revision.marketplace_listing_id,
        'authorId', revision.author_id, 'createdAt', revision.created_at
      ) INTO v_snapshot
      FROM public.community_post_revisions revision WHERE revision.id = p_revision_id;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', media.id, 'url', media.url, 'mediaType', media.media_type,
        'contentType', media.content_type, 'moderationStatus', media.moderation_status
      ) ORDER BY media.sort_order), '[]'::jsonb)
      INTO v_media_references
      FROM public.community_post_media media WHERE media.post_id = p_entity_id;
    ELSE
      SELECT jsonb_build_object(
        'entityType', p_entity_type, 'entityId', p_entity_id, 'revisionId', revision.id,
        'revisionNumber', revision.revision_number, 'content', revision.content,
        'authorId', revision.author_id, 'createdAt', revision.created_at
      ) INTO v_snapshot
      FROM public.community_comment_revisions revision WHERE revision.id = p_revision_id;
    END IF;
    IF v_snapshot IS NULL THEN RAISE EXCEPTION 'revision evidence is unavailable'; END IF;

    INSERT INTO public.moderation_evidence (
      case_id, revision_id, content_snapshot, media_references, content_sha256
    ) VALUES (
      v_case.id, p_revision_id, v_snapshot, v_media_references,
      encode(extensions.digest(v_content, 'sha256'), 'hex')
    );
  END IF;

  INSERT INTO public.moderation_reports (
    reporter_id, entity_type, entity_id, revision_id, case_id,
    idempotency_key, reason_code, details
  ) VALUES (
    p_reporter_id, p_entity_type, p_entity_id, p_revision_id, v_case.id,
    p_idempotency_key, p_reason_code, p_details
  ) RETURNING id INTO v_report_id;

  SELECT count(*) INTO v_report_count
  FROM public.moderation_reports
  WHERE case_id = v_case.id
    AND created_at >= v_now - interval '7 days';
  IF v_case.state = 'monitoring' THEN
    v_should_hide := v_priority = 'urgent' OR v_report_count >= 3;
  END IF;

  -- A monitoring case that finally hides starts its review clock now, not from
  -- the first low-severity report days earlier.
  UPDATE public.moderation_cases
  SET state = CASE WHEN v_should_hide AND state = 'monitoring' THEN 'open' ELSE state END,
      priority = CASE WHEN v_priority = 'urgent' THEN 'urgent' ELSE priority END,
      sla_due_at = CASE
        WHEN v_should_hide AND state = 'monitoring'
          THEN v_now + CASE WHEN v_priority = 'urgent' THEN interval '4 hours' ELSE interval '24 hours' END
        WHEN v_priority = 'urgent' AND priority <> 'urgent'
          THEN LEAST(sla_due_at, v_now + interval '4 hours')
        ELSE sla_due_at END,
      last_reported_at = v_now,
      updated_at = v_now
  WHERE id = v_case.id
  RETURNING state INTO v_next_case_state;

  UPDATE public.moderation_items
  SET status = CASE WHEN v_should_hide THEN 'pending_review' ELSE status END,
      decision = CASE WHEN v_should_hide THEN 'review' ELSE decision END,
      risk_level = CASE WHEN v_priority = 'urgent' THEN 'high'
        WHEN v_should_hide THEN 'medium' ELSE risk_level END,
      reason_codes = CASE WHEN ('user_report:' || p_reason_code) = ANY(reason_codes)
        THEN reason_codes ELSE array_append(reason_codes, 'user_report:' || p_reason_code) END,
      report_count = report_count + 1,
      content_preview = COALESCE(content_preview, left(v_content, 500))
  WHERE id = v_item.id;

  IF v_should_hide THEN
    IF p_entity_type = 'community_post' THEN
      UPDATE public.community_posts
      SET status = 'hidden', moderation_status = 'pending_review',
          moderation_reason = CASE WHEN v_moderation_status = 'active'
            THEN p_reason_code ELSE moderation_reason END,
          moderation_checked_at = v_now,
          moderation_version = 'perfectppi-moderation-v2'
      WHERE id = p_entity_id;
    ELSE
      UPDATE public.community_comments
      SET status = 'hidden', moderation_status = 'pending_review',
          moderation_reason = CASE WHEN v_moderation_status = 'active'
            THEN p_reason_code ELSE moderation_reason END,
          moderation_checked_at = v_now,
          moderation_version = 'perfectppi-moderation-v2'
      WHERE id = p_entity_id;
    END IF;
  END IF;

  INSERT INTO public.moderation_events (
    moderation_item_id, case_id, revision_id, actor_type, actor_id,
    event_type, previous_status, next_status, metadata
  ) VALUES (
    v_item.id, v_case.id, p_revision_id, 'user', p_reporter_id,
    'report_created', v_moderation_status,
    CASE WHEN v_should_hide THEN 'pending_review' ELSE v_moderation_status END,
    jsonb_build_object('reasonCode', p_reason_code, 'reportId', v_report_id)
  );
  IF v_should_hide AND v_moderation_status = 'active' THEN
    INSERT INTO public.moderation_events (
      moderation_item_id, case_id, revision_id, actor_type, event_type,
      previous_status, next_status
    ) VALUES (
      v_item.id, v_case.id, p_revision_id, 'system', 'case_auto_hidden',
      v_moderation_status, 'pending_review'
    );
  END IF;

  IF v_should_hide THEN
    INSERT INTO public.moderation_outbox (case_id, event_type, payload, idempotency_key)
    VALUES (
      v_case.id,
      CASE WHEN v_priority = 'urgent' THEN 'case_escalated' ELSE 'case_opened' END,
      jsonb_build_object('caseId', v_case.id, 'priority', v_priority),
      v_case.id::text || ':opened'
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'reportId', v_report_id,
    'caseId', v_case.id,
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'revisionId', p_revision_id,
    'caseState', v_next_case_state,
    'contentStatus', CASE WHEN v_should_hide THEN 'hidden' ELSE v_content_status END,
    'moderationStatus', CASE WHEN v_should_hide THEN 'pending_review' ELSE v_moderation_status END,
    'hiddenGlobally', v_should_hide,
    'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_moderation_report(uuid, text, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_moderation_report(uuid, text, uuid, uuid, text, text, text)
  TO service_role;

COMMIT;
