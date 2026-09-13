-- Optional author-written descriptions let assistive technology describe
-- Community photos without inventing uncertain automatic captions.
ALTER TABLE public.community_post_media
  ADD COLUMN IF NOT EXISTS alt_text text;

ALTER TABLE public.community_post_media
  DROP CONSTRAINT IF EXISTS community_post_media_alt_text_length_check;

ALTER TABLE public.community_post_media
  ADD CONSTRAINT community_post_media_alt_text_length_check
  CHECK (alt_text IS NULL OR char_length(alt_text) BETWEEN 1 AND 300);

COMMENT ON COLUMN public.community_post_media.alt_text IS
  'Optional author-provided image description for assistive technology; NULL marks media as having no description.';
