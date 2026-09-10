BEGIN;

-- ---------------------------------------------------------------------------
-- Private-by-default Community media with status-aware delivery (plan 19.2).
--
-- Approved media no longer lives at a permanent public R2 URL. `url` keeps
-- holding the canonical storage reference (quarantine while pending, then an
-- immutable hash-keyed private object once approved); `display_reference`
-- points at the re-encoded, metadata-stripped variant that ordinary viewers
-- receive through /api/community/media/{id}/display. Legacy public URLs are
-- retired by an idempotent worker and recorded so their removal can be
-- verified before the social beta opens.
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_post_media
  ADD COLUMN display_reference text,
  ADD COLUMN content_sha256 text,
  ADD COLUMN legacy_public_url text,
  ADD COLUMN storage_migrated_at timestamptz;

ALTER TABLE public.community_post_media
  DROP CONSTRAINT IF EXISTS community_post_media_url_check;
ALTER TABLE public.community_post_media
  ADD CONSTRAINT community_post_media_url_check CHECK (
    url ~ '^https://'
    OR url ~ '^r2-private:///quarantine/'
    OR url ~ '^r2-private:///community_post/'
  ),
  ADD CONSTRAINT community_post_media_display_reference_check CHECK (
    display_reference IS NULL OR display_reference ~ '^r2-private:///community_post/'
  ),
  ADD CONSTRAINT community_post_media_content_sha256_check CHECK (
    content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'
  ),
  ADD CONSTRAINT community_post_media_legacy_public_url_check CHECK (
    legacy_public_url IS NULL OR legacy_public_url ~ '^https://'
  );

-- The migration worker and the launch readiness check both ask "how many
-- Community objects still resolve publicly?"; keep that cheap.
CREATE INDEX community_post_media_legacy_public_idx
  ON public.community_post_media(created_at)
  WHERE url ~ '^https://';

-- Every restricted-evidence read is audited (plan 18.1 / 31.2).
ALTER TABLE public.moderation_events
  DROP CONSTRAINT IF EXISTS moderation_events_event_type_check;
ALTER TABLE public.moderation_events
  ADD CONSTRAINT moderation_events_event_type_check CHECK (event_type IN (
    'submitted', 'auto_allowed', 'auto_blocked', 'escalated', 'reported',
    'manual_approved', 'manual_rejected', 'legal_hold_applied',
    'user_warned', 'posting_hold_applied', 'appeal_opened', 'appeal_resolved',
    'report_created', 'case_auto_hidden', 'case_claimed', 'case_claim_expired',
    'content_restored', 'content_removed', 'legal_hold_released',
    'appeal_decided', 'enforcement_applied', 'media_restricted', 'evidence_purged',
    'evidence_accessed'
  ));

-- Launch readiness (plan 19.2, 39): the beta must not open while any
-- Community object still has a permanent public URL.
CREATE OR REPLACE FUNCTION public.community_media_storage_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'legacyPublicObjects', (
      SELECT count(*) FROM public.community_post_media WHERE url ~ '^https://'
    ),
    'privateObjects', (
      SELECT count(*) FROM public.community_post_media WHERE url ~ '^r2-private:///community_post/'
    ),
    'quarantinedObjects', (
      SELECT count(*) FROM public.community_post_media WHERE url ~ '^r2-private:///quarantine/'
    ),
    'unverifiedRetirements', (
      SELECT count(*) FROM public.community_post_media
      WHERE legacy_public_url IS NOT NULL AND storage_migrated_at IS NULL
    )
  );
$$;
REVOKE ALL ON FUNCTION public.community_media_storage_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_media_storage_status() TO service_role;

COMMENT ON COLUMN public.community_post_media.url IS
  'Canonical storage reference: quarantine while pending, immutable private object once approved, https legacy only until migrated.';
COMMENT ON COLUMN public.community_post_media.display_reference IS
  'Private re-encoded, metadata-stripped variant served to ordinary viewers.';
COMMENT ON COLUMN public.community_post_media.legacy_public_url IS
  'Retired permanent public URL, kept until its removal is verified.';

COMMIT;
