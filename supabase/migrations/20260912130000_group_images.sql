-- Plan 13.5: group avatar and cover images. Uploads take the same road as
-- vehicle photos — quarantine, safety gate, promotion to a public object —
-- and the URL is written through one audited RPC by the owner or an admin.
-- Anything the gate does not clear is never applied; blocked and held
-- objects are recorded as moderation items so evidence handling applies.

BEGIN;

ALTER TABLE public.community_upload_reservations
  ADD COLUMN group_id uuid REFERENCES public.community_groups(id) ON DELETE CASCADE;
CREATE INDEX community_upload_reservations_group_idx
  ON public.community_upload_reservations(group_id)
  WHERE group_id IS NOT NULL;

ALTER TABLE public.moderation_items DROP CONSTRAINT moderation_items_entity_type_check;
ALTER TABLE public.moderation_items ADD CONSTRAINT moderation_items_entity_type_check
  CHECK (entity_type IN ('community_post', 'community_comment', 'community_post_media', 'vehicle_media', 'community_group_image'));

-- Owner or admin sets (or clears, with NULL) the avatar or cover. The URL
-- must already be a promoted public object; the server enforces that.
CREATE FUNCTION public.set_community_group_image(
  p_actor_profile_id uuid,
  p_group_id uuid,
  p_kind text,
  p_url text
)
RETURNS public.community_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.community_group_role;
  v_before public.community_groups;
  v_group public.community_groups;
BEGIN
  v_role := public.community_group_require_moderator(p_actor_profile_id, p_group_id);
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only the owner or an admin can change group images' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_kind NOT IN ('avatar', 'cover') THEN
    RAISE EXCEPTION 'invalid image kind' USING ERRCODE = 'check_violation';
  END IF;
  IF p_url IS NOT NULL AND (char_length(p_url) > 2048 OR p_url !~ '^https://') THEN
    RAISE EXCEPTION 'invalid image url' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before FROM public.community_groups WHERE id = p_group_id FOR UPDATE;
  IF p_kind = 'avatar' THEN
    UPDATE public.community_groups SET avatar_url = p_url WHERE id = p_group_id RETURNING * INTO v_group;
  ELSE
    UPDATE public.community_groups SET cover_url = p_url WHERE id = p_group_id RETURNING * INTO v_group;
  END IF;

  PERFORM public.community_group_log(
    p_group_id, p_actor_profile_id, 'settings_changed', NULL, NULL, NULL,
    jsonb_build_object(
      p_kind || '_url',
      jsonb_build_array(
        CASE WHEN p_kind = 'avatar' THEN v_before.avatar_url ELSE v_before.cover_url END,
        p_url
      )
    )
  );
  RETURN v_group;
END;
$$;

REVOKE ALL ON FUNCTION public.set_community_group_image(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_group_image(uuid, uuid, text, text) TO service_role;

COMMIT;
