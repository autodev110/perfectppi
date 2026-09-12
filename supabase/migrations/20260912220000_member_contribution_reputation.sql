-- Phase 3: transparent, viewer-aware contribution reputation. This exposes
-- factual active contribution totals, never an opaque score or leaderboard.
BEGIN;

CREATE FUNCTION public.member_contribution_summary(
  p_viewer_profile_id uuid,
  p_target_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_summary jsonb;
BEGIN
  IF p_viewer_profile_id IS NULL
     OR p_target_profile_id IS NULL
     OR NOT public.social_profile_is_available(p_viewer_profile_id)
     OR NOT public.social_can_view_profile(p_viewer_profile_id, p_target_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  WITH eligible_answers AS MATERIALIZED (
    SELECT comment.id,
           post.accepted_answer_comment_id = comment.id AS is_accepted,
           post.question_outcome
    FROM public.community_comments comment
    JOIN public.community_posts post ON post.id = comment.post_id
    WHERE comment.author_id = p_target_profile_id
      AND comment.status = 'active'
      AND comment.moderation_status = 'active'
      AND post.post_type = 'question'
      AND post.status = 'active'
      AND post.moderation_status = 'active'
      AND post.group_status = 'active'
      AND public.social_can_view_community_post(
        p_viewer_profile_id, post.id, false
      )
  ), answer_totals AS (
    SELECT count(*) FILTER (WHERE answer.is_accepted)::bigint AS accepted_answers,
           count(*) FILTER (
             WHERE answer.is_accepted AND answer.question_outcome = 'fixed'
           )::bigint AS fixed_issues,
           count(*) FILTER (
             WHERE answer.is_accepted AND answer.question_outcome = 'helped'
           )::bigint AS helped_issues
    FROM eligible_answers answer
  ), helpful_totals AS (
    SELECT count(reaction.profile_id)::bigint AS helpful_marks
    FROM eligible_answers answer
    JOIN public.community_comment_helpful_reactions reaction
      ON reaction.comment_id = answer.id
  ), inspection_totals AS (
    -- This is the existing server-managed public technician total already
    -- used by the technician directory. It does not reveal client or vehicle
    -- details from private inspections.
    SELECT COALESCE(max(technician.total_inspections), 0)::bigint AS completed_inspections
    FROM public.technician_profiles technician
    WHERE technician.profile_id = p_target_profile_id
  )
  SELECT jsonb_build_object(
    'acceptedAnswers', COALESCE(answer.accepted_answers, 0),
    'helpfulMarks', COALESCE(helpful.helpful_marks, 0),
    'fixedIssues', COALESCE(answer.fixed_issues, 0),
    'helpedIssues', COALESCE(answer.helped_issues, 0),
    'completedInspections', COALESCE(inspections.completed_inspections, 0)
  )
  INTO v_summary
  FROM answer_totals answer
  CROSS JOIN helpful_totals helpful
  CROSS JOIN inspection_totals inspections;

  RETURN COALESCE(v_summary, jsonb_build_object(
    'acceptedAnswers', 0,
    'helpfulMarks', 0,
    'fixedIssues', 0,
    'helpedIssues', 0,
    'completedInspections', 0
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.member_contribution_summary(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_contribution_summary(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.member_contribution_summary(uuid, uuid) IS
  'Viewer-aware active contribution facts. Hidden/inaccessible answers lose current credit; no score or rank is returned.';

COMMIT;
