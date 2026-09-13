BEGIN;

-- Zero-tolerance launch invariant (plan sections 34 and 39): restrictive
-- moderation state must never coexist with a publicly active content state,
-- and an open report case must not leave its current revision visible while
-- first-valid-report auto-hide is enabled. The caller decides whether the
-- feature flag requires the final count to be zero.
CREATE OR REPLACE FUNCTION public.moderation_visibility_integrity_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_restricted_posts integer;
  v_active_restricted_comments integer;
  v_open_case_visible_content integer;
BEGIN
  SELECT count(*) INTO v_active_restricted_posts
  FROM public.community_posts post
  WHERE post.status = 'active'
    AND post.moderation_status <> 'active';

  SELECT count(*) INTO v_active_restricted_comments
  FROM public.community_comments comment
  WHERE comment.status = 'active'
    AND comment.moderation_status <> 'active';

  SELECT count(*) INTO v_open_case_visible_content
  FROM public.moderation_cases moderation_case
  WHERE moderation_case.state IN ('open', 'claimed', 'escalated', 'appeal_open')
    AND (
      (
        moderation_case.entity_type = 'community_post'
        AND EXISTS (
          SELECT 1
          FROM public.community_posts post
          WHERE post.id = moderation_case.entity_id
            AND post.active_revision_id = moderation_case.revision_id
            AND post.status = 'active'
            AND post.moderation_status = 'active'
        )
      )
      OR (
        moderation_case.entity_type = 'community_comment'
        AND EXISTS (
          SELECT 1
          FROM public.community_comments comment
          WHERE comment.id = moderation_case.entity_id
            AND comment.active_revision_id = moderation_case.revision_id
            AND comment.status = 'active'
            AND comment.moderation_status = 'active'
        )
      )
    );

  RETURN jsonb_build_object(
    'activeRestrictedPosts', v_active_restricted_posts,
    'activeRestrictedComments', v_active_restricted_comments,
    'openCaseVisibleContent', v_open_case_visible_content,
    'totalViolations',
      v_active_restricted_posts
      + v_active_restricted_comments
      + v_open_case_visible_content
  );
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_visibility_integrity_status()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderation_visibility_integrity_status()
  TO service_role;

CREATE INDEX IF NOT EXISTS community_posts_active_restricted_moderation_idx
  ON public.community_posts(id)
  WHERE status = 'active' AND moderation_status <> 'active';

CREATE INDEX IF NOT EXISTS community_comments_active_restricted_moderation_idx
  ON public.community_comments(id)
  WHERE status = 'active' AND moderation_status <> 'active';

COMMENT ON FUNCTION public.moderation_visibility_integrity_status() IS
  'Counts identifier-free Community visibility invariant violations for launch readiness and operational alerts.';

COMMIT;
