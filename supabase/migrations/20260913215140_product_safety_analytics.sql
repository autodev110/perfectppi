BEGIN;

-- Aggregate-only product and safety measurement for plan section 34. The
-- function intentionally returns no profile, entity, case, report, or media
-- identifiers and never reads report details or content bodies into output.
CREATE OR REPLACE FUNCTION public.get_product_safety_analytics_summary(
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT
      LEAST(GREATEST(p_days, 1), 90) AS window_days,
      now() - make_interval(days => LEAST(GREATEST(p_days, 1), 90)) AS starts_at
  ),
  analytics_profiles AS (
    SELECT profile.id, profile.created_at
    FROM public.profiles profile
    LEFT JOIN public.product_analytics_preferences preference
      ON preference.profile_id = profile.id
    WHERE COALESCE(preference.enabled, true)
  ),
  meaningful_events AS (
    SELECT event.profile_id, event.event_name, event.occurred_at
    FROM public.product_analytics_events event
    WHERE event.event_name IN (
      'garage_vehicle_added', 'garage_vehicle_updated', 'report_viewed',
      'listing_saved', 'inspection_requested', 'group_joined',
      'community_post_published', 'question_published',
      'build_update_published', 'maintenance_update_published', 'answer_accepted'
    )
  ),
  marketplace_funnel AS (
    SELECT
      stage.event_name,
      stage.sort_order,
      count(event.id) AS event_count,
      count(DISTINCT event.profile_id) AS user_count
    FROM unnest(ARRAY[
      'listing_viewed', 'report_viewed', 'seller_message_started',
      'inspection_requested', 'inspection_completed'
    ]) WITH ORDINALITY AS stage(event_name, sort_order)
    LEFT JOIN public.product_analytics_events event
      ON event.event_name = stage.event_name
     AND event.occurred_at >= (SELECT starts_at FROM bounds)
    GROUP BY stage.event_name, stage.sort_order
    ORDER BY stage.sort_order
  ),
  friend_activity AS (
    SELECT
      count(*) AS sent_count,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1
        FROM public.friend_request_events accepted
        WHERE accepted.event = 'accepted'
          AND accepted.actor_id = sent.target_id
          AND accepted.target_id = sent.actor_id
          AND accepted.created_at >= sent.created_at
      )) AS accepted_count
    FROM public.friend_request_events sent
    JOIN analytics_profiles profile ON profile.id = sent.actor_id
    WHERE sent.event = 'sent'
      AND sent.created_at >= (SELECT starts_at FROM bounds)
  ),
  question_activity AS (
    SELECT
      count(*) AS question_count,
      count(*) FILTER (WHERE question.accepted_answer_comment_id IS NOT NULL) AS accepted_count,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1
        FROM public.community_comments comment
        WHERE comment.post_id = question.id
          AND comment.author_id <> question.author_id
          AND comment.created_at <= question.created_at + interval '24 hours'
          AND comment.status = 'active'
          AND comment.moderation_status = 'active'
      )) AS answered_within_24h_count
    FROM public.community_posts question
    JOIN analytics_profiles profile ON profile.id = question.author_id
    WHERE question.post_type = 'question'
      AND question.created_at >= (SELECT starts_at FROM bounds)
  ),
  technical_saves AS (
    SELECT count(*) AS save_count, count(DISTINCT save.profile_id) AS user_count
    FROM public.community_post_saves save
    JOIN analytics_profiles profile ON profile.id = save.profile_id
    JOIN public.community_posts post ON post.id = save.post_id
    WHERE save.created_at >= (SELECT starts_at FROM bounds)
      AND post.post_type IN ('question', 'build_update', 'maintenance')
  ),
  retained_group_participants AS (
    SELECT count(DISTINCT membership.profile_id) AS user_count
    FROM public.community_group_memberships membership
    JOIN analytics_profiles profile ON profile.id = membership.profile_id
    WHERE membership.status = 'active'
      AND membership.joined_at <= now() - interval '7 days'
      AND (
        EXISTS (
          SELECT 1
          FROM public.community_posts post
          WHERE post.author_id = membership.profile_id
            AND post.group_id = membership.group_id
            AND post.created_at >= GREATEST(
              (SELECT starts_at FROM bounds), membership.joined_at + interval '7 days'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.community_comments comment
          JOIN public.community_posts post ON post.id = comment.post_id
          WHERE comment.author_id = membership.profile_id
            AND post.group_id = membership.group_id
            AND comment.created_at >= GREATEST(
              (SELECT starts_at FROM bounds), membership.joined_at + interval '7 days'
            )
        )
      )
  ),
  retention_cohorts AS (
    SELECT profile.id, profile.created_at
    FROM analytics_profiles profile
    JOIN public.profiles claimed ON claimed.id = profile.id
    WHERE claimed.username_state = 'claimed'
      AND profile.created_at >= now() - interval '90 days'
  ),
  retention AS (
    SELECT
      count(*) FILTER (WHERE cohort.created_at <= now() - interval '14 days') AS d7_eligible,
      count(*) FILTER (
        WHERE cohort.created_at <= now() - interval '14 days'
          AND EXISTS (
            SELECT 1 FROM meaningful_events event
            WHERE event.profile_id = cohort.id
              AND event.occurred_at >= cohort.created_at + interval '7 days'
              AND event.occurred_at < cohort.created_at + interval '14 days'
          )
      ) AS d7_retained,
      count(*) FILTER (WHERE cohort.created_at <= now() - interval '37 days') AS d30_eligible,
      count(*) FILTER (
        WHERE cohort.created_at <= now() - interval '37 days'
          AND EXISTS (
            SELECT 1 FROM meaningful_events event
            WHERE event.profile_id = cohort.id
              AND event.occurred_at >= cohort.created_at + interval '30 days'
              AND event.occurred_at < cohort.created_at + interval '37 days'
          )
      ) AS d30_retained
    FROM retention_cohorts cohort
  ),
  published_items AS (
    SELECT
      (SELECT count(*) FROM public.community_posts post
        WHERE post.created_at >= (SELECT starts_at FROM bounds))
      +
      (SELECT count(*) FROM public.community_comments comment
        WHERE comment.created_at >= (SELECT starts_at FROM bounds)) AS item_count
  ),
  reports AS (
    SELECT report.entity_type, report.reason_code, report.case_id, report.reporter_id
    FROM public.moderation_reports report
    WHERE report.created_at >= (SELECT starts_at FROM bounds)
  ),
  report_groups AS (
    SELECT entity_type, reason_code, count(*) AS report_count
    FROM reports
    GROUP BY entity_type, reason_code
  ),
  review_durations AS (
    SELECT extract(epoch FROM (moderation_case.closed_at - moderation_case.created_at)) / 3600.0 AS hours
    FROM public.moderation_cases moderation_case
    WHERE moderation_case.state = 'closed'
      AND moderation_case.closed_at IS NOT NULL
      AND moderation_case.created_at >= (SELECT starts_at FROM bounds)
  ),
  case_outcomes AS (
    SELECT
      count(*) AS closed_count,
      count(*) FILTER (WHERE resolution IN ('no_violation_restored', 'appeal_overturned')) AS restored_count,
      count(*) FILTER (WHERE resolution IN ('violation_removed', 'appeal_upheld')) AS violation_count
    FROM public.moderation_cases moderation_case
    WHERE moderation_case.state = 'closed'
      AND moderation_case.closed_at >= (SELECT starts_at FROM bounds)
  ),
  appeal_outcomes AS (
    SELECT
      count(*) FILTER (WHERE appeal.status IN ('approved', 'denied')) AS decided_count,
      count(*) FILTER (WHERE appeal.status = 'approved') AS overturned_count
    FROM public.moderation_appeals appeal
    WHERE appeal.created_at >= (SELECT starts_at FROM bounds)
  ),
  repeat_violations AS (
    SELECT count(*) AS author_count
    FROM (
      SELECT item.author_id
      FROM public.moderation_cases moderation_case
      JOIN public.moderation_items item ON item.id = moderation_case.moderation_item_id
      WHERE moderation_case.closed_at >= (SELECT starts_at FROM bounds)
        AND moderation_case.resolution IN ('violation_removed', 'appeal_upheld')
        AND item.author_id IS NOT NULL
      GROUP BY item.author_id
      HAVING count(*) >= 2
    ) repeated
  ),
  repeated_nonviolating_reporters AS (
    SELECT count(*) AS reporter_count
    FROM (
      SELECT report.reporter_id
      FROM reports report
      JOIN public.moderation_cases moderation_case ON moderation_case.id = report.case_id
      WHERE report.reporter_id IS NOT NULL
        AND moderation_case.state = 'closed'
      GROUP BY report.reporter_id
      HAVING count(*) >= 5
        AND count(*) FILTER (
          WHERE moderation_case.resolution IN ('no_violation_restored', 'appeal_overturned')
        )::numeric / count(*) >= 0.8
    ) repeated
  ),
  social_safety_actions AS (
    SELECT
      (SELECT count(*) FROM public.profile_blocks block
        WHERE block.created_at >= (SELECT starts_at FROM bounds)) AS blocks_created,
      (SELECT count(DISTINCT block.blocker_id) FROM public.profile_blocks block
        WHERE block.created_at >= (SELECT starts_at FROM bounds)) AS block_actors,
      (SELECT count(*) FROM public.profile_mutes mute
        WHERE mute.created_at >= (SELECT starts_at FROM bounds)) AS mutes_created,
      (SELECT count(DISTINCT mute.muter_id) FROM public.profile_mutes mute
        WHERE mute.created_at >= (SELECT starts_at FROM bounds)) AS mute_actors
  ),
  notification_opt_outs AS (
    SELECT
      (SELECT count(*) FROM public.profiles) AS eligible_profiles,
      count(DISTINCT preference.profile_id) FILTER (
        WHERE NOT preference.in_app OR NOT preference.push
      ) AS opted_out_profiles
    FROM public.notification_preferences preference
    WHERE public.notification_category_optional(preference.category)
  ),
  queue_health AS (
    SELECT
      count(*) FILTER (WHERE state IN ('open', 'claimed', 'appeal_open')) AS open_cases,
      count(*) FILTER (
        WHERE state IN ('open', 'claimed', 'appeal_open', 'escalated') AND sla_due_at <= now()
      ) AS overdue_cases,
      count(*) FILTER (
        WHERE state IN ('open', 'claimed', 'appeal_open', 'escalated')
          AND sla_due_at > now() AND sla_due_at <= now() + interval '2 hours'
      ) AS due_within_2h,
      count(*) FILTER (
        WHERE priority = 'urgent' AND state = 'open' AND created_at <= now() - interval '15 minutes'
      ) AS urgent_unacknowledged
    FROM public.moderation_cases
  ),
  media_safety AS (
    SELECT count(*) AS hidden_public_references
    FROM public.community_post_media media
    JOIN public.community_posts post ON post.id = media.post_id
    WHERE media.url ~ '^https://'
      AND (
        media.moderation_status <> 'active'
        OR post.status <> 'active'
        OR post.moderation_status <> 'active'
      )
  ),
  visibility_safety AS (
    SELECT
      (SELECT count(*) FROM public.community_posts post
        WHERE post.status = 'active' AND post.moderation_status <> 'active')
      +
      (SELECT count(*) FROM public.community_comments comment
        WHERE comment.status = 'active' AND comment.moderation_status <> 'active')
      +
      (SELECT count(*)
       FROM public.moderation_cases moderation_case
       WHERE moderation_case.state IN ('open', 'claimed', 'escalated', 'appeal_open')
         AND (
           (moderation_case.entity_type = 'community_post' AND EXISTS (
             SELECT 1 FROM public.community_posts post
             WHERE post.id = moderation_case.entity_id
               AND post.active_revision_id = moderation_case.revision_id
               AND post.status = 'active' AND post.moderation_status = 'active'
           ))
           OR
           (moderation_case.entity_type = 'community_comment' AND EXISTS (
             SELECT 1 FROM public.community_comments comment
             WHERE comment.id = moderation_case.entity_id
               AND comment.active_revision_id = moderation_case.revision_id
               AND comment.status = 'active' AND comment.moderation_status = 'active'
           ))
         )) AS violation_count
  )
  SELECT jsonb_build_object(
    'windowDays', (SELECT window_days FROM bounds),
    'product', jsonb_build_object(
      'friendRequestsSent', (SELECT sent_count FROM friend_activity),
      'friendRequestsAccepted', (SELECT accepted_count FROM friend_activity),
      'friendAcceptanceRatePercent', (
        SELECT CASE WHEN sent_count = 0 THEN 0
          ELSE round(100.0 * accepted_count / sent_count, 1) END
        FROM friend_activity
      ),
      'technicalPostSaves', (SELECT save_count FROM technical_saves),
      'technicalPostSavers', (SELECT user_count FROM technical_saves),
      'questionsPublished', (SELECT question_count FROM question_activity),
      'questionsAnsweredWithin24Hours', (SELECT answered_within_24h_count FROM question_activity),
      'questionsWithAcceptedAnswer', (SELECT accepted_count FROM question_activity),
      'answeredWithin24HoursRatePercent', (
        SELECT CASE WHEN question_count = 0 THEN 0
          ELSE round(100.0 * answered_within_24h_count / question_count, 1) END
        FROM question_activity
      ),
      'acceptedAnswerRatePercent', (
        SELECT CASE WHEN question_count = 0 THEN 0
          ELSE round(100.0 * accepted_count / question_count, 1) END
        FROM question_activity
      ),
      'retainedGroupParticipants', (SELECT user_count FROM retained_group_participants),
      'd7Retention', (
        SELECT jsonb_build_object(
          'eligibleUsers', d7_eligible,
          'retainedUsers', d7_retained,
          'ratePercent', CASE WHEN d7_eligible = 0 THEN 0
            ELSE round(100.0 * d7_retained / d7_eligible, 1) END
        ) FROM retention
      ),
      'd30Retention', (
        SELECT jsonb_build_object(
          'eligibleUsers', d30_eligible,
          'retainedUsers', d30_retained,
          'ratePercent', CASE WHEN d30_eligible = 0 THEN 0
            ELSE round(100.0 * d30_retained / d30_eligible, 1) END
        ) FROM retention
      ),
      'marketplaceFunnel', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'stage', event_name, 'eventCount', event_count, 'userCount', user_count
        ) ORDER BY sort_order) FROM marketplace_funnel
      ), '[]'::jsonb)
    ),
    'safety', jsonb_build_object(
      'reportCount', (SELECT count(*) FROM reports),
      'publishedItems', (SELECT item_count FROM published_items),
      'reportsPerThousandItems', (
        SELECT CASE WHEN item_count = 0 THEN 0
          ELSE round(1000.0 * (SELECT count(*) FROM reports) / item_count, 2) END
        FROM published_items
      ),
      'reportBreakdown', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'surface', entity_type, 'reasonCode', reason_code, 'reportCount', report_count
        ) ORDER BY report_count DESC, entity_type, reason_code)
        FROM report_groups WHERE report_count >= 5
      ), '[]'::jsonb),
      'reportBreakdownSuppressed', EXISTS (
        SELECT 1 FROM report_groups WHERE report_count < 5
      ),
      'review', jsonb_build_object(
        'closedCases', (SELECT count(*) FROM review_durations),
        'medianHours', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY hours)::numeric, 2) FROM review_durations),
        'p95Hours', (SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY hours)::numeric, 2) FROM review_durations)
      ),
      'decisions', (
        SELECT jsonb_build_object(
          'closedCases', closed_count,
          'restored', restored_count,
          'confirmedViolations', violation_count,
          'restoreRatePercent', CASE WHEN closed_count = 0 THEN 0
            ELSE round(100.0 * restored_count / closed_count, 1) END,
          'confirmedViolationRatePercent', CASE WHEN closed_count = 0 THEN 0
            ELSE round(100.0 * violation_count / closed_count, 1) END
        ) FROM case_outcomes
      ),
      'appeals', (
        SELECT jsonb_build_object(
          'decided', decided_count,
          'overturned', overturned_count,
          'overturnRatePercent', CASE WHEN decided_count = 0 THEN 0
            ELSE round(100.0 * overturned_count / decided_count, 1) END
        ) FROM appeal_outcomes
      ),
      'repeatViolationAuthors', (SELECT author_count FROM repeat_violations),
      'repeatedNonviolatingReporters', (SELECT reporter_count FROM repeated_nonviolating_reporters),
      'hiddenMediaPublicReferences', (SELECT hidden_public_references FROM media_safety),
      'visibilityIntegrityViolations', (SELECT violation_count FROM visibility_safety),
      'blocksCreated', (SELECT blocks_created FROM social_safety_actions),
      'blockActors', (SELECT block_actors FROM social_safety_actions),
      'mutesCreated', (SELECT mutes_created FROM social_safety_actions),
      'muteActors', (SELECT mute_actors FROM social_safety_actions),
      'notificationOptOut', (
        SELECT jsonb_build_object(
          'eligibleProfiles', eligible_profiles,
          'optedOutProfiles', opted_out_profiles,
          'ratePercent', CASE WHEN eligible_profiles = 0 THEN 0
            ELSE round(100.0 * opted_out_profiles / eligible_profiles, 1) END
        ) FROM notification_opt_outs
      ),
      'queue', (
        SELECT jsonb_build_object(
          'openCases', open_cases,
          'overdueCases', overdue_cases,
          'dueWithin2Hours', due_within_2h,
          'urgentUnacknowledged', urgent_unacknowledged
        ) FROM queue_health
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_product_safety_analytics_summary(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_safety_analytics_summary(integer)
  TO service_role;

COMMENT ON FUNCTION public.get_product_safety_analytics_summary(integer) IS
  'Aggregate plan-section-34 product and safety measures. Returns no account, content, report, case, or media identifiers; report cohorts under five are suppressed.';

COMMIT;
