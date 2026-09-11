\set ON_ERROR_STOP on
BEGIN;

-- Plan 13.4: admin tier, owner-unavailable freeze, platform review,
-- deletion guard.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('79000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ga-owner@example.test', '', '{}', '{"username":"GaOwner"}', now(), now()),
  ('79000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ga-admin@example.test', '', '{}', '{"username":"GaAdmin"}', now(), now()),
  ('79000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ga-mod@example.test', '', '{}', '{"username":"GaMod"}', now(), now()),
  ('79000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ga-member@example.test', '', '{}', '{"username":"GaMember"}', now(), now()),
  ('79000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ga-other@example.test', '', '{}', '{"username":"GaOther"}', now(), now()),
  ('79000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ga-platform@example.test', '', '{}', '{"username":"GaPlatform"}', now(), now()),
  ('79000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ga-siteadmin@example.test', '', '{}', '{"username":"GaSiteAdmin"}', now(), now());

UPDATE public.profiles SET is_public = true, created_at = now() - interval '30 days' WHERE auth_user_id::text LIKE '79000000-%';
UPDATE public.profiles SET role = 'admin' WHERE auth_user_id = '79000000-0000-0000-0000-000000000007';

CREATE TEMP TABLE ga AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '79000000-0000-0000-0000-000000000001') AS owner,
  (SELECT id FROM public.profiles WHERE auth_user_id = '79000000-0000-0000-0000-000000000002') AS admin_member,
  (SELECT id FROM public.profiles WHERE auth_user_id = '79000000-0000-0000-0000-000000000003') AS moderator,
  (SELECT id FROM public.profiles WHERE auth_user_id = '79000000-0000-0000-0000-000000000004') AS member,
  (SELECT id FROM public.profiles WHERE auth_user_id = '79000000-0000-0000-0000-000000000005') AS other,
  (SELECT id FROM public.profiles WHERE auth_user_id = '79000000-0000-0000-0000-000000000006') AS platform,
  NULL::uuid AS group_id;
GRANT SELECT ON ga TO PUBLIC;

DO $$
DECLARE g public.community_groups;
BEGIN
  g := public.create_community_group((SELECT owner FROM ga), 'admin-role-club', 'Admin Role Club', 'Roles.', 'general',
    ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, 'members', 'private', 'request_approval');
  UPDATE ga SET group_id = g.id;
  PERFORM public.invite_to_group((SELECT owner FROM ga), g.id, (SELECT admin_member FROM ga));
  PERFORM public.invite_to_group((SELECT owner FROM ga), g.id, (SELECT moderator FROM ga));
  PERFORM public.invite_to_group((SELECT owner FROM ga), g.id, (SELECT member FROM ga));
  PERFORM public.invite_to_group((SELECT owner FROM ga), g.id, (SELECT other FROM ga));
  PERFORM public.join_curated_community_group((SELECT admin_member FROM ga), g.id);
  PERFORM public.join_curated_community_group((SELECT moderator FROM ga), g.id);
  PERFORM public.join_curated_community_group((SELECT member FROM ga), g.id);
  PERFORM public.join_curated_community_group((SELECT other FROM ga), g.id);
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Role assignment matrix
-- ---------------------------------------------------------------------------
DO $$
DECLARE hit boolean;
BEGIN
  PERFORM public.set_group_member_role((SELECT owner FROM ga), (SELECT group_id FROM ga), (SELECT admin_member FROM ga), 'admin');
  IF public.community_group_role_of((SELECT admin_member FROM ga), (SELECT group_id FROM ga)) <> 'admin' THEN
    RAISE EXCEPTION 'owner should be able to appoint an admin';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT admin_member FROM ga) AND type = 'group_role_changed' AND data->>'role' = 'admin') <> 1 THEN
    RAISE EXCEPTION 'new admin should be told';
  END IF;

  -- Admin appoints moderators and demotes them, but never touches admins.
  PERFORM public.set_group_member_role((SELECT admin_member FROM ga), (SELECT group_id FROM ga), (SELECT moderator FROM ga), 'moderator');
  IF public.community_group_role_of((SELECT moderator FROM ga), (SELECT group_id FROM ga)) <> 'moderator' THEN
    RAISE EXCEPTION 'admins should be able to appoint moderators';
  END IF;
  hit := false;
  BEGIN
    PERFORM public.set_group_member_role((SELECT admin_member FROM ga), (SELECT group_id FROM ga), (SELECT member FROM ga), 'admin');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'admins must not appoint admins'; END IF;

  PERFORM public.set_group_member_role((SELECT owner FROM ga), (SELECT group_id FROM ga), (SELECT other FROM ga), 'admin');
  hit := false;
  BEGIN
    PERFORM public.set_group_member_role((SELECT admin_member FROM ga), (SELECT group_id FROM ga), (SELECT other FROM ga), 'member');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'admins must not demote other admins'; END IF;
  PERFORM public.set_group_member_role((SELECT owner FROM ga), (SELECT group_id FROM ga), (SELECT other FROM ga), 'member');

  hit := false;
  BEGIN
    PERFORM public.set_group_member_role((SELECT moderator FROM ga), (SELECT group_id FROM ga), (SELECT member FROM ga), 'moderator');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'moderators must not assign roles'; END IF;

  hit := false;
  BEGIN
    PERFORM public.transfer_group_ownership((SELECT admin_member FROM ga), (SELECT group_id FROM ga), (SELECT member FROM ga));
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'admins must not transfer ownership'; END IF;
  hit := false;
  BEGIN
    PERFORM public.archive_group((SELECT admin_member FROM ga), (SELECT group_id FROM ga));
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'admins must not archive'; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Membership management: admins ban and act on moderators; moderators do
--    not ban and cannot act on admins.
-- ---------------------------------------------------------------------------
DO $$
DECLARE hit boolean;
BEGIN
  hit := false;
  BEGIN
    PERFORM public.set_group_member_status((SELECT moderator FROM ga), (SELECT group_id FROM ga), (SELECT member FROM ga), 'banned');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'moderators must not ban'; END IF;
  hit := false;
  BEGIN
    PERFORM public.set_group_member_status((SELECT moderator FROM ga), (SELECT group_id FROM ga), (SELECT admin_member FROM ga), 'removed');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'moderators must not remove admins'; END IF;

  PERFORM public.set_group_member_status((SELECT admin_member FROM ga), (SELECT group_id FROM ga), (SELECT other FROM ga), 'banned');
  IF (SELECT status FROM public.community_group_memberships WHERE group_id = (SELECT group_id FROM ga) AND profile_id = (SELECT other FROM ga)) <> 'banned' THEN
    RAISE EXCEPTION 'admins should be able to ban';
  END IF;
  PERFORM public.set_group_member_status((SELECT admin_member FROM ga), (SELECT group_id FROM ga), (SELECT other FROM ga), 'active');
  PERFORM public.set_group_member_status((SELECT admin_member FROM ga), (SELECT group_id FROM ga), (SELECT moderator FROM ga), 'removed');
  IF (SELECT status FROM public.community_group_memberships WHERE group_id = (SELECT group_id FROM ga) AND profile_id = (SELECT moderator FROM ga)) <> 'removed' THEN
    RAISE EXCEPTION 'admins should be able to remove moderators';
  END IF;
  -- Bring the moderator back for later sections.
  PERFORM public.invite_to_group((SELECT owner FROM ga), (SELECT group_id FROM ga), (SELECT moderator FROM ga));
  PERFORM public.join_curated_community_group((SELECT moderator FROM ga), (SELECT group_id FROM ga));
  PERFORM public.set_group_member_role((SELECT owner FROM ga), (SELECT group_id FROM ga), (SELECT moderator FROM ga), 'moderator');
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Settings: admins edit ordinary settings but cannot open the group up.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean := false;
  g public.community_groups;
BEGIN
  g := public.update_community_group_settings((SELECT admin_member FROM ga), (SELECT group_id FROM ga),
    'Admin Role Club (renamed)', 'Roles.', 'general', ARRAY['Be kind'], NULL, NULL, NULL, NULL, NULL, 'members', 'unlisted', 'invite_only');
  IF g.name <> 'Admin Role Club (renamed)' OR g.visibility <> 'unlisted' OR g.join_policy <> 'invite_only' THEN
    RAISE EXCEPTION 'admins should be able to tighten settings';
  END IF;
  BEGIN
    PERFORM public.update_community_group_settings((SELECT admin_member FROM ga), (SELECT group_id FROM ga),
      'Admin Role Club', 'Roles.', 'general', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, 'members', 'public', 'open');
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'group_policy_owner_only';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'admins must not make the group less restrictive'; END IF;
  g := public.update_community_group_settings((SELECT owner FROM ga), (SELECT group_id FROM ga),
    'Admin Role Club', 'Roles.', 'general', ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, 'members', 'private', 'request_approval');
  IF g.visibility <> 'private' THEN RAISE EXCEPTION 'owner should open the group up'; END IF;
END
$$;

-- Admins also receive join-request notices and count them in badges.
DO $$
DECLARE badges jsonb;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('79000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'ga-asker@example.test', '', '{}', '{"username":"GaAsker"}', now(), now());
  PERFORM public.request_group_membership((SELECT id FROM public.profiles WHERE auth_user_id = '79000000-0000-0000-0000-000000000008'), (SELECT group_id FROM ga));
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT admin_member FROM ga) AND type = 'group_join_request') <> 1 THEN
    RAISE EXCEPTION 'admins should be told about join requests';
  END IF;
  badges := public.member_activity_badges((SELECT admin_member FROM ga));
  IF (badges->>'pendingGroupRequests')::int <> 1 THEN RAISE EXCEPTION 'admin badge should count the request: %', badges; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Owner unavailable: posts and role changes freeze; platform review can
--    assign a willing member or archive; nobody is promoted automatically.
-- ---------------------------------------------------------------------------
INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
SELECT member, group_id, 'Before the freeze', 'public', 'active', 'active' FROM ga;
INSERT INTO public.user_enforcement_actions (profile_id, action_type, starts_at, reason_code)
SELECT owner, 'suspension', now() - interval '1 minute', 'test' FROM ga;

DO $$
DECLARE hit boolean;
BEGIN
  IF public.community_group_owner_available((SELECT group_id FROM ga)) THEN
    RAISE EXCEPTION 'a suspended owner is not available';
  END IF;
  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
    SELECT member, group_id, 'During the freeze', 'public', 'active', 'active' FROM ga;
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'group under review';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'posts must freeze while the owner is unavailable'; END IF;
  hit := false;
  BEGIN
    PERFORM public.set_group_member_role((SELECT admin_member FROM ga), (SELECT group_id FROM ga), (SELECT member FROM ga), 'moderator');
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'group under review';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'role changes must freeze while the owner is unavailable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.list_groups_needing_platform_review() WHERE group_id = (SELECT group_id FROM ga) AND reason = 'owner_unavailable') THEN
    RAISE EXCEPTION 'the group should be queued for platform review';
  END IF;
  IF public.community_group_role_of((SELECT admin_member FROM ga), (SELECT group_id FROM ga)) <> 'admin' THEN
    RAISE EXCEPTION 'nobody is promoted automatically';
  END IF;

  -- Without the capability, platform actions are refused.
  hit := false;
  BEGIN
    PERFORM public.platform_assign_group_owner((SELECT platform FROM ga), (SELECT group_id FROM ga), (SELECT admin_member FROM ga), 'owner suspended; admin volunteered');
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'platform actions need a capability'; END IF;
END
$$;

-- Grant the capability as the site admin, then resolve.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"79000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
SELECT public.grant_moderation_capability((SELECT platform FROM ga), 'content_decide', 'group stewardship reviewer');
RESET ROLE;

DO $$
DECLARE hit boolean;
BEGIN
  PERFORM public.platform_assign_group_owner((SELECT platform FROM ga), (SELECT group_id FROM ga), (SELECT admin_member FROM ga), 'owner suspended; admin volunteered');
  IF public.community_group_role_of((SELECT admin_member FROM ga), (SELECT group_id FROM ga)) <> 'owner' THEN
    RAISE EXCEPTION 'platform review should assign the new owner';
  END IF;
  IF (SELECT role FROM public.community_group_memberships WHERE group_id = (SELECT group_id FROM ga) AND profile_id = (SELECT owner FROM ga)) <> 'member' THEN
    RAISE EXCEPTION 'the previous owner loses the role';
  END IF;
  IF (SELECT count(*) FROM public.community_group_moderation_events WHERE group_id = (SELECT group_id FROM ga) AND action = 'platform_owner_assigned' AND actor_id = (SELECT platform FROM ga)) <> 1 THEN
    RAISE EXCEPTION 'platform assignment must be audited';
  END IF;
  IF NOT public.community_group_owner_available((SELECT group_id FROM ga)) THEN
    RAISE EXCEPTION 'the group should be live again';
  END IF;
  INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
  SELECT member, group_id, 'After the review', 'public', 'active', 'active' FROM ga;

  hit := false;
  BEGIN
    PERFORM public.platform_assign_group_owner((SELECT platform FROM ga), (SELECT group_id FROM ga), (SELECT member FROM ga), 'trying again for no reason');
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'platform review must not replace an available owner'; END IF;

  -- Deletion guard: the new owner owns an active group; the old one does not.
  IF (SELECT count(*) FROM public.list_owned_active_groups((SELECT admin_member FROM ga))) <> 1 THEN
    RAISE EXCEPTION 'the current owner should be listed as owning the group';
  END IF;
  IF (SELECT count(*) FROM public.list_owned_active_groups((SELECT owner FROM ga))) <> 0 THEN
    RAISE EXCEPTION 'a former owner owns nothing';
  END IF;

  PERFORM public.platform_archive_group((SELECT platform FROM ga), (SELECT group_id FROM ga), 'no willing owner after review');
  IF (SELECT status FROM public.community_groups WHERE id = (SELECT group_id FROM ga)) <> 'archived' THEN
    RAISE EXCEPTION 'platform archive should archive';
  END IF;
  IF (SELECT count(*) FROM public.list_owned_active_groups((SELECT admin_member FROM ga))) <> 0 THEN
    RAISE EXCEPTION 'archived groups do not block deletion';
  END IF;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.platform_assign_group_owner(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.platform_archive_group(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.list_groups_needing_platform_review()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.list_owned_active_groups(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'platform review leaked to clients';
  END IF;
END
$$;

ROLLBACK;
