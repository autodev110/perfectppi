BEGIN;

CREATE INDEX community_post_revisions_author_edit_time_idx
  ON public.community_post_revisions(author_id, created_at DESC) WHERE revision_number > 1;
CREATE INDEX community_comment_revisions_author_edit_time_idx
  ON public.community_comment_revisions(author_id, created_at DESC) WHERE revision_number > 1;

-- Recheck parent availability under a lock and enforce blocks server-side.
CREATE OR REPLACE FUNCTION public.guard_community_comment_reply()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_parent public.community_comments%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- The FK's ON DELETE SET NULL (a nested referential-integrity trigger)
    -- is the only permitted change; a direct detach or re-parent is refused.
    IF NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id
       AND NOT (NEW.parent_comment_id IS NULL AND pg_trigger_depth() > 1) THEN
      RAISE EXCEPTION 'comment_reply_immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_parent
  FROM public.community_comments parent
  WHERE parent.id = NEW.parent_comment_id FOR SHARE;
  IF NOT FOUND OR v_parent.post_id <> NEW.post_id THEN
    RAISE EXCEPTION 'comment_reply_parent_unavailable' USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.parent_comment_id IS NOT NULL THEN
    RAISE EXCEPTION 'comment_reply_depth' USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.status <> 'active' OR v_parent.moderation_status <> 'active'
     OR public.social_profiles_are_blocked(NEW.author_id, v_parent.author_id) THEN
    RAISE EXCEPTION 'comment_reply_parent_unavailable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


-- Hold the content lock through both the new revision and its moderation
-- audit. A report cannot land between publication and an auto-allow upsert.
CREATE FUNCTION public.publish_community_author_edit(
  p_actor_profile_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_content text,
  p_moderation jsonb,
  p_groups_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.community_posts%ROWTYPE;
  v_comment public.community_comments%ROWTYPE;
  v_revision uuid;
  v_previous_content text;
  v_item uuid;
  v_edited_at timestamptz;
  v_post_id uuid;
BEGIN
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('community_post', 'community_comment')
     OR p_moderation->>'decision' IS DISTINCT FROM 'allow'
     OR COALESCE(p_moderation->>'riskLevel', '') NOT IN ('none', 'low', 'medium', 'high', 'critical')
     OR COALESCE(p_moderation->>'provider', '') = ''
     OR COALESCE(p_moderation->>'modelVersion', '') = ''
     OR jsonb_typeof(p_moderation->'reasonCodes') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'approved moderation result required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT public.social_profile_is_available(p_actor_profile_id) OR EXISTS (
    SELECT 1 FROM public.user_enforcement_actions action
    WHERE action.profile_id = p_actor_profile_id
      AND action.action_type IN ('temporary_posting_hold', 'suspension', 'ban')
      AND action.starts_at <= now() AND (action.ends_at IS NULL OR action.ends_at > now())
  ) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_entity_type = 'community_post' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('author-post-edit:' || p_actor_profile_id::text, 0));
    SELECT * INTO v_post FROM public.community_posts WHERE id = p_entity_id FOR UPDATE;
    IF NOT FOUND OR v_post.author_id <> p_actor_profile_id THEN
      RAISE EXCEPTION 'post_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    v_previous_content := v_post.content;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('author-comment-edit:' || p_actor_profile_id::text, 0));
    -- Match reporting's comment-then-post lock order.
    SELECT * INTO v_comment FROM public.community_comments WHERE id = p_entity_id FOR UPDATE;
    IF NOT FOUND OR v_comment.author_id <> p_actor_profile_id THEN
      RAISE EXCEPTION 'comment_not_found' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT * INTO v_post FROM public.community_posts WHERE id = v_comment.post_id FOR SHARE;
    v_previous_content := v_comment.content;
  END IF;
  IF v_previous_content IS DISTINCT FROM p_content AND (
    (p_entity_type = 'community_post' AND (SELECT count(*) FROM public.community_post_revisions
      WHERE author_id = p_actor_profile_id AND revision_number > 1 AND created_at >= now() - interval '10 minutes') >= 20)
    OR (p_entity_type = 'community_comment' AND (SELECT count(*) FROM public.community_comment_revisions
      WHERE author_id = p_actor_profile_id AND revision_number > 1 AND created_at >= now() - interval '10 minutes') >= 20)
  ) THEN
    RAISE EXCEPTION 'edit rate limit reached' USING ERRCODE = 'program_limit_exceeded';
  END IF;
  IF NOT public.social_can_view_community_post(p_actor_profile_id, v_post.id, true) THEN
    RAISE EXCEPTION '%_not_editable', CASE p_entity_type WHEN 'community_post' THEN 'post' ELSE 'comment' END
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_post.group_id IS NOT NULL AND (
    NOT COALESCE(p_groups_enabled, false)
    OR NOT EXISTS (
      SELECT 1 FROM public.community_group_memberships member
      JOIN public.community_groups group_row ON group_row.id = member.group_id
      WHERE member.group_id = v_post.group_id AND member.profile_id = p_actor_profile_id
        AND member.status = 'active' AND group_row.status = 'active'
        AND (member.posting_restricted_until IS NULL OR member.posting_restricted_until <= now())
        AND (p_entity_type = 'community_comment' OR group_row.posting_policy = 'members' OR member.role <> 'member')
    )
  ) THEN
    RAISE EXCEPTION '%_not_editable', CASE p_entity_type WHEN 'community_post' THEN 'post' ELSE 'comment' END
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.community_entities_with_open_cases('community_post', ARRAY[v_post.id])
  ) THEN
    RAISE EXCEPTION '%_under_review', CASE p_entity_type WHEN 'community_post' THEN 'post' ELSE 'comment' END
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_entity_type = 'community_post' THEN
    v_post := public.edit_community_post(p_actor_profile_id, p_entity_id, p_content);
    v_revision := v_post.active_revision_id;
    v_edited_at := v_post.edited_at;
  ELSE
    v_comment := public.edit_community_comment(p_actor_profile_id, p_entity_id, p_content);
    v_revision := v_comment.active_revision_id;
    v_edited_at := v_comment.edited_at;
    v_post_id := v_comment.post_id;
  END IF;
  IF v_previous_content IS DISTINCT FROM p_content THEN
    INSERT INTO public.moderation_items (
      entity_type, entity_id, author_id, status, risk_level, decision,
      reason_codes, content_preview, model_provider, model_name, model_version, raw_result, decided_at
    ) VALUES (
      p_entity_type, p_entity_id, p_actor_profile_id, 'active', p_moderation->>'riskLevel', 'allow',
      ARRAY(SELECT jsonb_array_elements_text(p_moderation->'reasonCodes')), left(p_content, 500),
      p_moderation->>'provider', p_moderation->>'modelName', p_moderation->>'modelVersion',
      COALESCE(p_moderation->'rawResult', '{}'::jsonb), now()
    ) ON CONFLICT (entity_type, entity_id) DO UPDATE SET
      status = 'active', decision = 'allow', risk_level = EXCLUDED.risk_level,
      reason_codes = EXCLUDED.reason_codes, content_preview = EXCLUDED.content_preview,
      model_provider = EXCLUDED.model_provider, model_name = EXCLUDED.model_name,
      model_version = EXCLUDED.model_version, raw_result = EXCLUDED.raw_result,
      decided_at = now(), decided_by = NULL, updated_at = now()
    RETURNING id INTO v_item;
    INSERT INTO public.moderation_events (
      moderation_item_id, revision_id, actor_type, event_type, previous_status, next_status, metadata
    ) VALUES (v_item, v_revision, 'system', 'auto_allowed', 'active', 'active',
      jsonb_build_object('authorEdit', true, 'reasonCodes', p_moderation->'reasonCodes'));
  END IF;
  RETURN jsonb_build_object('id', p_entity_id, 'content', p_content,
    'edited_at', v_edited_at, 'post_id', v_post_id);
END;
$$;
REVOKE ALL ON FUNCTION public.publish_community_author_edit(uuid, text, uuid, text, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_community_author_edit(uuid, text, uuid, text, jsonb, boolean) TO service_role;

-- An active monitoring case must freeze author removal too (auto-hide off).
ALTER FUNCTION public.remove_own_community_comment(uuid, uuid) RENAME TO remove_own_community_comment_internal;
CREATE FUNCTION public.remove_own_community_comment(p_actor_profile_id uuid, p_comment_id uuid)
RETURNS public.community_comments LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.community_comments WHERE id = p_comment_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.community_entities_with_open_cases('community_comment', ARRAY[p_comment_id])) THEN
    RAISE EXCEPTION 'comment_under_review' USING ERRCODE = 'check_violation';
  END IF;
  RETURN public.remove_own_community_comment_internal(p_actor_profile_id, p_comment_id);
END;
$$;
REVOKE ALL ON FUNCTION public.remove_own_community_comment_internal(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.remove_own_community_comment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_own_community_comment(uuid, uuid) TO service_role;

-- Hide Helpful in the API as well as the UI for second-level responses.
DELETE FROM public.community_comment_helpful_reactions reaction
USING public.community_comments comment
WHERE reaction.comment_id = comment.id AND comment.parent_comment_id IS NOT NULL;
ALTER FUNCTION public.set_community_comment_helpful(uuid, uuid, boolean) RENAME TO set_community_comment_helpful_internal;
CREATE FUNCTION public.set_community_comment_helpful(p_actor_profile_id uuid, p_comment_id uuid, p_helpful boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.community_comments WHERE id = p_comment_id AND parent_comment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'answer unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.set_community_comment_helpful_internal(p_actor_profile_id, p_comment_id, p_helpful);
END;
$$;
REVOKE ALL ON FUNCTION public.set_community_comment_helpful_internal(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_community_comment_helpful(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_comment_helpful(uuid, uuid, boolean) TO service_role;

-- A parent author may since have left a private group or lost access to a
-- friends-only post. Reply notifications may not reveal the new activity.
CREATE FUNCTION public.guard_comment_reply_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.notification_allowed(NEW.user_id, NEW.type, 'in_app')
     OR NOT public.social_can_view_community_post(NEW.user_id, (NEW.data->>'post_id')::uuid, true)
     OR NOT public.social_can_view_profile(NEW.user_id, (NEW.data->>'latest_actor_id')::uuid) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notifications_guard_comment_reply
  BEFORE INSERT OR UPDATE OF data, title, body ON public.notifications
  FOR EACH ROW WHEN (NEW.type = 'comment_reply') EXECUTE FUNCTION public.guard_comment_reply_notification();
REVOKE ALL ON FUNCTION public.guard_comment_reply_notification() FROM PUBLIC, anon, authenticated;

-- Explicit edit revision IDs must not be rebound to an older closed case.
CREATE OR REPLACE FUNCTION public.attach_moderation_case_context()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_case uuid; v_revision uuid;
BEGIN
  IF NEW.case_id IS NULL THEN
    SELECT moderation_case.id, moderation_case.revision_id INTO v_case, v_revision
    FROM public.moderation_cases moderation_case
    WHERE moderation_case.moderation_item_id = NEW.moderation_item_id
      AND (NEW.revision_id IS NULL OR moderation_case.revision_id = NEW.revision_id)
    ORDER BY moderation_case.created_at DESC LIMIT 1;
    NEW.case_id := v_case;
    NEW.revision_id := COALESCE(NEW.revision_id, v_revision);
  END IF;
  RETURN NEW;
END;
$$;

-- Client observations are not trusted unlimited inserts. Serialize per
-- account/event, then enforce bounded submission rates without new payloads.
CREATE FUNCTION public.record_client_product_event(p_profile_id uuid, p_event_name text)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_limit integer; v_window interval;
BEGIN
  IF p_event_name IS NULL OR p_event_name NOT IN ('invite_shared', 'app_session_started', 'app_crash_detected') THEN
    RAISE EXCEPTION 'unknown client event' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('client-event:' || p_profile_id::text || ':' || p_event_name, 0));
  v_limit := CASE p_event_name WHEN 'app_session_started' THEN 1 WHEN 'app_crash_detected' THEN 10 ELSE 60 END;
  v_window := CASE p_event_name WHEN 'app_session_started' THEN interval '5 minutes'
    WHEN 'app_crash_detected' THEN interval '1 day' ELSE interval '1 hour' END;
  IF (SELECT count(*) FROM public.product_analytics_events
      WHERE profile_id = p_profile_id AND event_name = p_event_name AND occurred_at >= now() - v_window) >= v_limit THEN
    RAISE EXCEPTION 'client event rate limit reached' USING ERRCODE = 'program_limit_exceeded';
  END IF;
  RETURN public.record_product_analytics_event(p_profile_id, p_event_name, 'profile', NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.record_client_product_event(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_client_product_event(uuid, text) TO service_role;

-- Match funnel events to the same opaque resource and honor current opt-outs.
-- Delayed crash diagnostics cannot establish a crash-free session percentage.
CREATE OR REPLACE FUNCTION public.get_product_engagement_signals(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH bounds AS (
    SELECT
      now() - make_interval(days => LEAST(GREATEST(p_days, 1), 90)) AS starts_at,
      LEAST(GREATEST(p_days, 1), 90) AS window_days
  ),
  window_events AS (
    SELECT event.event_name, event.profile_id, event.occurred_at, event.dedupe_hash
    FROM public.product_analytics_events event
    CROSS JOIN bounds
    LEFT JOIN public.product_analytics_preferences preference ON preference.profile_id = event.profile_id
    WHERE event.occurred_at >= bounds.starts_at
      AND COALESCE(preference.enabled, true)
  ),
  -- Aggregate engagement observations.
  discovery AS (
    SELECT DISTINCT profile_id
    FROM window_events
    WHERE event_name = 'group_detail_viewed' AND dedupe_hash IS NOT NULL
  ),
  discovery_joins AS (
    SELECT count(*) AS viewers,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM window_events viewed
          JOIN window_events joined ON joined.profile_id = viewed.profile_id
            AND joined.dedupe_hash = viewed.dedupe_hash
            AND joined.event_name = 'group_joined'
            AND joined.occurred_at >= viewed.occurred_at
          WHERE viewed.event_name = 'group_detail_viewed'
            AND viewed.profile_id = discovery.profile_id
        )
      ) AS joiners
    FROM discovery
  ),
  -- Aggregate engagement observations.
  uploads AS (
    SELECT
      count(*) AS reserved,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM window_events attached
        WHERE attached.event_name = 'media_upload_attached'
          AND attached.profile_id = reserved.profile_id
          AND attached.dedupe_hash = reserved.dedupe_hash
          AND attached.occurred_at >= reserved.occurred_at
      )) AS attached
    FROM window_events reserved
    WHERE reserved.event_name = 'media_upload_reserved' AND reserved.dedupe_hash IS NOT NULL
  ),
  -- Aggregate engagement observations.
  contact AS (
    SELECT
      count(*) FILTER (WHERE event_name = 'unwanted_contact_reported') AS reports,
      count(DISTINCT profile_id) FILTER (WHERE event_name = 'unwanted_contact_reported') AS reporting_users,
      count(*) FILTER (WHERE event_name = 'blocked_contact_attempt') AS blocked_attempts,
      count(DISTINCT profile_id) FILTER (WHERE event_name = 'blocked_contact_attempt') AS blocked_attempt_users
    FROM window_events
  ),
  messages_sent AS (
    SELECT count(*) AS message_count
    FROM public.messages message
    CROSS JOIN bounds
    LEFT JOIN public.product_analytics_preferences preference ON preference.profile_id = message.sender_id
    WHERE message.created_at >= bounds.starts_at
      AND COALESCE(preference.enabled, true)
  ),
  -- Aggregate engagement observations.
  sessions AS (
    SELECT
      count(*) FILTER (WHERE event_name = 'app_session_started') AS session_count,
      count(*) FILTER (WHERE event_name = 'app_crash_detected') AS crash_count,
      count(DISTINCT profile_id) FILTER (WHERE event_name = 'app_session_started') AS session_users
    FROM window_events
  ),
  -- Aggregate engagement observations.
  -- Decided from the account role and the first seven days of events, in
  -- priority order, so every profile lands in exactly one segment.
  cohort AS (
    SELECT profile.id, profile.created_at, profile.role
    FROM public.profiles profile
    LEFT JOIN public.product_analytics_preferences preference ON preference.profile_id = profile.id
    WHERE profile.username_state = 'claimed'
      AND profile.created_at >= now() - interval '90 days'
      AND COALESCE(preference.enabled, true)
  ),
  first_week AS (
    SELECT cohort.id,
      bool_or(event.event_name IN ('garage_vehicle_added', 'garage_vehicle_updated', 'factory_spec_recorded',
                                   'build_update_published', 'maintenance_update_published', 'build_stage_created')) AS owner_signal,
      bool_or(event.event_name IN ('listing_viewed', 'listing_saved', 'seller_message_started',
                                   'inspection_requested', 'search_performed')) AS shopper_signal,
      bool_or(event.event_name IN ('group_joined', 'community_post_published', 'question_published',
                                   'answer_accepted', 'group_detail_viewed')) AS enthusiast_signal
    FROM cohort
    LEFT JOIN public.product_analytics_events event
      ON event.profile_id = cohort.id
      AND event.occurred_at >= cohort.created_at
      AND event.occurred_at < cohort.created_at + interval '7 days'
    GROUP BY cohort.id
  ),
  segmented AS (
    SELECT cohort.id, cohort.created_at,
      CASE
        WHEN cohort.role = 'technician' THEN 'technician'
        WHEN COALESCE(first_week.owner_signal, false) THEN 'owner'
        WHEN COALESCE(first_week.shopper_signal, false) THEN 'shopper'
        WHEN COALESCE(first_week.enthusiast_signal, false) THEN 'enthusiast'
        ELSE 'undetermined'
      END AS segment
    FROM cohort
    LEFT JOIN first_week ON first_week.id = cohort.id
  ),
  meaningful_events AS (
    SELECT event.profile_id, event.occurred_at
    FROM public.product_analytics_events event
    WHERE event.event_name IN (
      'garage_vehicle_added', 'garage_vehicle_updated', 'report_viewed',
      'listing_saved', 'inspection_requested', 'group_joined',
      'community_post_published', 'question_published',
      'build_update_published', 'maintenance_update_published', 'answer_accepted'
    )
  ),
  intent_retention AS (
    SELECT segment,
      count(*) FILTER (WHERE created_at <= now() - interval '14 days') AS d7_eligible,
      count(*) FILTER (
        WHERE created_at <= now() - interval '14 days'
          AND EXISTS (
            SELECT 1 FROM meaningful_events event
            WHERE event.profile_id = segmented.id
              AND event.occurred_at >= segmented.created_at + interval '7 days'
              AND event.occurred_at < segmented.created_at + interval '14 days'
          )
      ) AS d7_retained,
      count(*) FILTER (WHERE created_at <= now() - interval '37 days') AS d30_eligible,
      count(*) FILTER (
        WHERE created_at <= now() - interval '37 days'
          AND EXISTS (
            SELECT 1 FROM meaningful_events event
            WHERE event.profile_id = segmented.id
              AND event.occurred_at >= segmented.created_at + interval '30 days'
              AND event.occurred_at < segmented.created_at + interval '37 days'
          )
      ) AS d30_retained
    FROM segmented
    GROUP BY segment
  ),
  segments AS (
    SELECT segment FROM (VALUES ('shopper'), ('owner'), ('enthusiast'), ('technician'), ('undetermined')) AS s(segment)
  )
  SELECT jsonb_build_object(
    'windowDays', (SELECT window_days FROM bounds),
    'groupDiscovery', (
      SELECT jsonb_build_object(
        'viewers', viewers,
        'joiners', joiners,
        'ratePercent', CASE WHEN viewers = 0 THEN NULL ELSE round(100.0 * joiners / viewers, 1) END
      ) FROM discovery_joins
    ),
    'uploadCompletion', (
      SELECT jsonb_build_object(
        'reserved', reserved,
        'attached', attached,
        'ratePercent', CASE WHEN reserved = 0 THEN NULL ELSE round(100.0 * LEAST(attached, reserved) / reserved, 1) END
      ) FROM uploads
    ),
    'unwantedContact', (
      SELECT jsonb_build_object(
        'reports', contact.reports,
        'reportingUsers', contact.reporting_users,
        'blockedAttempts', contact.blocked_attempts,
        'blockedAttemptUsers', contact.blocked_attempt_users,
        'messagesSent', messages_sent.message_count,
        'reportsPerThousandMessages', CASE WHEN messages_sent.message_count = 0 THEN NULL
          ELSE round(1000.0 * contact.reports / messages_sent.message_count, 2) END
      ) FROM contact, messages_sent
    ),
    'sessions', (
      SELECT jsonb_build_object(
        'sessions', session_count,
        'sessionUsers', session_users,
        'crashes', crash_count,
        'crashFreePercent', NULL::numeric
      ) FROM sessions
    ),
    -- Segments with fewer than five eligible accounts report counts but no
    -- rate, so a tiny cohort cannot identify anyone.
    'intentRetention', (
      SELECT jsonb_agg(jsonb_build_object(
        'segment', segments.segment,
        'd7Eligible', COALESCE(r.d7_eligible, 0),
        'd7Retained', COALESCE(r.d7_retained, 0),
        'd7RatePercent', CASE WHEN COALESCE(r.d7_eligible, 0) < 5 THEN NULL
          ELSE round(100.0 * r.d7_retained / r.d7_eligible, 1) END,
        'd30Eligible', COALESCE(r.d30_eligible, 0),
        'd30Retained', COALESCE(r.d30_retained, 0),
        'd30RatePercent', CASE WHEN COALESCE(r.d30_eligible, 0) < 5 THEN NULL
          ELSE round(100.0 * r.d30_retained / r.d30_eligible, 1) END
      ) ORDER BY segments.segment)
      FROM segments
      LEFT JOIN intent_retention r ON r.segment = segments.segment
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_product_engagement_signals(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_engagement_signals(integer)
  TO service_role;

COMMENT ON FUNCTION public.get_product_engagement_signals(integer) IS
  'Service-only plan-34 signals: group discovery-to-join, upload completion, unwanted-contact attribution, received crash diagnostics (not session-attributed), and D7/D30 retention by observed intent. Aggregate counts only; segments under five accounts report no rate.';

COMMIT;
