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
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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

CREATE TRIGGER moderation_items_updated_at
  BEFORE UPDATE ON public.moderation_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.moderation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_enforcement_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_appeals ENABLE ROW LEVEL SECURITY;

-- The application server owns the complete moderation workflow. Keeping these
-- tables service-only prevents raw classifier output and legal-hold metadata
-- from leaking through the Data API.
REVOKE ALL ON public.moderation_items FROM anon, authenticated;
REVOKE ALL ON public.moderation_events FROM anon, authenticated;
REVOKE ALL ON public.user_enforcement_actions FROM anon, authenticated;
REVOKE ALL ON public.moderation_hashes FROM anon, authenticated;
REVOKE ALL ON public.moderation_reports FROM anon, authenticated;
REVOKE ALL ON public.moderation_appeals FROM anon, authenticated;

GRANT ALL ON public.moderation_items TO service_role;
GRANT ALL ON public.moderation_events TO service_role;
GRANT ALL ON public.user_enforcement_actions TO service_role;
GRANT ALL ON public.moderation_hashes TO service_role;
GRANT ALL ON public.moderation_reports TO service_role;
GRANT ALL ON public.moderation_appeals TO service_role;

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

COMMENT ON TABLE public.moderation_items IS
  'Canonical moderation decision for each supported user-generated entity.';
COMMENT ON TABLE public.moderation_events IS
  'Append-only audit history for automated and manual moderation decisions.';
