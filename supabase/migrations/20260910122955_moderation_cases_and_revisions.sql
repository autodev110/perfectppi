BEGIN;

-- Immutable published revisions. A deferred active-revision FK lets the row
-- and its first revision be created by one insert transaction.
CREATE TABLE public.community_post_revisions (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  content text NOT NULL,
  audience public.community_post_audience NOT NULL,
  vehicle_id uuid,
  marketplace_listing_id uuid,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, revision_number)
);

CREATE TABLE public.community_comment_revisions (
  id uuid PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  content text NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, revision_number)
);

CREATE INDEX community_post_revisions_post_created_idx
  ON public.community_post_revisions(post_id, created_at DESC);
CREATE INDEX community_comment_revisions_comment_created_idx
  ON public.community_comment_revisions(comment_id, created_at DESC);

ALTER TABLE public.community_posts ADD COLUMN active_revision_id uuid;
ALTER TABLE public.community_comments ADD COLUMN active_revision_id uuid;

INSERT INTO public.community_post_revisions (
  id, post_id, revision_number, content, audience, vehicle_id,
  marketplace_listing_id, author_id, created_at
)
SELECT gen_random_uuid(), id, 1, content, audience, vehicle_id,
  marketplace_listing_id, author_id, created_at
FROM public.community_posts;

UPDATE public.community_posts post
SET active_revision_id = revision.id
FROM public.community_post_revisions revision
WHERE revision.post_id = post.id AND revision.revision_number = 1;

INSERT INTO public.community_comment_revisions (
  id, comment_id, revision_number, content, author_id, created_at
)
SELECT gen_random_uuid(), id, 1, content, author_id, created_at
FROM public.community_comments;

UPDATE public.community_comments comment
SET active_revision_id = revision.id
FROM public.community_comment_revisions revision
WHERE revision.comment_id = comment.id AND revision.revision_number = 1;

ALTER TABLE public.community_posts
  ALTER COLUMN active_revision_id SET NOT NULL,
  ADD CONSTRAINT community_posts_active_revision_id_fkey
    FOREIGN KEY (active_revision_id)
    REFERENCES public.community_post_revisions(id)
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.community_comments
  ALTER COLUMN active_revision_id SET NOT NULL,
  ADD CONSTRAINT community_comments_active_revision_id_fkey
    FOREIGN KEY (active_revision_id)
    REFERENCES public.community_comment_revisions(id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.capture_community_post_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.active_revision_id := COALESCE(NEW.active_revision_id, gen_random_uuid());
    RETURN NEW;
  END IF;

  IF NEW.active_revision_id IS DISTINCT FROM OLD.active_revision_id
     AND NOT (
       NEW.content IS DISTINCT FROM OLD.content
       OR NEW.audience IS DISTINCT FROM OLD.audience
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.marketplace_listing_id IS DISTINCT FROM OLD.marketplace_listing_id
     ) THEN
    RAISE EXCEPTION 'active revision is managed by the revision trigger';
  END IF;

  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.audience IS DISTINCT FROM OLD.audience
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     OR NEW.marketplace_listing_id IS DISTINCT FROM OLD.marketplace_listing_id THEN
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

CREATE OR REPLACE FUNCTION public.persist_community_post_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_revision_number := 1;
  ELSE
    IF NEW.active_revision_id IS NOT DISTINCT FROM OLD.active_revision_id THEN
      RETURN NEW;
    END IF;
    SELECT revision_number + 1 INTO v_revision_number
    FROM public.community_post_revisions
    WHERE id = OLD.active_revision_id;
  END IF;

  INSERT INTO public.community_post_revisions (
    id, post_id, revision_number, content, audience, vehicle_id,
    marketplace_listing_id, author_id
  ) VALUES (
    NEW.active_revision_id, NEW.id, v_revision_number, NEW.content, NEW.audience,
    NEW.vehicle_id, NEW.marketplace_listing_id, NEW.author_id
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_community_comment_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.active_revision_id := COALESCE(NEW.active_revision_id, gen_random_uuid());
    RETURN NEW;
  END IF;

  IF NEW.active_revision_id IS DISTINCT FROM OLD.active_revision_id
     AND NEW.content IS NOT DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'active revision is managed by the revision trigger';
  END IF;
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    IF OLD.status <> 'active' OR OLD.moderation_status <> 'active' THEN
      RAISE EXCEPTION 'content under review or removal cannot be edited';
    END IF;
    SELECT revision_number + 1 INTO v_revision_number
    FROM public.community_comment_revisions
    WHERE id = OLD.active_revision_id;
    IF v_revision_number IS NULL THEN
      RAISE EXCEPTION 'active comment revision is unavailable';
    END IF;
    NEW.active_revision_id := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_community_comment_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_revision_number := 1;
  ELSE
    IF NEW.active_revision_id IS NOT DISTINCT FROM OLD.active_revision_id THEN
      RETURN NEW;
    END IF;
    SELECT revision_number + 1 INTO v_revision_number
    FROM public.community_comment_revisions
    WHERE id = OLD.active_revision_id;
  END IF;

  INSERT INTO public.community_comment_revisions (
    id, comment_id, revision_number, content, author_id
  ) VALUES (
    NEW.active_revision_id, NEW.id, v_revision_number, NEW.content, NEW.author_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_posts_capture_revision
  BEFORE INSERT OR UPDATE OF content, audience, vehicle_id, marketplace_listing_id, active_revision_id
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.capture_community_post_revision();
CREATE TRIGGER community_posts_persist_revision
  AFTER INSERT OR UPDATE OF content, audience, vehicle_id, marketplace_listing_id, active_revision_id
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.persist_community_post_revision();
CREATE TRIGGER community_comments_capture_revision
  BEFORE INSERT OR UPDATE OF content, active_revision_id
  ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.capture_community_comment_revision();
CREATE TRIGGER community_comments_persist_revision
  AFTER INSERT OR UPDATE OF content, active_revision_id
  ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.persist_community_comment_revision();

CREATE OR REPLACE FUNCTION public.prevent_moderation_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Parent-row/account deletion invokes the revision delete trigger through
  -- the FK cascade. Direct revision mutation remains forbidden.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'moderation history is immutable';
END;
$$;

CREATE TRIGGER community_post_revisions_immutable
  BEFORE UPDATE OR DELETE ON public.community_post_revisions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_moderation_history_mutation();
CREATE TRIGGER community_comment_revisions_immutable
  BEFORE UPDATE OR DELETE ON public.community_comment_revisions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_moderation_history_mutation();

CREATE TABLE public.moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderation_item_id uuid NOT NULL REFERENCES public.moderation_items(id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK (entity_type IN ('community_post', 'community_comment')),
  entity_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN (
    'monitoring', 'open', 'claimed', 'escalated', 'appeal_open', 'closed'
  )),
  resolution text CHECK (resolution IN (
    'no_violation_restored', 'violation_removed', 'legal_escalation',
    'appeal_upheld', 'appeal_overturned'
  )),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  sla_due_at timestamptz NOT NULL,
  assigned_moderator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  decision_version integer NOT NULL DEFAULT 1 CHECK (decision_version > 0),
  first_reported_at timestamptz,
  last_reported_at timestamptz,
  closed_at timestamptz,
  retention_basis text NOT NULL DEFAULT 'community_safety',
  retention_expires_at timestamptz,
  legal_hold boolean NOT NULL DEFAULT false,
  disposition_state text NOT NULL DEFAULT 'retained'
    CHECK (disposition_state IN ('retained', 'purge_eligible', 'purged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'closed' AND resolution IS NOT NULL AND closed_at IS NOT NULL)
    OR (state <> 'closed' AND resolution IS NULL AND closed_at IS NULL)),
  CHECK ((state = 'claimed' AND assigned_moderator_id IS NOT NULL AND claimed_at IS NOT NULL
      AND claim_expires_at IS NOT NULL)
    OR state <> 'claimed'),
  CHECK (claim_expires_at IS NULL OR claimed_at IS NULL OR claim_expires_at > claimed_at)
);

CREATE UNIQUE INDEX moderation_cases_one_active_revision_idx
  ON public.moderation_cases(entity_type, entity_id, revision_id)
  WHERE state IN ('monitoring', 'open', 'claimed', 'escalated', 'appeal_open');
CREATE INDEX moderation_cases_queue_idx
  ON public.moderation_cases(state, priority, sla_due_at, created_at);
CREATE INDEX moderation_cases_entity_idx
  ON public.moderation_cases(entity_type, entity_id, revision_id, created_at DESC);

CREATE TABLE public.moderation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.moderation_cases(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL,
  content_snapshot jsonb NOT NULL,
  media_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, revision_id)
);

CREATE TABLE public.moderation_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.moderation_cases(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'case_opened', 'case_escalated', 'author_restored', 'author_removed', 'sla_alert'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX moderation_outbox_pending_idx
  ON public.moderation_outbox(status, next_attempt_at, created_at);

ALTER TABLE public.moderation_reports
  ADD COLUMN revision_id uuid,
  ADD COLUMN case_id uuid,
  ADD COLUMN idempotency_key text;
ALTER TABLE public.moderation_events
  ADD COLUMN case_id uuid,
  ADD COLUMN revision_id uuid;
ALTER TABLE public.moderation_appeals
  ADD COLUMN case_id uuid,
  ADD COLUMN revision_id uuid;

ALTER TABLE public.moderation_reports
  DROP CONSTRAINT IF EXISTS moderation_reports_reporter_id_fkey,
  ALTER COLUMN reporter_id DROP NOT NULL,
  ADD CONSTRAINT moderation_reports_reporter_id_fkey
    FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.moderation_appeals
  DROP CONSTRAINT IF EXISTS moderation_appeals_appellant_id_fkey,
  ALTER COLUMN appellant_id DROP NOT NULL,
  ADD CONSTRAINT moderation_appeals_appellant_id_fkey
    FOREIGN KEY (appellant_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Migrate the existing entity-level moderation history into one initial case
-- per current revision. moderation_items remains the compatibility aggregate.
INSERT INTO public.moderation_cases (
  moderation_item_id, entity_type, entity_id, revision_id, state, resolution,
  priority, sla_due_at, first_reported_at, last_reported_at, closed_at,
  legal_hold, created_at, updated_at
)
SELECT
  item.id,
  item.entity_type,
  item.entity_id,
  CASE WHEN item.entity_type = 'community_post'
    THEN post.active_revision_id ELSE comment.active_revision_id END,
  CASE
    WHEN item.status IN ('pending_scan', 'pending_review') THEN 'open'
    WHEN item.status = 'legal_hold' THEN 'escalated'
    ELSE 'closed'
  END,
  CASE
    WHEN item.status = 'active' THEN 'no_violation_restored'
    WHEN item.status = 'rejected' THEN 'violation_removed'
    ELSE NULL
  END,
  CASE WHEN item.risk_level IN ('critical', 'high') THEN 'urgent'
    WHEN item.risk_level = 'medium' THEN 'high' ELSE 'normal' END,
  item.created_at + CASE WHEN item.risk_level IN ('critical', 'high')
    THEN interval '4 hours' ELSE interval '24 hours' END,
  report_times.first_reported_at,
  report_times.last_reported_at,
  CASE WHEN item.status IN ('active', 'rejected') THEN COALESCE(item.decided_at, item.updated_at) END,
  item.status = 'legal_hold',
  item.created_at,
  item.updated_at
FROM public.moderation_items item
LEFT JOIN public.community_posts post
  ON item.entity_type = 'community_post' AND post.id = item.entity_id
LEFT JOIN public.community_comments comment
  ON item.entity_type = 'community_comment' AND comment.id = item.entity_id
LEFT JOIN LATERAL (
  SELECT min(created_at) first_reported_at, max(created_at) last_reported_at
  FROM public.moderation_reports report
  WHERE report.entity_type = item.entity_type AND report.entity_id = item.entity_id
) report_times ON true
WHERE item.entity_type IN ('community_post', 'community_comment')
  AND CASE WHEN item.entity_type = 'community_post'
    THEN post.active_revision_id ELSE comment.active_revision_id END IS NOT NULL;

UPDATE public.moderation_reports report
SET revision_id = moderation_case.revision_id,
    case_id = moderation_case.id,
    idempotency_key = 'legacy:' || report.id::text
FROM public.moderation_cases moderation_case
WHERE moderation_case.entity_type = report.entity_type
  AND moderation_case.entity_id = report.entity_id;

UPDATE public.moderation_events event
SET case_id = moderation_case.id,
    revision_id = moderation_case.revision_id
FROM public.moderation_cases moderation_case
WHERE moderation_case.moderation_item_id = event.moderation_item_id;

UPDATE public.moderation_appeals appeal
SET case_id = moderation_case.id,
    revision_id = moderation_case.revision_id
FROM public.moderation_cases moderation_case
WHERE moderation_case.moderation_item_id = appeal.moderation_item_id;

ALTER TABLE public.moderation_reports
  ALTER COLUMN revision_id SET NOT NULL,
  ALTER COLUMN case_id SET NOT NULL,
  ALTER COLUMN idempotency_key SET NOT NULL,
  ADD CONSTRAINT moderation_reports_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.moderation_cases(id) ON DELETE RESTRICT;
ALTER TABLE public.moderation_events
  ADD CONSTRAINT moderation_events_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.moderation_cases(id) ON DELETE RESTRICT;
ALTER TABLE public.moderation_appeals
  ADD CONSTRAINT moderation_appeals_case_id_fkey
    FOREIGN KEY (case_id) REFERENCES public.moderation_cases(id) ON DELETE RESTRICT;

ALTER TABLE public.moderation_reports
  DROP CONSTRAINT IF EXISTS moderation_reports_reporter_id_entity_type_entity_id_key;
ALTER TABLE public.moderation_reports
  ADD CONSTRAINT moderation_reports_reporter_entity_revision_key
    UNIQUE (reporter_id, entity_type, entity_id, revision_id),
  ADD CONSTRAINT moderation_reports_reporter_idempotency_key
    UNIQUE (reporter_id, idempotency_key);

ALTER TABLE public.moderation_appeals
  DROP CONSTRAINT IF EXISTS moderation_appeals_moderation_item_id_appellant_id_key;
ALTER TABLE public.moderation_appeals
  ADD CONSTRAINT moderation_appeals_appellant_case_key UNIQUE (appellant_id, case_id);

ALTER TABLE public.moderation_events
  DROP CONSTRAINT IF EXISTS moderation_events_event_type_check;
ALTER TABLE public.moderation_events
  ADD CONSTRAINT moderation_events_event_type_check CHECK (event_type IN (
    'submitted', 'auto_allowed', 'auto_blocked', 'escalated', 'reported',
    'manual_approved', 'manual_rejected', 'legal_hold_applied',
    'user_warned', 'posting_hold_applied', 'appeal_opened', 'appeal_resolved',
    'report_created', 'case_auto_hidden', 'case_claimed', 'case_claim_expired',
    'content_restored', 'content_removed', 'legal_hold_released',
    'appeal_decided', 'enforcement_applied', 'media_restricted', 'evidence_purged'
  ));

ALTER TABLE public.user_enforcement_actions
  DROP CONSTRAINT IF EXISTS user_enforcement_actions_action_type_check;
ALTER TABLE public.user_enforcement_actions
  ADD CONSTRAINT user_enforcement_actions_action_type_check CHECK (action_type IN (
    'warning', 'temporary_posting_hold', 'media_upload_hold', 'reporting_hold',
    'suspension', 'ban'
  ));

INSERT INTO public.moderation_evidence (
  case_id, revision_id, content_snapshot, media_references, content_sha256, captured_at
)
SELECT
  moderation_case.id,
  moderation_case.revision_id,
  CASE WHEN moderation_case.entity_type = 'community_post'
    THEN jsonb_build_object(
      'entityType', moderation_case.entity_type,
      'entityId', moderation_case.entity_id,
      'revisionId', revision.id,
      'revisionNumber', revision.revision_number,
      'content', revision.content,
      'audience', revision.audience,
      'vehicleId', revision.vehicle_id,
      'marketplaceListingId', revision.marketplace_listing_id,
      'authorId', revision.author_id,
      'createdAt', revision.created_at
    )
    ELSE jsonb_build_object('entityType', moderation_case.entity_type)
  END,
  CASE WHEN moderation_case.entity_type = 'community_post'
    THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', media.id, 'url', media.url, 'mediaType', media.media_type,
        'contentType', media.content_type, 'moderationStatus', media.moderation_status
      ) ORDER BY media.sort_order)
      FROM public.community_post_media media
      WHERE media.post_id = moderation_case.entity_id
    ), '[]'::jsonb)
    ELSE '[]'::jsonb
  END,
  encode(extensions.digest(CASE WHEN moderation_case.entity_type = 'community_post'
    THEN revision.content ELSE comment_revision.content END, 'sha256'), 'hex'),
  moderation_case.created_at
FROM public.moderation_cases moderation_case
LEFT JOIN public.community_post_revisions revision
  ON moderation_case.entity_type = 'community_post' AND revision.id = moderation_case.revision_id
LEFT JOIN public.community_comment_revisions comment_revision
  ON moderation_case.entity_type = 'community_comment' AND comment_revision.id = moderation_case.revision_id;

-- Correct comment snapshots separately to keep the main insert readable.
UPDATE public.moderation_evidence evidence
SET content_snapshot = jsonb_build_object(
  'entityType', moderation_case.entity_type,
  'entityId', moderation_case.entity_id,
  'revisionId', revision.id,
  'revisionNumber', revision.revision_number,
  'content', revision.content,
  'authorId', revision.author_id,
  'createdAt', revision.created_at
)
FROM public.moderation_cases moderation_case
JOIN public.community_comment_revisions revision
  ON revision.id = moderation_case.revision_id
WHERE evidence.case_id = moderation_case.id
  AND moderation_case.entity_type = 'community_comment';

CREATE OR REPLACE FUNCTION public.sync_active_moderation_case()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_case_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.entity_type NOT IN ('community_post', 'community_comment') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_case_id
  FROM public.moderation_cases
  WHERE moderation_item_id = NEW.id
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_case_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'active' THEN
    UPDATE public.moderation_cases
    SET state = 'closed', resolution = CASE
          WHEN state = 'appeal_open' THEN 'appeal_overturned'
          ELSE 'no_violation_restored' END,
        closed_at = now(), decision_version = decision_version + 1, updated_at = now()
    WHERE id = v_case_id;
  ELSIF NEW.status = 'rejected' THEN
    UPDATE public.moderation_cases
    SET state = 'closed', resolution = CASE
          WHEN state = 'appeal_open' THEN 'appeal_upheld'
          ELSE 'violation_removed' END,
        closed_at = now(), decision_version = decision_version + 1, updated_at = now()
    WHERE id = v_case_id;
  ELSIF NEW.status = 'legal_hold' THEN
    UPDATE public.moderation_cases
    SET state = 'escalated', resolution = NULL, closed_at = NULL,
        legal_hold = true, decision_version = decision_version + 1, updated_at = now()
    WHERE id = v_case_id;
  ELSIF NEW.status = 'pending_review' AND OLD.status = 'rejected' THEN
    UPDATE public.moderation_cases
    SET state = 'appeal_open', resolution = NULL, closed_at = NULL,
        decision_version = decision_version + 1, updated_at = now()
    WHERE id = v_case_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER moderation_items_sync_active_case
  AFTER UPDATE OF status ON public.moderation_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_active_moderation_case();

CREATE TRIGGER moderation_cases_updated_at
  BEFORE UPDATE ON public.moderation_cases
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.attach_moderation_case_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.case_id IS NULL THEN
    SELECT moderation_case.id, moderation_case.revision_id
    INTO NEW.case_id, NEW.revision_id
    FROM public.moderation_cases moderation_case
    WHERE moderation_case.moderation_item_id = NEW.moderation_item_id
    ORDER BY moderation_case.created_at DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER moderation_events_attach_case_context
  BEFORE INSERT ON public.moderation_events
  FOR EACH ROW EXECUTE FUNCTION public.attach_moderation_case_context();
CREATE TRIGGER moderation_appeals_attach_case_context
  BEFORE INSERT ON public.moderation_appeals
  FOR EACH ROW EXECUTE FUNCTION public.attach_moderation_case_context();

DROP FUNCTION public.submit_moderation_report(uuid, text, uuid, text, text);

CREATE FUNCTION public.submit_moderation_report(
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
  v_item public.moderation_items%ROWTYPE;
  v_case public.moderation_cases%ROWTYPE;
  v_report_id uuid;
  v_existing_report public.moderation_reports%ROWTYPE;
  v_previous_restored boolean := false;
  v_should_hide boolean := true;
  v_report_count integer;
  v_snapshot jsonb;
  v_media_references jsonb := '[]'::jsonb;
  v_priority text;
  v_now timestamptz := now();
BEGIN
  IF p_entity_type NOT IN ('community_post', 'community_comment') THEN
    RAISE EXCEPTION 'unsupported report entity';
  END IF;
  IF p_reason_code NOT IN (
    'spam', 'harassment', 'hate', 'violence', 'sexual_content',
    'personal_information', 'fraud', 'illegal_content', 'other'
  ) THEN RAISE EXCEPTION 'invalid report reason'; END IF;
  IF p_details IS NOT NULL AND char_length(p_details) > 500 THEN
    RAISE EXCEPTION 'report details are too long';
  END IF;
  IF p_reason_code = 'other' AND char_length(COALESCE(trim(p_details), '')) < 10 THEN
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
    RETURN jsonb_build_object(
      'reportId', v_existing_report.id,
      'caseId', v_existing_report.case_id,
      'contentStatus', v_content_status,
      'moderationStatus', v_moderation_status,
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
    SELECT author_id, content, status::text, moderation_status, active_revision_id
    INTO v_author_id, v_content, v_content_status, v_moderation_status, v_active_revision_id
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
        'audience', revision.audience, 'vehicleId', revision.vehicle_id,
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

  UPDATE public.moderation_cases
  SET state = CASE WHEN v_should_hide AND state = 'monitoring' THEN 'open' ELSE state END,
      priority = CASE WHEN v_priority = 'urgent' THEN 'urgent' ELSE priority END,
      last_reported_at = v_now,
      updated_at = v_now
  WHERE id = v_case.id;

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
          moderation_reason = p_reason_code, moderation_checked_at = v_now,
          moderation_version = 'perfectppi-moderation-v2'
      WHERE id = p_entity_id;
    ELSE
      UPDATE public.community_comments
      SET status = 'hidden', moderation_status = 'pending_review',
          moderation_reason = p_reason_code, moderation_checked_at = v_now,
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
    'contentStatus', CASE WHEN v_should_hide THEN 'hidden' ELSE v_content_status END,
    'moderationStatus', CASE WHEN v_should_hide THEN 'pending_review' ELSE v_moderation_status END,
    'duplicate', false
  );
END;
$$;

ALTER TABLE public.community_post_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comment_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.community_post_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.community_comment_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.moderation_cases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.moderation_evidence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.moderation_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.community_post_revisions TO service_role;
GRANT SELECT, INSERT ON public.community_comment_revisions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.moderation_cases TO service_role;
GRANT SELECT, INSERT ON public.moderation_evidence TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.moderation_outbox TO service_role;
REVOKE UPDATE, DELETE ON public.moderation_reports FROM service_role;
REVOKE UPDATE, DELETE ON public.moderation_evidence FROM service_role;

REVOKE ALL ON FUNCTION public.capture_community_post_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.persist_community_post_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_community_comment_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.persist_community_comment_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_moderation_history_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_active_moderation_case() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_moderation_case_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_moderation_report(uuid, text, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_moderation_report(uuid, text, uuid, uuid, text, text, text)
  TO service_role;

COMMENT ON TABLE public.community_post_revisions IS
  'Immutable published snapshots of Community posts used for editing and moderation evidence.';
COMMENT ON TABLE public.community_comment_revisions IS
  'Immutable published snapshots of Community comments used for editing and moderation evidence.';
COMMENT ON TABLE public.moderation_cases IS
  'Canonical revision-specific moderation lifecycle. moderation_items is the current compatibility aggregate.';
COMMENT ON TABLE public.moderation_evidence IS
  'Restricted immutable evidence captured when a revision first enters a moderation case.';
COMMENT ON TABLE public.moderation_outbox IS
  'Durable idempotent work queue for moderation notifications and SLA handling.';

COMMIT;
