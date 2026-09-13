\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('b5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'group-cursor-owner@example.test', '', '{}', '{"username":"CursorOwner"}', now(), now()),
  ('b5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'group-cursor-admin@example.test', '', '{}', '{"username":"CursorAdmin"}', now(), now()),
  ('b5000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'group-cursor-mod@example.test', '', '{}', '{"username":"CursorMod"}', now(), now()),
  ('b5000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'group-cursor-member-a@example.test', '', '{}', '{"username":"CursorMemberA"}', now(), now()),
  ('b5000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'group-cursor-member-b@example.test', '', '{}', '{"username":"CursorMemberB"}', now(), now());

UPDATE public.profiles
SET is_public = true, created_at = now() - interval '30 days'
WHERE auth_user_id::text LIKE 'b5000000-%';

CREATE TEMP TABLE group_cursor_ids AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b5000000-0000-0000-0000-000000000001') owner_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b5000000-0000-0000-0000-000000000002') admin_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b5000000-0000-0000-0000-000000000003') mod_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b5000000-0000-0000-0000-000000000004') member_a_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = 'b5000000-0000-0000-0000-000000000005') member_b_id,
  'b5100000-0000-0000-0000-000000000001'::uuid group_id;

INSERT INTO public.community_groups (
  id, slug, name, description, category, rules, visibility, join_policy,
  status, is_staff_curated, created_by
)
SELECT group_id, 'cursor-pagination', 'Cursor Pagination', 'Cursor pagination test group.',
       'technical', ARRAY[]::text[], 'public', 'open', 'active', false, owner_id
FROM group_cursor_ids;

INSERT INTO public.community_group_memberships (group_id, profile_id, role, status, joined_at)
SELECT group_id, profile_id, role, 'active', joined_at
FROM group_cursor_ids
CROSS JOIN LATERAL (VALUES
  (owner_id, 'owner'::public.community_group_role, '2026-09-01 01:00:00+00'::timestamptz),
  (admin_id, 'admin'::public.community_group_role, '2026-09-01 02:00:00+00'::timestamptz),
  (mod_id, 'moderator'::public.community_group_role, '2026-09-01 03:00:00+00'::timestamptz),
  (member_a_id, 'member'::public.community_group_role, '2026-09-01 04:00:00+00'::timestamptz),
  (member_b_id, 'member'::public.community_group_role, '2026-09-01 05:00:00+00'::timestamptz)
) seed(profile_id, role, joined_at);

INSERT INTO public.community_posts (
  id, author_id, group_id, content, audience, status, moderation_status, created_at, group_pinned_at
)
SELECT post_id, owner_id, group_id, 'Cursor brake post ' || ordinal,
       'public', 'active', 'active', created_at, pinned_at
FROM group_cursor_ids
CROSS JOIN (VALUES
  ('b5200000-0000-0000-0000-000000000001'::uuid, 1, '2026-09-02 01:00:00+00'::timestamptz, NULL::timestamptz),
  ('b5200000-0000-0000-0000-000000000002'::uuid, 2, '2026-09-02 02:00:00+00'::timestamptz, NULL::timestamptz),
  ('b5200000-0000-0000-0000-000000000003'::uuid, 3, '2026-09-02 03:00:00+00'::timestamptz, NULL::timestamptz),
  ('b5200000-0000-0000-0000-000000000004'::uuid, 4, '2026-09-02 04:00:00+00'::timestamptz, NULL::timestamptz),
  ('b5200000-0000-0000-0000-000000000005'::uuid, 5, '2026-09-02 05:00:00+00'::timestamptz, '2026-09-02 05:30:00+00'::timestamptz)
) seed(post_id, ordinal, created_at, pinned_at);

CREATE TEMP TABLE group_post_boundary AS
SELECT post_id, created_at
FROM public.social_visible_community_group_post_ids_cursor(
  (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), 2
)
ORDER BY created_at DESC, post_id DESC
OFFSET 1 LIMIT 1;

CREATE TEMP TABLE group_search_boundary AS
SELECT post_id, created_at
FROM public.search_group_posts_cursor(
  (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), 'cursor brake', 2
)
ORDER BY created_at DESC, post_id DESC
OFFSET 1 LIMIT 1;

INSERT INTO public.community_posts (
  id, author_id, group_id, content, audience, status, moderation_status, created_at
)
SELECT 'b5200000-0000-0000-0000-000000000006', owner_id, group_id,
       'Cursor brake post inserted between pages', 'public', 'active', 'active', '2026-09-02 06:00:00+00'
FROM group_cursor_ids;

DO $$
BEGIN
  IF (SELECT post_id FROM group_post_boundary) <> 'b5200000-0000-0000-0000-000000000003' THEN
    RAISE EXCEPTION 'group-post boundary is wrong';
  END IF;
  IF (SELECT post_id FROM group_search_boundary) <> 'b5200000-0000-0000-0000-000000000004' THEN
    RAISE EXCEPTION 'group-search boundary is wrong';
  END IF;
  IF (SELECT array_agg(post_id ORDER BY created_at DESC, post_id DESC)
      FROM public.social_visible_community_group_post_ids_cursor(
        (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), 10,
        (SELECT created_at FROM group_post_boundary), (SELECT post_id FROM group_post_boundary)
      )) <> ARRAY[
        'b5200000-0000-0000-0000-000000000002'::uuid,
        'b5200000-0000-0000-0000-000000000001'::uuid
      ] THEN
    RAISE EXCEPTION 'group-post cursor duplicated, skipped, or admitted a newer/pinned post';
  END IF;
  IF (SELECT array_agg(post_id ORDER BY created_at DESC, post_id DESC)
      FROM public.search_group_posts_cursor(
        (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), 'CURSOR BRAKE', 10,
        (SELECT created_at FROM group_search_boundary), (SELECT post_id FROM group_search_boundary)
      )) <> ARRAY[
        'b5200000-0000-0000-0000-000000000003'::uuid,
        'b5200000-0000-0000-0000-000000000002'::uuid,
        'b5200000-0000-0000-0000-000000000001'::uuid
      ] THEN
    RAISE EXCEPTION 'group-search cursor duplicated, skipped, or admitted a newer post';
  END IF;
END
$$;

CREATE TEMP TABLE group_member_boundary AS
SELECT profile_id, joined_at, role_rank
FROM public.list_group_members_cursor(
  (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), 2
)
ORDER BY role_rank, joined_at, profile_id
OFFSET 1 LIMIT 1;

DO $$
BEGIN
  IF (SELECT profile_id FROM group_member_boundary) <> (SELECT admin_id FROM group_cursor_ids)
     OR (SELECT role_rank FROM group_member_boundary) <> 1 THEN
    RAISE EXCEPTION 'group-member role boundary is wrong';
  END IF;
  IF (SELECT array_agg(profile_id ORDER BY role_rank, joined_at, profile_id)
      FROM public.list_group_members_cursor(
        (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), 10,
        (SELECT role_rank FROM group_member_boundary), (SELECT joined_at FROM group_member_boundary),
        (SELECT profile_id FROM group_member_boundary)
      )) <> ARRAY[
        (SELECT mod_id FROM group_cursor_ids),
        (SELECT member_a_id FROM group_cursor_ids),
        (SELECT member_b_id FROM group_cursor_ids)
      ] THEN
    RAISE EXCEPTION 'group-member cursor order is unstable';
  END IF;
END
$$;

INSERT INTO public.community_group_faq_entries (
  id, group_id, question, answer, created_by, updated_by, created_at, updated_at
)
SELECT faq_id, group_id, 'Cursor FAQ question ' || ordinal,
       'Cursor FAQ answer ' || ordinal, owner_id, owner_id, updated_at, updated_at
FROM group_cursor_ids
CROSS JOIN (VALUES
  ('b5300000-0000-0000-0000-000000000001'::uuid, 1, '2026-09-03 01:00:00+00'::timestamptz),
  ('b5300000-0000-0000-0000-000000000002'::uuid, 2, '2026-09-03 02:00:00+00'::timestamptz),
  ('b5300000-0000-0000-0000-000000000003'::uuid, 3, '2026-09-03 03:00:00+00'::timestamptz)
) seed(faq_id, ordinal, updated_at);

CREATE TEMP TABLE group_faq_boundary AS
SELECT id, updated_at
FROM public.list_community_group_faq_cursor(
  (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), 'cursor faq', 2
)
ORDER BY updated_at DESC, id DESC
OFFSET 1 LIMIT 1;

INSERT INTO public.community_group_faq_entries (
  id, group_id, question, answer, created_by, updated_by, created_at, updated_at
)
SELECT 'b5300000-0000-0000-0000-000000000004', group_id,
       'Cursor FAQ question 4', 'Cursor FAQ answer 4', owner_id, owner_id,
       '2026-09-03 04:00:00+00', '2026-09-03 04:00:00+00'
FROM group_cursor_ids;

DO $$
BEGIN
  IF (SELECT id FROM group_faq_boundary) <> 'b5300000-0000-0000-0000-000000000002' THEN
    RAISE EXCEPTION 'group-FAQ boundary is wrong';
  END IF;
  IF (SELECT array_agg(id ORDER BY updated_at DESC, id DESC)
      FROM public.list_community_group_faq_cursor(
        (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), 'CURSOR FAQ', 10,
        (SELECT updated_at FROM group_faq_boundary), (SELECT id FROM group_faq_boundary)
      )) <> ARRAY['b5300000-0000-0000-0000-000000000001'::uuid] THEN
    RAISE EXCEPTION 'group-FAQ cursor duplicated, skipped, or admitted a newer entry';
  END IF;

  IF EXISTS (SELECT 1 FROM public.social_visible_community_group_post_ids_cursor(
       (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), 20, now(), NULL
     ))
     OR EXISTS (SELECT 1 FROM public.list_group_members_cursor(
       (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), 20, 1, now(), NULL
     ))
     OR EXISTS (SELECT 1 FROM public.list_community_group_faq_cursor(
       (SELECT member_a_id FROM group_cursor_ids), (SELECT group_id FROM group_cursor_ids), NULL, 20, now(), NULL
     )) THEN
    RAISE EXCEPTION 'partial group-directory cursor must return no rows';
  END IF;

  IF has_function_privilege('authenticated', 'public.social_visible_community_group_post_ids_cursor(uuid,uuid,integer,timestamptz,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.search_group_posts_cursor(uuid,uuid,text,integer,timestamptz,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.list_group_members_cursor(uuid,uuid,integer,integer,timestamptz,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.list_community_group_faq_cursor(uuid,uuid,text,integer,timestamptz,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'group-directory cursor RPCs leaked to authenticated clients';
  END IF;
END
$$;

ROLLBACK;
