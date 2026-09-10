\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('67000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'filter-viewer@example.test', '', '{}',
   '{"username":"FilterViewer"}', now(), now()),
  ('67000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'filter-friend@example.test', '', '{}',
   '{"username":"FilterFriend"}', now(), now()),
  ('67000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'filter-stranger@example.test', '', '{}',
   '{"username":"FilterStranger"}', now(), now());

UPDATE public.profiles SET is_public = true, default_post_audience = 'public'
WHERE auth_user_id::text LIKE '67000000-%';

CREATE TEMP TABLE filter_ids AS
SELECT
  max(id::text) FILTER (WHERE auth_user_id = '67000000-0000-0000-0000-000000000001')::uuid AS viewer_id,
  max(id::text) FILTER (WHERE auth_user_id = '67000000-0000-0000-0000-000000000002')::uuid AS friend_id,
  max(id::text) FILTER (WHERE auth_user_id = '67000000-0000-0000-0000-000000000003')::uuid AS stranger_id
FROM public.profiles;

INSERT INTO public.friend_relationships (
  profile_low_id, profile_high_id, requested_by, status, responded_at
)
SELECT least(viewer_id, friend_id), greatest(viewer_id, friend_id),
       viewer_id, 'friends', now()
FROM filter_ids;

INSERT INTO public.vehicles (id, owner_id, year, make, model, visibility)
SELECT '68000000-0000-0000-0000-000000000001'::uuid, viewer_id, 2019, 'Acura', 'TLX',
       'private'::public.vehicle_visibility
FROM filter_ids
UNION ALL
SELECT '68000000-0000-0000-0000-000000000002'::uuid, stranger_id, 2020, 'ACURA', 'tlx', 'public'
FROM filter_ids
UNION ALL
SELECT '68000000-0000-0000-0000-000000000003'::uuid, stranger_id, 2022, 'Honda', 'Civic', 'public'
FROM filter_ids;

INSERT INTO public.community_posts (
  id, author_id, vehicle_id, content, audience, status, moderation_status, created_at
)
SELECT '69000000-0000-0000-0000-000000000001'::uuid, friend_id, NULL,
       'Friend post', 'public'::public.community_post_audience,
       'active'::public.community_content_status, 'active', now() - interval '4 minutes'
FROM filter_ids
UNION ALL
SELECT '69000000-0000-0000-0000-000000000002'::uuid, stranger_id,
       '68000000-0000-0000-0000-000000000002'::uuid,
       'Matching TLX post', 'public', 'active', 'active', now() - interval '3 minutes'
FROM filter_ids
UNION ALL
SELECT '69000000-0000-0000-0000-000000000003'::uuid, stranger_id,
       '68000000-0000-0000-0000-000000000003'::uuid,
       'Other car post', 'public', 'active', 'active', now() - interval '2 minutes'
FROM filter_ids;

INSERT INTO public.community_groups (
  id, slug, name, description, category, status, visibility,
  join_policy, is_staff_curated, created_by
)
SELECT '6a000000-0000-0000-0000-000000000001'::uuid, 'filter-group', 'Filter Group',
       'Test group', 'general', 'active', 'public', 'open', true, viewer_id
FROM filter_ids;

INSERT INTO public.community_group_memberships (group_id, profile_id, role, status)
SELECT '6a000000-0000-0000-0000-000000000001'::uuid, viewer_id,
       'member'::public.community_group_role,
       'active'::public.community_group_membership_status
FROM filter_ids
UNION ALL
SELECT '6a000000-0000-0000-0000-000000000001'::uuid, friend_id, 'member', 'active'
FROM filter_ids;

INSERT INTO public.community_posts (
  id, author_id, group_id, group_status, content, audience,
  status, moderation_status, created_at
)
SELECT '69000000-0000-0000-0000-000000000004'::uuid, friend_id,
       '6a000000-0000-0000-0000-000000000001'::uuid, 'active',
       'Group post', 'public', 'active', 'active', now()
FROM filter_ids;

DO $$
DECLARE
  v_viewer uuid := (SELECT viewer_id FROM filter_ids);
BEGIN
  IF (SELECT count(*) FROM public.social_filtered_community_post_ids(v_viewer, 'all', 20, 0)) <> 4 THEN
    RAISE EXCEPTION 'all feed did not include visible posts from joined groups';
  END IF;
  IF (SELECT array_agg(post_id) FROM public.social_filtered_community_post_ids(v_viewer, 'friends', 20, 0))
     IS DISTINCT FROM ARRAY[
       '69000000-0000-0000-0000-000000000004'::uuid,
       '69000000-0000-0000-0000-000000000001'::uuid
     ] THEN
    RAISE EXCEPTION 'friends feed did not include the friend post from a joined group';
  END IF;
  IF (SELECT array_agg(post_id) FROM public.social_filtered_community_post_ids(v_viewer, 'my_cars', 20, 0))
     IS DISTINCT FROM ARRAY['69000000-0000-0000-0000-000000000002'::uuid] THEN
    RAISE EXCEPTION 'my cars feed did not match the Garage make/model';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.social_filtered_community_post_ids(v_viewer, 'all', 1, 0)
    WHERE post_id <> '69000000-0000-0000-0000-000000000004'
  ) THEN
    RAISE EXCEPTION 'feed limit was applied before filtering or ordering';
  END IF;
  IF (SELECT count(*) FROM public.social_filtered_community_post_ids(v_viewer, 'all', 20, 0, false)) <> 3 THEN
    RAISE EXCEPTION 'groups feature flag did not remove group posts from the feed';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.social_filtered_community_post_ids(uuid,public.community_feed_filter,integer,integer,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'filtered feed function leaked to authenticated clients';
  END IF;
END
$$;

ROLLBACK;
