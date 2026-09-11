\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('6c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gt-owner@example.test', '', '{}', '{"username":"GtOwner"}', now(), now()),
  ('6c000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gt-mod@example.test', '', '{}', '{"username":"GtMod"}', now(), now()),
  ('6c000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gt-author@example.test', '', '{}', '{"username":"GtAuthor"}', now(), now()),
  ('6c000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gt-reader@example.test', '', '{}', '{"username":"GtReader"}', now(), now()),
  ('6c000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gt-outsider@example.test', '', '{}', '{"username":"GtOutsider"}', now(), now());

UPDATE public.profiles SET role = 'admin' WHERE auth_user_id = '6c000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET is_public = true WHERE auth_user_id::text LIKE '6c000000-%';

CREATE TEMP TABLE gt AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '6c000000-0000-0000-0000-000000000001') AS owner_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '6c000000-0000-0000-0000-000000000002') AS mod_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '6c000000-0000-0000-0000-000000000003') AS author_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '6c000000-0000-0000-0000-000000000004') AS reader_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '6c000000-0000-0000-0000-000000000005') AS outsider_id,
  NULL::uuid AS group_id;

DO $$
DECLARE created public.community_groups;
BEGIN
  created := public.create_curated_community_group(
    (SELECT owner_id FROM gt), 'brake-tech', 'Brake Tech',
    'Everything brakes.', 'technical', ARRAY['Be factual'], NULL, NULL, NULL, NULL
  );
  UPDATE gt SET group_id = created.id;
END
$$;

SELECT public.join_curated_community_group(mod_id, group_id) FROM gt;
SELECT public.join_curated_community_group(author_id, group_id) FROM gt;
SELECT public.join_curated_community_group(reader_id, group_id) FROM gt;

INSERT INTO public.community_posts (id, author_id, group_id, content, audience, status, moderation_status)
SELECT '6d000000-0000-0000-0000-000000000001', author_id, group_id, 'Brake bleeding sequence for ABS cars', 'public', 'active', 'active' FROM gt;
INSERT INTO public.community_posts (id, author_id, group_id, content, audience, status, moderation_status)
SELECT '6d000000-0000-0000-0000-000000000002', reader_id, group_id, 'Rotor runout tolerance thread', 'public', 'active', 'active' FROM gt;
INSERT INTO public.community_posts (id, author_id, group_id, content, audience, status, moderation_status)
SELECT '6d000000-0000-0000-0000-000000000003', reader_id, group_id, 'Pad bedding procedure', 'public', 'active', 'active' FROM gt;
INSERT INTO public.community_posts (id, author_id, group_id, content, audience, status, moderation_status)
SELECT '6d000000-0000-0000-0000-000000000004', reader_id, group_id, 'Caliper rebuild kit sources', 'public', 'active', 'active' FROM gt;

-- ---------------------------------------------------------------------------
-- 1. Roles: only the owner assigns; a plain member has no tools at all.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean := false;
  r jsonb;
BEGIN
  BEGIN
    PERFORM public.set_group_post_pinned((SELECT reader_id FROM gt), '6d000000-0000-0000-0000-000000000001', true);
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'a member must not pin'; END IF;

  r := public.set_group_member_role((SELECT owner_id FROM gt), (SELECT group_id FROM gt), (SELECT mod_id FROM gt), 'moderator');
  IF r->>'role' <> 'moderator' OR (r->>'changed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'promotion failed: %', r; END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT mod_id FROM gt) AND type = 'group_role_changed') <> 1 THEN
    RAISE EXCEPTION 'new moderator should be told';
  END IF;

  hit := false;
  BEGIN
    PERFORM public.set_group_member_role((SELECT mod_id FROM gt), (SELECT group_id FROM gt), (SELECT reader_id FROM gt), 'moderator');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'moderators must not assign roles'; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Pins: moderators pin, max three, pinned posts leave the chronological list.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean := false;
BEGIN
  PERFORM public.set_group_post_pinned((SELECT mod_id FROM gt), '6d000000-0000-0000-0000-000000000001', true);
  PERFORM public.set_group_post_pinned((SELECT mod_id FROM gt), '6d000000-0000-0000-0000-000000000002', true);
  PERFORM public.set_group_post_pinned((SELECT mod_id FROM gt), '6d000000-0000-0000-0000-000000000003', true);
  BEGIN
    PERFORM public.set_group_post_pinned((SELECT mod_id FROM gt), '6d000000-0000-0000-0000-000000000004', true);
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'fourth pin should be refused'; END IF;

  IF (SELECT count(*) FROM public.social_visible_community_group_pinned_post_ids((SELECT reader_id FROM gt), (SELECT group_id FROM gt))) <> 3 THEN
    RAISE EXCEPTION 'three pinned posts expected';
  END IF;
  IF (SELECT count(*) FROM public.social_visible_community_group_post_ids((SELECT reader_id FROM gt), (SELECT group_id FROM gt))) <> 1 THEN
    RAISE EXCEPTION 'chronological list should exclude pinned posts';
  END IF;
  IF (SELECT count(*) FROM public.social_visible_community_group_post_ids((SELECT reader_id FROM gt), (SELECT group_id FROM gt), 20, 0, false)) <> 4 THEN
    RAISE EXCEPTION 'unfiltered list should include everything';
  END IF;
  PERFORM public.set_group_post_pinned((SELECT mod_id FROM gt), '6d000000-0000-0000-0000-000000000002', false);
  PERFORM public.set_group_post_pinned((SELECT mod_id FROM gt), '6d000000-0000-0000-0000-000000000003', false);
  IF (SELECT count(*) FROM public.community_group_moderation_events WHERE action IN ('post_pinned', 'post_unpinned')) <> 5 THEN
    RAISE EXCEPTION 'every pin change must be audited';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Destination removal (13.7): hidden from the group, platform untouched,
--    author told neutrally, restorable; works after the author left.
-- ---------------------------------------------------------------------------
SELECT public.leave_curated_community_group(author_id, group_id) FROM gt;
DO $$
DECLARE
  r jsonb;
  p public.community_posts%ROWTYPE;
BEGIN
  r := public.set_group_post_destination((SELECT mod_id FROM gt), '6d000000-0000-0000-0000-000000000001', 'group_removed', 'Off topic');
  IF (r->>'changed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'removal failed: %', r; END IF;
  SELECT * INTO p FROM public.community_posts WHERE id = '6d000000-0000-0000-0000-000000000001';
  IF p.group_status <> 'group_removed' OR p.status <> 'active' OR p.moderation_status <> 'active' OR p.group_pinned_at IS NOT NULL THEN
    RAISE EXCEPTION 'group removal must not touch platform state and must unpin: %/%/%', p.group_status, p.status, p.moderation_status;
  END IF;
  IF public.social_can_view_community_post((SELECT reader_id FROM gt), '6d000000-0000-0000-0000-000000000001', false) THEN
    RAISE EXCEPTION 'removed group post still visible';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT author_id FROM gt) AND type = 'group_post_removed'
      AND body LIKE '%not a PerfectPPI policy decision%' AND body LIKE '%Off topic%') <> 1 THEN
    RAISE EXCEPTION 'author should get one neutral notice with the reason';
  END IF;
  r := public.set_group_post_destination((SELECT mod_id FROM gt), '6d000000-0000-0000-0000-000000000001', 'active');
  IF NOT public.social_can_view_community_post((SELECT reader_id FROM gt), '6d000000-0000-0000-0000-000000000001', false) THEN
    RAISE EXCEPTION 'restore failed';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Members: moderators remove, only the owner bans/unbans; nobody touches
--    the owner; a banned member cannot rejoin until unbanned.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean := false;
  r jsonb;
BEGIN
  BEGIN
    PERFORM public.set_group_member_status((SELECT mod_id FROM gt), (SELECT group_id FROM gt), (SELECT owner_id FROM gt), 'removed');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'the owner must be untouchable'; END IF;

  hit := false;
  BEGIN
    PERFORM public.set_group_member_status((SELECT mod_id FROM gt), (SELECT group_id FROM gt), (SELECT reader_id FROM gt), 'banned');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'moderators must not ban'; END IF;

  r := public.set_group_member_status((SELECT mod_id FROM gt), (SELECT group_id FROM gt), (SELECT reader_id FROM gt), 'removed');
  IF r->>'status' <> 'removed' THEN RAISE EXCEPTION 'removal failed: %', r; END IF;
  IF (SELECT group_pinned_at FROM public.community_posts WHERE id = '6d000000-0000-0000-0000-000000000004') IS NOT NULL THEN
    RAISE EXCEPTION 'removed member pins should come down';
  END IF;
  -- A removed member may rejoin an open group.
  IF NOT public.join_curated_community_group((SELECT reader_id FROM gt), (SELECT group_id FROM gt)) THEN
    RAISE EXCEPTION 'removed member should be able to rejoin';
  END IF;

  r := public.set_group_member_status((SELECT owner_id FROM gt), (SELECT group_id FROM gt), (SELECT reader_id FROM gt), 'banned', 'Repeated spam');
  hit := false;
  BEGIN
    PERFORM public.join_curated_community_group((SELECT reader_id FROM gt), (SELECT group_id FROM gt));
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'group unavailable';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'banned member rejoined'; END IF;

  -- Banning someone who was never a member is allowed (pre-emptive).
  r := public.set_group_member_status((SELECT owner_id FROM gt), (SELECT group_id FROM gt), (SELECT outsider_id FROM gt), 'banned');
  IF r->>'status' <> 'banned' THEN RAISE EXCEPTION 'pre-emptive ban failed'; END IF;

  r := public.set_group_member_status((SELECT owner_id FROM gt), (SELECT group_id FROM gt), (SELECT reader_id FROM gt), 'active');
  IF r->>'status' <> 'removed' THEN RAISE EXCEPTION 'unban should leave the member out until they rejoin: %', r; END IF;
  IF NOT public.join_curated_community_group((SELECT reader_id FROM gt), (SELECT group_id FROM gt)) THEN
    RAISE EXCEPTION 'unbanned member should be able to rejoin';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Member list: roles first, blocked members hidden from the viewer.
-- ---------------------------------------------------------------------------
INSERT INTO public.profile_blocks (blocker_id, blocked_id) SELECT reader_id, mod_id FROM gt;
DO $$
DECLARE
  first_role public.community_group_role;
BEGIN
  SELECT role INTO first_role FROM public.list_group_members((SELECT reader_id FROM gt), (SELECT group_id FROM gt)) LIMIT 1;
  IF first_role <> 'owner' THEN RAISE EXCEPTION 'owner should list first'; END IF;
  IF EXISTS (SELECT 1 FROM public.list_group_members((SELECT reader_id FROM gt), (SELECT group_id FROM gt)) WHERE profile_id = (SELECT mod_id FROM gt)) THEN
    RAISE EXCEPTION 'blocked member leaked into the member list';
  END IF;
  IF (SELECT count(*) FROM public.list_group_members((SELECT owner_id FROM gt), (SELECT group_id FROM gt))) <> 3 THEN
    RAISE EXCEPTION 'owner should see owner, moderator, reader';
  END IF;
END
$$;
DELETE FROM public.profile_blocks WHERE blocker_id = (SELECT reader_id FROM gt);

-- ---------------------------------------------------------------------------
-- 6. Search within the group: visibility applied, metacharacters literal.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.search_group_posts((SELECT reader_id FROM gt), (SELECT group_id FROM gt), 'BRAKE')) <> 1 THEN
    RAISE EXCEPTION 'case-insensitive search should find the brake post';
  END IF;
  IF (SELECT count(*) FROM public.search_group_posts((SELECT reader_id FROM gt), (SELECT group_id FROM gt), '%')) <> 0 THEN
    RAISE EXCEPTION 'single-character / metacharacter queries return nothing';
  END IF;
  IF (SELECT count(*) FROM public.search_group_posts((SELECT reader_id FROM gt), (SELECT group_id FROM gt), 'ro%')) <> 0 THEN
    RAISE EXCEPTION 'percent must be literal';
  END IF;
  PERFORM public.set_group_post_destination((SELECT mod_id FROM gt), '6d000000-0000-0000-0000-000000000001', 'group_removed');
  IF (SELECT count(*) FROM public.search_group_posts((SELECT reader_id FROM gt), (SELECT group_id FROM gt), 'brake')) <> 0 THEN
    RAISE EXCEPTION 'search must respect destination removal';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 7. Ownership transfer and archive: exactly one owner, only the owner
--    archives, an archived group accepts no posts.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean := false;
  r jsonb;
BEGIN
  BEGIN
    PERFORM public.archive_group((SELECT mod_id FROM gt), (SELECT group_id FROM gt));
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'moderators must not archive'; END IF;

  r := public.transfer_group_ownership((SELECT owner_id FROM gt), (SELECT group_id FROM gt), (SELECT mod_id FROM gt));
  IF (SELECT count(*) FROM public.community_group_memberships WHERE group_id = (SELECT group_id FROM gt) AND role = 'owner' AND status = 'active') <> 1 THEN
    RAISE EXCEPTION 'exactly one owner expected after transfer';
  END IF;
  IF public.community_group_role_of((SELECT owner_id FROM gt), (SELECT group_id FROM gt)) <> 'moderator'
     OR public.community_group_role_of((SELECT mod_id FROM gt), (SELECT group_id FROM gt)) <> 'owner' THEN
    RAISE EXCEPTION 'roles did not swap';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT mod_id FROM gt) AND type = 'group_role_changed' AND data->>'role' = 'owner') <> 1 THEN
    RAISE EXCEPTION 'new owner should be told';
  END IF;

  r := public.archive_group((SELECT mod_id FROM gt), (SELECT group_id FROM gt), 'Merged into another group');
  IF (SELECT status FROM public.community_groups WHERE id = (SELECT group_id FROM gt)) <> 'archived' THEN
    RAISE EXCEPTION 'archive failed';
  END IF;
  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
    SELECT reader_id, group_id, 'Late post', 'public', 'active', 'active' FROM gt;
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'group unavailable';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'archived group accepted a post'; END IF;
  IF (SELECT count(*) FROM public.community_posts WHERE group_id = (SELECT group_id FROM gt)) <> 4 THEN
    RAISE EXCEPTION 'archiving must preserve posts';
  END IF;
  IF (SELECT count(*) FROM public.community_group_moderation_events WHERE group_id = (SELECT group_id FROM gt) AND action = 'group_archived') <> 1 THEN
    RAISE EXCEPTION 'archive must be audited';
  END IF;
END
$$;

-- Nothing here is client-callable.
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.set_group_post_pinned(uuid,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.transfer_group_ownership(uuid,uuid,uuid)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.community_group_moderation_events', 'SELECT') THEN
    RAISE EXCEPTION 'group tools leaked to authenticated clients';
  END IF;
END
$$;

ROLLBACK;
