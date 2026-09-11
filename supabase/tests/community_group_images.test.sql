\set ON_ERROR_STOP on
BEGIN;

-- Plan 13.5: group avatar / cover are set by the owner or an admin through
-- one audited RPC; moderators and members cannot.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('7b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gi-owner@example.test', '', '{}', '{"username":"GiOwner"}', now(), now()),
  ('7b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gi-admin@example.test', '', '{}', '{"username":"GiAdmin"}', now(), now()),
  ('7b000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gi-mod@example.test', '', '{}', '{"username":"GiMod"}', now(), now());
UPDATE public.profiles SET is_public = true, created_at = now() - interval '30 days' WHERE auth_user_id::text LIKE '7b000000-%';

CREATE TEMP TABLE gi AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '7b000000-0000-0000-0000-000000000001') AS owner,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7b000000-0000-0000-0000-000000000002') AS admin_member,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7b000000-0000-0000-0000-000000000003') AS moderator,
  NULL::uuid AS group_id;

DO $$
DECLARE
  g public.community_groups;
  hit boolean;
BEGIN
  g := public.create_community_group((SELECT owner FROM gi), 'image-club', 'Image Club', 'Pictures.', 'general');
  UPDATE gi SET group_id = g.id;
  PERFORM public.join_curated_community_group((SELECT admin_member FROM gi), g.id);
  PERFORM public.join_curated_community_group((SELECT moderator FROM gi), g.id);
  PERFORM public.set_group_member_role((SELECT owner FROM gi), g.id, (SELECT admin_member FROM gi), 'admin');
  PERFORM public.set_group_member_role((SELECT owner FROM gi), g.id, (SELECT moderator FROM gi), 'moderator');

  g := public.set_community_group_image((SELECT owner FROM gi), g.id, 'avatar', 'https://cdn.example.test/community_group/a.jpg');
  IF g.avatar_url <> 'https://cdn.example.test/community_group/a.jpg' THEN RAISE EXCEPTION 'owner should set the avatar'; END IF;
  g := public.set_community_group_image((SELECT admin_member FROM gi), g.id, 'cover', 'https://cdn.example.test/community_group/c.jpg');
  IF g.cover_url <> 'https://cdn.example.test/community_group/c.jpg' THEN RAISE EXCEPTION 'admins should set the cover'; END IF;

  hit := false;
  BEGIN
    PERFORM public.set_community_group_image((SELECT moderator FROM gi), g.id, 'avatar', 'https://cdn.example.test/x.jpg');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'moderators must not change images'; END IF;

  hit := false;
  BEGIN
    PERFORM public.set_community_group_image((SELECT owner FROM gi), g.id, 'avatar', 'r2-private:///quarantine/community_group/x.jpg');
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'only promoted https objects may be applied'; END IF;

  hit := false;
  BEGIN
    PERFORM public.set_community_group_image((SELECT owner FROM gi), g.id, 'banner', 'https://cdn.example.test/x.jpg');
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'unknown kinds are refused'; END IF;

  g := public.set_community_group_image((SELECT owner FROM gi), g.id, 'avatar', NULL);
  IF g.avatar_url IS NOT NULL THEN RAISE EXCEPTION 'NULL clears the image'; END IF;

  IF (SELECT count(*) FROM public.community_group_moderation_events
      WHERE group_id = g.id AND action = 'settings_changed' AND metadata ? 'avatar_url') <> 2 THEN
    RAISE EXCEPTION 'image changes must be audited';
  END IF;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.set_community_group_image(uuid,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'group image RPC leaked to clients';
  END IF;
END
$$;

ROLLBACK;
