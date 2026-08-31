-- PerfectPPI community moderation foundation.
-- All moderation writes are server-mediated. Public clients can only read
-- content whose content and moderation states are both active.

ALTER TABLE public.community_posts
  ADD COLUMN moderation_status text NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN (
      'pending_scan', 'active', 'needs_user_confirmation',
      'pending_review', 'rejected', 'legal_hold'
    )),
  ADD COLUMN moderation_reason text,
  ADD COLUMN moderation_checked_at timestamptz,
  ADD COLUMN moderation_version text;

ALTER TABLE public.community_comments
  ADD COLUMN moderation_status text NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN (
      'pending_scan', 'active', 'needs_user_confirmation',
      'pending_review', 'rejected', 'legal_hold'
    )),
  ADD COLUMN moderation_reason text,
  ADD COLUMN moderation_checked_at timestamptz,
  ADD COLUMN moderation_version text;

ALTER TABLE public.community_post_media
  DROP CONSTRAINT community_post_media_url_check,
  ADD COLUMN moderation_status text NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN (
      'pending_scan', 'active', 'pending_review', 'rejected', 'legal_hold'
    )),
  ADD COLUMN moderation_reason text,
  ADD COLUMN moderation_checked_at timestamptz,
  ADD COLUMN moderation_version text,
  ADD CONSTRAINT community_post_media_url_check CHECK (
    url ~ '^https://' OR url ~ '^r2-private:///quarantine/'
  );

CREATE TABLE public.moderation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN (
    'community_post', 'community_comment', 'community_post_media'
  )),
  entity_id uuid NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN (
    'pending_scan', 'active', 'pending_review', 'rejected', 'legal_hold'
  )),
  risk_level text NOT NULL CHECK (risk_level IN (
    'none', 'low', 'medium', 'high', 'critical'
  )),
  decision text NOT NULL CHECK (decision IN (
    'allow', 'warn', 'review', 'block', 'legal_hold'
  )),
  reason_codes text[] NOT NULL DEFAULT '{}',
  content_preview text,
  evidence_reference text,
  model_provider text NOT NULL,
  model_name text,
  model_version text NOT NULL,
  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_count integer NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX moderation_items_queue_idx
  ON public.moderation_items(status, risk_level, created_at);
CREATE INDEX moderation_items_author_idx
  ON public.moderation_items(author_id, created_at DESC);

CREATE TABLE public.moderation_legal_hold_reviewers (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_item_id uuid NOT NULL REFERENCES public.moderation_items(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK (actor_type IN ('system', 'admin', 'user', 'appeal')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'submitted', 'auto_allowed', 'auto_blocked', 'escalated', 'reported',
    'manual_approved', 'manual_rejected', 'legal_hold_applied',
    'user_warned', 'posting_hold_applied', 'appeal_opened', 'appeal_resolved'
  )),
  previous_status text,
  next_status text NOT NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX moderation_events_item_idx
  ON public.moderation_events(moderation_item_id, created_at DESC);

CREATE TABLE public.user_enforcement_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN (
    'warning', 'temporary_posting_hold', 'media_upload_hold', 'suspension', 'ban'
  )),
  reason_code text NOT NULL,
  related_moderation_item_id uuid REFERENCES public.moderation_items(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX user_enforcement_active_idx
  ON public.user_enforcement_actions(profile_id, starts_at, ends_at);

CREATE TABLE public.moderation_hashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type = 'community_post_media'),
  entity_id uuid NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  perceptual_hash text,
  mime_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size >= 0),
  width integer,
  height integer,
  duration_seconds numeric,
  scan_status text NOT NULL CHECK (scan_status IN (
    'pending', 'approved', 'review', 'rejected', 'legal_hold'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id),
  UNIQUE (sha256, entity_type, entity_id)
);

CREATE INDEX moderation_hashes_sha256_idx ON public.moderation_hashes(sha256);

CREATE TABLE public.moderation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('community_post', 'community_comment')),
  entity_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN (
    'spam', 'harassment', 'hate', 'violence', 'sexual_content',
    'personal_information', 'fraud', 'illegal_content', 'other'
  )),
  details text CHECK (char_length(details) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, entity_type, entity_id)
);

CREATE INDEX moderation_reports_entity_idx
  ON public.moderation_reports(entity_type, entity_id, created_at DESC);

CREATE TABLE public.moderation_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_item_id uuid NOT NULL REFERENCES public.moderation_items(id) ON DELETE CASCADE,
  appellant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  statement text NOT NULL CHECK (char_length(statement) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (moderation_item_id, appellant_id)
);

CREATE INDEX moderation_appeals_status_idx
  ON public.moderation_appeals(status, created_at);

CREATE TABLE public.community_upload_reservations (
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

CREATE INDEX community_upload_reservations_owner_idx
  ON public.community_upload_reservations(profile_id, created_at DESC);
CREATE INDEX community_upload_reservations_expiry_idx
  ON public.community_upload_reservations(status, expires_at);

CREATE TABLE public.storage_cleanup_jobs (
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

CREATE INDEX storage_cleanup_jobs_pending_idx
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

CREATE TRIGGER community_posts_preserve_legal_hold
  BEFORE DELETE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_legal_hold_content_deletion();
CREATE TRIGGER community_comments_preserve_legal_hold
  BEFORE DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_legal_hold_content_deletion();
CREATE TRIGGER community_media_preserve_legal_hold
  BEFORE DELETE ON public.community_post_media
  FOR EACH ROW EXECUTE FUNCTION public.prevent_legal_hold_content_deletion();

CREATE TRIGGER moderation_items_updated_at
  BEFORE UPDATE ON public.moderation_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.moderation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_enforcement_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_legal_hold_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_upload_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;

-- The application server owns the complete moderation workflow. Keeping these
-- tables service-only prevents raw classifier output and legal-hold metadata
-- from leaking through the Data API.
REVOKE ALL ON public.moderation_items FROM anon, authenticated;
REVOKE ALL ON public.moderation_events FROM anon, authenticated;
REVOKE ALL ON public.user_enforcement_actions FROM anon, authenticated;
REVOKE ALL ON public.moderation_hashes FROM anon, authenticated;
REVOKE ALL ON public.moderation_reports FROM anon, authenticated;
REVOKE ALL ON public.moderation_appeals FROM anon, authenticated;
REVOKE ALL ON public.moderation_legal_hold_reviewers FROM anon, authenticated;
REVOKE ALL ON public.community_upload_reservations FROM anon, authenticated;
REVOKE ALL ON public.storage_cleanup_jobs FROM anon, authenticated;

GRANT ALL ON public.moderation_items TO service_role;
GRANT ALL ON public.moderation_events TO service_role;
GRANT ALL ON public.user_enforcement_actions TO service_role;
GRANT ALL ON public.moderation_hashes TO service_role;
GRANT ALL ON public.moderation_reports TO service_role;
GRANT ALL ON public.moderation_appeals TO service_role;
GRANT ALL ON public.moderation_legal_hold_reviewers TO service_role;
GRANT ALL ON public.community_upload_reservations TO service_role;
GRANT ALL ON public.storage_cleanup_jobs TO service_role;

REVOKE DELETE ON public.moderation_items FROM service_role;

-- Moderation events are an append-only audit log for application code.
REVOKE ALL ON public.moderation_events FROM service_role;
GRANT SELECT, INSERT ON public.moderation_events TO service_role;

-- Community writes must go through the moderated server actions/API. Direct
-- browser writes would otherwise let a caller set an item active themselves.
REVOKE INSERT, UPDATE, DELETE ON public.community_posts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.community_comments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.community_post_media FROM authenticated;

DROP POLICY IF EXISTS community_posts_select_active ON public.community_posts;
CREATE POLICY community_posts_select_active ON public.community_posts
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active' AND moderation_status = 'active');

DROP POLICY IF EXISTS community_comments_select_active ON public.community_comments;
CREATE POLICY community_comments_select_active ON public.community_comments
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND moderation_status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.community_posts post
      WHERE post.id = community_comments.post_id
        AND post.status = 'active'
        AND post.moderation_status = 'active'
    )
  );

DROP POLICY IF EXISTS community_post_media_select_visible ON public.community_post_media;
CREATE POLICY community_post_media_select_visible
  ON public.community_post_media
  FOR SELECT
  TO anon, authenticated
  USING (
    (
      moderation_status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.community_posts post
        WHERE post.id = post_id
          AND post.status = 'active'
          AND post.moderation_status = 'active'
      )
    )
    OR uploader_id = public.get_my_profile_id()
    OR public.get_my_role() = 'admin'
  );

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

COMMENT ON TABLE public.moderation_items IS
  'Canonical moderation decision for each supported user-generated entity.';
COMMENT ON TABLE public.moderation_events IS
  'Append-only audit history for automated and manual moderation decisions.';
