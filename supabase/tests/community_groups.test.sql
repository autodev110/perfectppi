\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('62000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'groups-admin@example.test', '', '{}', '{"username":"GroupsAdmin"}', now(), now()),
  ('62000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'groups-member@example.test', '', '{}', '{"username":"GroupsMember"}', now(), now()),
  ('62000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'groups-viewer@example.test', '', '{}', '{"username":"GroupsViewer"}', now(), now());

UPDATE public.profiles SET role = 'admin'
WHERE auth_user_id = '62000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET is_public = false
WHERE auth_user_id = '62000000-0000-0000-0000-000000000002';

CREATE TEMP TABLE group_ids AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '62000000-0000-0000-0000-000000000001') admin_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '62000000-0000-0000-0000-000000000002') member_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '62000000-0000-0000-0000-000000000003') viewer_id;

DO $$
DECLARE created public.community_groups;
BEGIN
  created := public.create_curated_community_group(
    (SELECT admin_id FROM group_ids), 'acura-tlx', 'Acura TLX Owners',
    'A staff-curated group for TLX ownership and maintenance.', 'make_model',
    ARRAY['Be factual', 'Protect private information'], 'Acura', 'TLX', 2015, NULL
  );
  IF created.visibility <> 'public' OR created.join_policy <> 'open' OR NOT created.is_staff_curated THEN
    RAISE EXCEPTION 'launch group was not forced to public/open/staff-curated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.community_group_memberships
    WHERE group_id = created.id AND profile_id = (SELECT admin_id FROM group_ids)
      AND role = 'owner' AND status = 'active'
  ) THEN RAISE EXCEPTION 'creator was not made owner'; END IF;
END
$$;

ALTER TABLE group_ids ADD COLUMN group_id uuid;
UPDATE group_ids SET group_id = (SELECT id FROM public.community_groups WHERE slug = 'acura-tlx');

-- Raw role and membership tables, plus privileged mutation RPCs, are never
-- client-callable. Application routes resolve the caller and invoke as service.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.community_groups', 'SELECT')
     OR has_table_privilege('authenticated', 'public.community_group_memberships', 'INSERT') THEN
    RAISE EXCEPTION 'group tables leaked to authenticated clients';
  END IF;
  IF has_function_privilege('authenticated', 'public.join_curated_community_group(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_curated_community_group(uuid,text,text,text,text,text[],text,text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'privileged group RPC leaked to authenticated clients';
  END IF;
END
$$;

DO $$
DECLARE changed boolean;
BEGIN
  changed := public.join_curated_community_group(
    (SELECT member_id FROM group_ids), (SELECT group_id FROM group_ids)
  );
  IF NOT changed THEN RAISE EXCEPTION 'first join should change membership'; END IF;
  changed := public.join_curated_community_group(
    (SELECT member_id FROM group_ids), (SELECT group_id FROM group_ids)
  );
  IF changed THEN RAISE EXCEPTION 'second join should be idempotent'; END IF;
END
$$;

-- Group posts require active membership and are readable by eligible signed-in
-- members even when the author keeps their personal profile private.
DO $$
DECLARE v_post_id uuid;
DECLARE revision_group uuid;
BEGIN
  INSERT INTO public.community_posts (author_id, group_id, audience, content, status, moderation_status)
  VALUES (
    (SELECT member_id FROM group_ids), (SELECT group_id FROM group_ids), 'public',
    'Private-profile member posting in a public group', 'active', 'active'
  ) RETURNING id INTO v_post_id;
  IF NOT public.social_can_view_community_post((SELECT viewer_id FROM group_ids), v_post_id, false) THEN
    RAISE EXCEPTION 'eligible viewer could not read public group post';
  END IF;
  SELECT revision.group_id INTO revision_group
  FROM public.community_posts post
  JOIN public.community_post_revisions revision ON revision.id = post.active_revision_id
  WHERE post.id = v_post_id;
  IF revision_group IS DISTINCT FROM (SELECT group_id FROM group_ids) THEN
    RAISE EXCEPTION 'group destination missing from immutable revision';
  END IF;
END
$$;

-- The database enforces membership for comments too, preventing stale clients
-- or a membership-change race from bypassing the application check.
DO $$
DECLARE v_post_id uuid;
BEGIN
  SELECT id INTO v_post_id
  FROM public.community_posts
  WHERE content = 'Private-profile member posting in a public group';

  INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status)
  VALUES (v_post_id, (SELECT member_id FROM group_ids), 'Member comment', 'active', 'active');

  BEGIN
    INSERT INTO public.community_comments (post_id, author_id, content, status, moderation_status)
    VALUES (v_post_id, (SELECT viewer_id FROM group_ids), 'Nonmember comment', 'active', 'active');
    RAISE EXCEPTION 'nonmember group comment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'nonmember group comment was accepted' THEN RAISE; END IF;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.community_posts (author_id, group_id, audience, content, status, moderation_status)
    VALUES (
      (SELECT viewer_id FROM group_ids), (SELECT group_id FROM group_ids), 'public',
      'Nonmember bypass attempt', 'active', 'active'
    );
    RAISE EXCEPTION 'nonmember group post was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'nonmember group post was accepted' THEN RAISE; END IF;
  END;
END
$$;

DO $$
DECLARE changed boolean;
BEGIN
  changed := public.leave_curated_community_group(
    (SELECT member_id FROM group_ids), (SELECT group_id FROM group_ids)
  );
  IF NOT changed THEN RAISE EXCEPTION 'first leave should change membership'; END IF;
  changed := public.leave_curated_community_group(
    (SELECT member_id FROM group_ids), (SELECT group_id FROM group_ids)
  );
  IF changed THEN RAISE EXCEPTION 'second leave should be idempotent'; END IF;

  BEGIN
    PERFORM public.leave_curated_community_group(
      (SELECT admin_id FROM group_ids), (SELECT group_id FROM group_ids)
    );
    RAISE EXCEPTION 'owner was allowed to strand group';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'owner was allowed to strand group' THEN RAISE; END IF;
  END;
END
$$;

UPDATE public.community_group_memberships SET status = 'banned'
WHERE group_id = (SELECT group_id FROM group_ids) AND profile_id = (SELECT member_id FROM group_ids);
DO $$
BEGIN
  BEGIN
    PERFORM public.join_curated_community_group(
      (SELECT member_id FROM group_ids), (SELECT group_id FROM group_ids)
    );
    RAISE EXCEPTION 'banned member rejoined';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'banned member rejoined' THEN RAISE; END IF;
  END;
END
$$;

ROLLBACK;
