-- Follow-up for 20260831191651_social_media_moderation.sql.
--
-- The original migration was deployed before its hardening changes were added.
-- Keep this migration idempotent so it repairs existing projects and remains a
-- no-op where the final version of the original migration ran from scratch.

ALTER TABLE public.moderation_items
  DROP CONSTRAINT IF EXISTS moderation_items_author_id_fkey,
  ALTER COLUMN author_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS evidence_reference text;

ALTER TABLE public.moderation_items
  ADD CONSTRAINT moderation_items_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.moderation_legal_hold_reviewers (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_upload_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.community_posts(id) ON DELETE SET NULL,
  storage_reference text NOT NULL UNIQUE CHECK (storage_reference ~ '^r2-private:///quarantine/'),
  expected_size bigint NOT NULL CHECK (expected_size BETWEEN 1 AND 52428800),
  content_type text NOT NULL CHECK (content_type ~ '^(image|video)/'),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'attached', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  attached_at timestamptz
);

CREATE INDEX IF NOT EXISTS community_upload_reservations_owner_idx
  ON public.community_upload_reservations(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_upload_reservations_expiry_idx
  ON public.community_upload_reservations(status, expires_at);

CREATE TABLE IF NOT EXISTS public.storage_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_reference text NOT NULL UNIQUE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS storage_cleanup_jobs_pending_idx
  ON public.storage_cleanup_jobs(status, next_attempt_at);

CREATE OR REPLACE FUNCTION public.prevent_legal_hold_content_deletion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  held boolean;
BEGIN
  IF TG_TABLE_NAME = 'community_posts' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.moderation_items
      WHERE entity_type = 'community_post' AND entity_id = OLD.id AND status = 'legal_hold'
    ) OR EXISTS (
      SELECT 1
      FROM public.community_post_media media
      JOIN public.moderation_items item
        ON item.entity_type = 'community_post_media'
       AND item.entity_id = media.id
       AND item.status = 'legal_hold'
      WHERE media.post_id = OLD.id
    ) INTO held;
  ELSIF TG_TABLE_NAME = 'community_post_media' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.moderation_items
      WHERE entity_type = 'community_post_media' AND entity_id = OLD.id AND status = 'legal_hold'
    ) INTO held;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.moderation_items
      WHERE entity_type = 'community_comment' AND entity_id = OLD.id AND status = 'legal_hold'
    ) INTO held;
  END IF;

  IF held THEN RAISE EXCEPTION 'legal-hold content cannot be deleted'; END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_preserve_legal_hold ON public.community_posts;
CREATE TRIGGER community_posts_preserve_legal_hold
  BEFORE DELETE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_legal_hold_content_deletion();

DROP TRIGGER IF EXISTS community_comments_preserve_legal_hold ON public.community_comments;
CREATE TRIGGER community_comments_preserve_legal_hold
  BEFORE DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_legal_hold_content_deletion();

DROP TRIGGER IF EXISTS community_media_preserve_legal_hold ON public.community_post_media;
CREATE TRIGGER community_media_preserve_legal_hold
  BEFORE DELETE ON public.community_post_media
  FOR EACH ROW EXECUTE FUNCTION public.prevent_legal_hold_content_deletion();

ALTER TABLE public.moderation_legal_hold_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_upload_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.moderation_legal_hold_reviewers FROM anon, authenticated;
REVOKE ALL ON public.community_upload_reservations FROM anon, authenticated;
REVOKE ALL ON public.storage_cleanup_jobs FROM anon, authenticated;

GRANT ALL ON public.moderation_legal_hold_reviewers TO service_role;
GRANT ALL ON public.community_upload_reservations TO service_role;
GRANT ALL ON public.storage_cleanup_jobs TO service_role;

REVOKE DELETE ON public.moderation_items FROM service_role;
REVOKE ALL ON public.moderation_events FROM service_role;
GRANT SELECT, INSERT ON public.moderation_events TO service_role;

CREATE OR REPLACE FUNCTION public.apply_moderation_review(
  p_item_id uuid,
  p_reviewer_id uuid,
  p_next_status text,
  p_next_decision text,
  p_notes text,
  p_enforcement text,
  p_media_url text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  item public.moderation_items%ROWTYPE;
  reviewer_role public.user_role;
  event_name text;
  action_name text;
  action_ends_at timestamptz;
  now_at timestamptz := now();
BEGIN
  IF p_next_status NOT IN ('active', 'rejected', 'legal_hold')
     OR p_next_decision NOT IN ('allow', 'block', 'legal_hold')
     OR p_enforcement NOT IN ('none', 'warning', 'posting_hold', 'media_hold', 'suspension') THEN
    RAISE EXCEPTION 'invalid moderation review input';
  END IF;

  SELECT * INTO item
  FROM public.moderation_items
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'moderation item not found'; END IF;

  SELECT role INTO reviewer_role FROM public.profiles WHERE id = p_reviewer_id;
  IF reviewer_role <> 'admin' THEN RAISE EXCEPTION 'admin reviewer required'; END IF;

  IF item.status = 'legal_hold' OR p_next_status = 'legal_hold' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.moderation_legal_hold_reviewers
      WHERE profile_id = p_reviewer_id
    ) THEN
      RAISE EXCEPTION 'legal hold reviewer required';
    END IF;
  END IF;

  IF item.entity_type = 'community_post' THEN
    UPDATE public.community_posts
    SET moderation_status = p_next_status,
        moderation_checked_at = now_at,
        moderation_version = 'perfectppi-moderation-v1',
        status = CASE WHEN p_next_status = 'active'
          THEN 'active'::public.community_content_status
          ELSE 'hidden'::public.community_content_status END
    WHERE id = item.entity_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'moderated post not found'; END IF;
  ELSIF item.entity_type = 'community_comment' THEN
    UPDATE public.community_comments
    SET moderation_status = p_next_status,
        moderation_checked_at = now_at,
        moderation_version = 'perfectppi-moderation-v1',
        status = CASE WHEN p_next_status = 'active'
          THEN 'active'::public.community_content_status
          ELSE 'hidden'::public.community_content_status END
    WHERE id = item.entity_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'moderated comment not found'; END IF;
  ELSE
    UPDATE public.community_post_media
    SET moderation_status = p_next_status,
        moderation_checked_at = now_at,
        moderation_version = 'perfectppi-moderation-v1',
        url = COALESCE(p_media_url, url)
    WHERE id = item.entity_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'moderated media not found'; END IF;

    UPDATE public.moderation_hashes
    SET scan_status = CASE
      WHEN p_next_status = 'active' THEN 'approved'
      WHEN p_next_status = 'legal_hold' THEN 'legal_hold'
      ELSE 'rejected' END
    WHERE entity_id = item.entity_id;
  END IF;

  UPDATE public.moderation_items
  SET status = p_next_status,
      decision = p_next_decision,
      evidence_reference = CASE
        WHEN p_next_status = 'legal_hold' AND item.entity_type = 'community_post_media'
          THEN COALESCE(
            item.evidence_reference,
            (SELECT url FROM public.community_post_media WHERE id = item.entity_id)
          )
        ELSE item.evidence_reference
      END,
      risk_level = CASE
        WHEN p_next_status = 'active' THEN 'none'
        WHEN p_next_status = 'legal_hold' THEN 'critical'
        ELSE 'high' END,
      decided_by = p_reviewer_id,
      decided_at = now_at
  WHERE id = item.id;

  event_name := CASE
    WHEN p_next_status = 'active' THEN 'manual_approved'
    WHEN p_next_status = 'legal_hold' THEN 'legal_hold_applied'
    ELSE 'manual_rejected' END;

  INSERT INTO public.moderation_events (
    moderation_item_id, actor_type, actor_id, event_type,
    previous_status, next_status, notes
  ) VALUES (
    item.id, 'admin', p_reviewer_id, event_name,
    item.status, p_next_status, p_notes
  );

  IF EXISTS (
    SELECT 1 FROM public.moderation_appeals
    WHERE moderation_item_id = item.id AND status = 'pending'
  ) THEN
    UPDATE public.moderation_appeals
    SET status = CASE WHEN p_next_status = 'active' THEN 'approved' ELSE 'denied' END,
        reviewed_by = p_reviewer_id,
        reviewed_at = now_at,
        resolution_notes = p_notes
    WHERE moderation_item_id = item.id AND status = 'pending';

    INSERT INTO public.moderation_events (
      moderation_item_id, actor_type, actor_id, event_type,
      previous_status, next_status, notes
    ) VALUES (
      item.id, 'admin', p_reviewer_id, 'appeal_resolved',
      item.status, p_next_status, p_notes
    );
  END IF;

  IF p_enforcement <> 'none' AND item.author_id IS NOT NULL THEN
    action_name := CASE
      WHEN p_enforcement = 'posting_hold' THEN 'temporary_posting_hold'
      WHEN p_enforcement = 'media_hold' THEN 'media_upload_hold'
      ELSE p_enforcement END;
    action_ends_at := CASE WHEN p_enforcement = 'warning'
      THEN NULL ELSE now_at + interval '7 days' END;

    INSERT INTO public.user_enforcement_actions (
      profile_id, action_type, reason_code,
      related_moderation_item_id, ends_at, created_by
    ) VALUES (
      item.author_id, action_name, COALESCE(item.reason_codes[1], 'community_guidelines'),
      item.id, action_ends_at, p_reviewer_id
    );

    INSERT INTO public.moderation_events (
      moderation_item_id, actor_type, actor_id, event_type,
      previous_status, next_status, metadata
    ) VALUES (
      item.id, 'admin', p_reviewer_id,
      CASE WHEN p_enforcement = 'warning' THEN 'user_warned' ELSE 'posting_hold_applied' END,
      p_next_status, p_next_status,
      jsonb_build_object('enforcement', p_enforcement, 'endsAt', action_ends_at)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_moderation_appeal(
  p_item_id uuid,
  p_appellant_id uuid,
  p_statement text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  item public.moderation_items%ROWTYPE;
BEGIN
  SELECT * INTO item FROM public.moderation_items
  WHERE id = p_item_id FOR UPDATE;

  IF NOT FOUND OR item.entity_type <> 'community_post'
     OR item.author_id IS DISTINCT FROM p_appellant_id
     OR item.status <> 'rejected' THEN
    RAISE EXCEPTION 'appeal is not available';
  END IF;

  INSERT INTO public.moderation_appeals (
    moderation_item_id, appellant_id, statement
  ) VALUES (item.id, p_appellant_id, p_statement);

  UPDATE public.moderation_items
  SET status = 'pending_review', decision = 'review', risk_level = 'medium', decided_at = NULL
  WHERE id = item.id;

  UPDATE public.community_posts
  SET moderation_status = 'pending_review', status = 'hidden'
  WHERE id = item.entity_id;

  INSERT INTO public.moderation_events (
    moderation_item_id, actor_type, actor_id, event_type,
    previous_status, next_status
  ) VALUES (
    item.id, 'appeal', p_appellant_id, 'appeal_opened',
    item.status, 'pending_review'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_moderation_report(
  p_reporter_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_reason_code text,
  p_details text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  entity_author_id uuid;
  entity_content text;
  entity_status text;
  item public.moderation_items%ROWTYPE;
BEGIN
  IF p_entity_type = 'community_post' THEN
    SELECT author_id, content, moderation_status
    INTO entity_author_id, entity_content, entity_status
    FROM public.community_posts WHERE id = p_entity_id;
  ELSIF p_entity_type = 'community_comment' THEN
    SELECT author_id, content, moderation_status
    INTO entity_author_id, entity_content, entity_status
    FROM public.community_comments WHERE id = p_entity_id;
  ELSE
    RAISE EXCEPTION 'unsupported report entity';
  END IF;

  IF entity_author_id IS NULL OR entity_author_id = p_reporter_id THEN
    RAISE EXCEPTION 'report is not available';
  END IF;
  IF p_reason_code NOT IN (
    'spam', 'harassment', 'hate', 'violence', 'sexual_content',
    'personal_information', 'fraud', 'illegal_content', 'other'
  ) THEN RAISE EXCEPTION 'invalid report reason'; END IF;
  IF p_details IS NOT NULL AND char_length(p_details) > 500 THEN
    RAISE EXCEPTION 'report details are too long';
  END IF;
  IF (
    SELECT count(*) FROM public.moderation_reports
    WHERE reporter_id = p_reporter_id AND created_at >= now() - interval '1 hour'
  ) >= 20 THEN RAISE EXCEPTION 'report rate limit exceeded'; END IF;

  INSERT INTO public.moderation_reports (
    reporter_id, entity_type, entity_id, reason_code, details
  ) VALUES (p_reporter_id, p_entity_type, p_entity_id, p_reason_code, p_details);

  SELECT * INTO item FROM public.moderation_items
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.moderation_items
    SET status = CASE WHEN item.status = 'legal_hold' THEN 'legal_hold' ELSE 'pending_review' END,
        decision = CASE WHEN item.status = 'legal_hold' THEN 'legal_hold' ELSE 'review' END,
        risk_level = CASE WHEN item.status = 'legal_hold' THEN 'critical' ELSE 'medium' END,
        reason_codes = CASE WHEN ('user_report:' || p_reason_code) = ANY(item.reason_codes)
          THEN item.reason_codes ELSE array_append(item.reason_codes, 'user_report:' || p_reason_code) END,
        report_count = item.report_count + 1
    WHERE id = item.id;
  ELSE
    INSERT INTO public.moderation_items (
      entity_type, entity_id, author_id, status, risk_level, decision,
      reason_codes, content_preview, model_provider, model_version, report_count
    ) VALUES (
      p_entity_type, p_entity_id, entity_author_id, 'pending_review', 'medium', 'review',
      ARRAY['user_report:' || p_reason_code], left(entity_content, 500),
      'user_report', 'perfectppi-moderation-v1', 1
    ) RETURNING * INTO item;
  END IF;

  INSERT INTO public.moderation_events (
    moderation_item_id, actor_type, actor_id, event_type,
    previous_status, next_status, metadata
  ) VALUES (
    item.id, 'user', p_reporter_id, 'reported', entity_status,
    CASE WHEN item.status = 'legal_hold' THEN 'legal_hold' ELSE 'pending_review' END,
    jsonb_build_object('reasonCode', p_reason_code)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_legal_hold_content_deletion()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_moderation_review(uuid, uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.open_moderation_appeal(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_moderation_report(uuid, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_moderation_review(uuid, uuid, text, text, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.open_moderation_appeal(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_moderation_report(uuid, text, uuid, text, text)
  TO service_role;
