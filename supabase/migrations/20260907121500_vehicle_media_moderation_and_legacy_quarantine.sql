ALTER TABLE public.vehicle_media
  ADD COLUMN moderation_status text NOT NULL DEFAULT 'pending_scan'
    CHECK (moderation_status IN ('pending_scan', 'active', 'pending_review', 'rejected', 'legal_hold')),
  ADD COLUMN moderation_reason text,
  ADD COLUMN moderation_checked_at timestamptz,
  ADD COLUMN moderation_version text,
  ADD COLUMN content_type text CHECK (content_type IS NULL OR content_type ~ '^(image|video)/');

-- Existing media predates specialist scanning and must not remain implicitly trusted.
UPDATE public.vehicle_media SET moderation_status = 'pending_review';
UPDATE public.community_post_media
SET moderation_status = 'pending_review', moderation_reason = 'legacy_unscanned'
WHERE moderation_checked_at IS NULL;
UPDATE public.community_posts
SET status = 'hidden', moderation_status = 'pending_review', moderation_reason = 'legacy_unscanned'
WHERE moderation_checked_at IS NULL;
UPDATE public.community_comments
SET status = 'hidden', moderation_status = 'pending_review', moderation_reason = 'legacy_unscanned'
WHERE moderation_checked_at IS NULL;

ALTER TABLE public.community_posts ALTER COLUMN moderation_status SET DEFAULT 'pending_scan';
ALTER TABLE public.community_comments ALTER COLUMN moderation_status SET DEFAULT 'pending_scan';
ALTER TABLE public.community_post_media ALTER COLUMN moderation_status SET DEFAULT 'pending_scan';

ALTER TABLE public.moderation_items DROP CONSTRAINT IF EXISTS moderation_items_entity_type_check;
ALTER TABLE public.moderation_items ADD CONSTRAINT moderation_items_entity_type_check
  CHECK (entity_type IN ('community_post', 'community_comment', 'community_post_media', 'vehicle_media'));

-- Make every legacy item visible to the review queue. Existing moderation rows
-- are preserved; only records without an audit item are backfilled.
INSERT INTO public.moderation_items (
  entity_type, entity_id, author_id, status, risk_level, decision,
  reason_codes, content_preview, model_provider, model_version, raw_result
)
SELECT 'community_post', post.id, post.author_id, 'pending_review', 'medium', 'review',
  ARRAY['legacy_unscanned'], left(post.content, 500), 'migration',
  'perfectppi-moderation-v1', '{"legacy":true}'::jsonb
FROM public.community_posts post
WHERE post.moderation_checked_at IS NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;

INSERT INTO public.moderation_items (
  entity_type, entity_id, author_id, status, risk_level, decision,
  reason_codes, content_preview, model_provider, model_version, raw_result
)
SELECT 'community_comment', comment.id, comment.author_id, 'pending_review', 'medium', 'review',
  ARRAY['legacy_unscanned'], left(comment.content, 500), 'migration',
  'perfectppi-moderation-v1', '{"legacy":true}'::jsonb
FROM public.community_comments comment
WHERE comment.moderation_checked_at IS NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;

INSERT INTO public.moderation_items (
  entity_type, entity_id, author_id, status, risk_level, decision,
  reason_codes, content_preview, model_provider, model_version, raw_result
)
SELECT 'community_post_media', media.id, media.uploader_id, 'pending_review', 'medium', 'review',
  ARRAY['legacy_unscanned'], media.media_type::text || ' legacy upload', 'migration',
  'perfectppi-moderation-v1', '{"legacy":true}'::jsonb
FROM public.community_post_media media
WHERE media.moderation_checked_at IS NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;

INSERT INTO public.moderation_items (
  entity_type, entity_id, author_id, status, risk_level, decision,
  reason_codes, content_preview, model_provider, model_version, raw_result
)
SELECT 'vehicle_media', media.id, vehicle.owner_id, 'pending_review', 'medium', 'review',
  ARRAY['legacy_unscanned'], media.media_type::text || ' legacy vehicle upload', 'migration',
  'perfectppi-moderation-v1', '{"legacy":true}'::jsonb
FROM public.vehicle_media media
JOIN public.vehicles vehicle ON vehicle.id = media.vehicle_id
ON CONFLICT (entity_type, entity_id) DO NOTHING;

DROP POLICY IF EXISTS vehicle_media_select ON public.vehicle_media;
CREATE POLICY vehicle_media_select ON public.vehicle_media FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_media.vehicle_id
      AND (
        v.owner_id = public.get_my_profile_id()
        OR (v.visibility = 'public' AND vehicle_media.moderation_status = 'active')
      )
  )
);

CREATE OR REPLACE FUNCTION public.apply_vehicle_media_review(
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
  vehicle_id_value uuid;
  now_at timestamptz := now();
  action_name text;
  action_ends_at timestamptz;
BEGIN
  IF p_next_status NOT IN ('active', 'rejected', 'legal_hold')
     OR p_next_decision NOT IN ('allow', 'block', 'legal_hold')
     OR p_enforcement NOT IN ('none', 'warning', 'posting_hold', 'media_hold', 'suspension') THEN
    RAISE EXCEPTION 'invalid moderation review input';
  END IF;

  SELECT * INTO item FROM public.moderation_items
  WHERE id = p_item_id AND entity_type = 'vehicle_media'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vehicle moderation item not found'; END IF;

  SELECT role INTO reviewer_role FROM public.profiles WHERE id = p_reviewer_id;
  IF reviewer_role <> 'admin' THEN RAISE EXCEPTION 'admin reviewer required'; END IF;
  IF item.status = 'legal_hold' OR p_next_status = 'legal_hold' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.moderation_legal_hold_reviewers WHERE profile_id = p_reviewer_id
    ) THEN
      RAISE EXCEPTION 'legal hold reviewer required';
    END IF;
  END IF;

  SELECT vehicle_id INTO vehicle_id_value FROM public.vehicle_media WHERE id = item.entity_id;
  IF vehicle_id_value IS NULL THEN RAISE EXCEPTION 'moderated vehicle media not found'; END IF;

  IF p_next_status = 'active' THEN
    UPDATE public.vehicle_media SET is_primary = false
    WHERE vehicle_id = vehicle_id_value AND id <> item.entity_id;
  END IF;
  UPDATE public.vehicle_media
  SET moderation_status = p_next_status,
      moderation_checked_at = now_at,
      moderation_version = 'perfectppi-moderation-v1',
      moderation_reason = CASE WHEN p_next_status = 'active' THEN NULL ELSE item.reason_codes[1] END,
      is_primary = CASE WHEN p_next_status = 'active' THEN true ELSE false END,
      url = COALESCE(p_media_url, url)
  WHERE id = item.entity_id;

  UPDATE public.moderation_items
  SET status = p_next_status,
      decision = p_next_decision,
      evidence_reference = CASE WHEN p_next_status = 'legal_hold'
        THEN COALESCE(item.evidence_reference,
          (SELECT url FROM public.vehicle_media WHERE id = item.entity_id))
        ELSE item.evidence_reference END,
      risk_level = CASE WHEN p_next_status = 'active' THEN 'none'
        WHEN p_next_status = 'legal_hold' THEN 'critical' ELSE 'high' END,
      decided_by = p_reviewer_id,
      decided_at = now_at
  WHERE id = item.id;

  INSERT INTO public.moderation_events (
    moderation_item_id, actor_type, actor_id, event_type,
    previous_status, next_status, notes
  ) VALUES (
    item.id, 'admin', p_reviewer_id,
    CASE WHEN p_next_status = 'active' THEN 'manual_approved'
      WHEN p_next_status = 'legal_hold' THEN 'legal_hold_applied'
      ELSE 'manual_rejected' END,
    item.status, p_next_status, p_notes
  );

  IF p_enforcement <> 'none' AND item.author_id IS NOT NULL THEN
    action_name := CASE WHEN p_enforcement = 'posting_hold' THEN 'temporary_posting_hold'
      WHEN p_enforcement = 'media_hold' THEN 'media_upload_hold' ELSE p_enforcement END;
    action_ends_at := CASE WHEN p_enforcement = 'warning'
      THEN NULL ELSE now_at + interval '7 days' END;
    INSERT INTO public.user_enforcement_actions (
      profile_id, action_type, reason_code,
      related_moderation_item_id, ends_at, created_by
    ) VALUES (
      item.author_id, action_name, COALESCE(item.reason_codes[1], 'community_guidelines'),
      item.id, action_ends_at, p_reviewer_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_vehicle_media_review(uuid, uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_vehicle_media_review(uuid, uuid, text, text, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_vehicle_media_legal_hold_deletion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.moderation_items
    WHERE entity_type = 'vehicle_media' AND entity_id = OLD.id AND status = 'legal_hold'
  ) THEN
    RAISE EXCEPTION 'legal-hold vehicle media cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER vehicle_media_preserve_legal_hold
  BEFORE DELETE ON public.vehicle_media
  FOR EACH ROW EXECUTE FUNCTION public.prevent_vehicle_media_legal_hold_deletion();
