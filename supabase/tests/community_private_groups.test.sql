\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('74000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pg-owner@example.test', '', '{}', '{"username":"PgOwner"}', now(), now()),
  ('74000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pg-asker@example.test', '', '{}', '{"username":"PgAsker"}', now(), now()),
  ('74000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pg-invitee@example.test', '', '{}', '{"username":"PgInvitee"}', now(), now()),
  ('74000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pg-stranger@example.test', '', '{}', '{"username":"PgStranger"}', now(), now());

UPDATE public.profiles SET is_public = true, created_at = now() - interval '30 days' WHERE auth_user_id::text LIKE '74000000-%';

CREATE TEMP TABLE pg AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '74000000-0000-0000-0000-000000000001') AS owner,
  (SELECT id FROM public.profiles WHERE auth_user_id = '74000000-0000-0000-0000-000000000002') AS asker,
  (SELECT id FROM public.profiles WHERE auth_user_id = '74000000-0000-0000-0000-000000000003') AS invitee,
  (SELECT id FROM public.profiles WHERE auth_user_id = '74000000-0000-0000-0000-000000000004') AS stranger,
  NULL::uuid AS private_id,
  NULL::uuid AS unlisted_id;

-- Disallowed combination is refused; private/request and unlisted/invite are created.
DO $$
DECLARE
  hit boolean := false;
  g public.community_groups;
BEGIN
  BEGIN
    PERFORM public.create_community_group((SELECT owner FROM pg), 'bad-combo', 'Bad', 'x', 'general',
      ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, 'members', 'private', 'open');
  EXCEPTION WHEN check_violation THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'private + open must be refused'; END IF;

  g := public.create_community_group((SELECT owner FROM pg), 'e30-owners', 'E30 Owners', 'Private club.', 'make_model',
    ARRAY[]::text[], 'BMW', 'E30', NULL, NULL, NULL, 'members', 'private', 'request_approval');
  UPDATE pg SET private_id = g.id;
  g := public.create_community_group((SELECT owner FROM pg), 'secret-track-night', 'Secret Track Night', 'Invite only.', 'track',
    ARRAY[]::text[], NULL, NULL, NULL, NULL, NULL, 'members', 'unlisted', 'invite_only');
  UPDATE pg SET unlisted_id = g.id;
END
$$;

INSERT INTO public.community_posts (id, author_id, group_id, content, audience, status, moderation_status)
SELECT '75000000-0000-0000-0000-000000000001', owner, private_id, 'Members-only tech day', 'public', 'active', 'active' FROM pg;

-- ---------------------------------------------------------------------------
-- 1. Visibility: private shell is discoverable, content is not; an unlisted
--    shell works by known link but never appears in general discovery.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT public.community_group_shell_visible((SELECT stranger FROM pg), (SELECT private_id FROM pg)) THEN
    RAISE EXCEPTION 'private groups should be discoverable as a shell';
  END IF;
  IF public.community_group_content_visible((SELECT stranger FROM pg), (SELECT private_id FROM pg)) THEN
    RAISE EXCEPTION 'private content leaked to a non-member';
  END IF;
  IF public.social_can_view_community_post((SELECT stranger FROM pg), '75000000-0000-0000-0000-000000000001', false) THEN
    RAISE EXCEPTION 'private group post leaked to a non-member';
  END IF;
  IF (SELECT count(*) FROM public.list_group_members((SELECT stranger FROM pg), (SELECT private_id FROM pg))) <> 0 THEN
    RAISE EXCEPTION 'private member list leaked';
  END IF;
  IF NOT public.community_group_shell_visible((SELECT stranger FROM pg), (SELECT unlisted_id FROM pg)) THEN
    RAISE EXCEPTION 'unlisted group should be reachable by a known direct link';
  END IF;
  IF EXISTS (SELECT 1 FROM public.list_visible_group_ids((SELECT stranger FROM pg)) WHERE group_id = (SELECT unlisted_id FROM pg)) THEN
    RAISE EXCEPTION 'unlisted group listed for a stranger';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.list_visible_group_ids((SELECT stranger FROM pg)) WHERE group_id = (SELECT private_id FROM pg)) THEN
    RAISE EXCEPTION 'private group should list for discovery';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Requests: open join refused, request created once, moderators told once
--    per day, approve → member sees content; decline → cooldown.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean := false;
  r jsonb;
BEGIN
  BEGIN
    PERFORM public.join_curated_community_group((SELECT asker FROM pg), (SELECT private_id FROM pg));
  EXCEPTION WHEN insufficient_privilege THEN hit := SQLERRM = 'group_requires_request';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'open join must be refused for request-approval groups'; END IF;

  r := public.request_group_membership((SELECT asker FROM pg), (SELECT private_id FROM pg), 'I own a 1989 325is');
  IF r->>'status' <> 'requested' OR (r->>'changed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'request failed: %', r; END IF;
  r := public.request_group_membership((SELECT asker FROM pg), (SELECT private_id FROM pg), 'again');
  IF (r->>'changed')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'request must be idempotent'; END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT owner FROM pg) AND type = 'group_join_request') <> 1 THEN
    RAISE EXCEPTION 'owner should get exactly one request notice';
  END IF;
  IF (SELECT count(*) FROM public.list_group_join_requests((SELECT owner FROM pg), (SELECT private_id FROM pg))) <> 1 THEN
    RAISE EXCEPTION 'request should be listed for moderators';
  END IF;
  -- Requester can see the shell (and their pending state), not the content.
  IF public.community_group_content_visible((SELECT asker FROM pg), (SELECT private_id FROM pg)) THEN
    RAISE EXCEPTION 'requester must not see content yet';
  END IF;

  hit := false;
  BEGIN
    PERFORM public.list_group_join_requests((SELECT asker FROM pg), (SELECT private_id FROM pg));
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'non-moderators must not list requests'; END IF;

  r := public.decide_group_join_request((SELECT owner FROM pg), (SELECT private_id FROM pg), (SELECT asker FROM pg), false);
  IF r->>'status' <> 'removed' THEN RAISE EXCEPTION 'decline failed: %', r; END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT asker FROM pg) AND type = 'group_join_decision' AND data->>'decision' = 'declined') <> 1 THEN
    RAISE EXCEPTION 'requester should be told about the decision';
  END IF;
  hit := false;
  BEGIN
    PERFORM public.request_group_membership((SELECT asker FROM pg), (SELECT private_id FROM pg));
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'group_request_cooldown';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'declined requester should wait before asking again'; END IF;

  -- Backdate the decision; the next request works and gets approved.
  UPDATE public.community_group_memberships SET decided_at = now() - interval '8 days'
  WHERE group_id = (SELECT private_id FROM pg) AND profile_id = (SELECT asker FROM pg);
  PERFORM public.request_group_membership((SELECT asker FROM pg), (SELECT private_id FROM pg));
  r := public.decide_group_join_request((SELECT owner FROM pg), (SELECT private_id FROM pg), (SELECT asker FROM pg), true);
  IF r->>'status' <> 'active' THEN RAISE EXCEPTION 'approve failed: %', r; END IF;
  IF NOT public.social_can_view_community_post((SELECT asker FROM pg), '75000000-0000-0000-0000-000000000001', false) THEN
    RAISE EXCEPTION 'approved member should see private content';
  END IF;
  INSERT INTO public.community_posts (id, author_id, group_id, content, audience, status, moderation_status)
  SELECT '75000000-0000-0000-0000-000000000002', asker, private_id,
         'Member-created private post', 'public', 'active', 'active' FROM pg;
  hit := false;
  BEGIN
    INSERT INTO public.community_posts (id, author_id, group_id, content, audience, status, moderation_status)
    SELECT '75000000-0000-0000-0000-000000000003', invitee, private_id,
           'Nonmember private post', 'public', 'active', 'active' FROM pg;
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'active group membership required';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'nonmember must not post in a private group'; END IF;

  -- A blocked person cannot use join requests to notify or become visible to
  -- a moderator. No orphaned pending membership should be created.
  INSERT INTO public.profile_blocks (blocker_id, blocked_id)
  SELECT owner, stranger FROM pg;
  hit := false;
  BEGIN
    PERFORM public.request_group_membership((SELECT stranger FROM pg), (SELECT private_id FROM pg));
  EXCEPTION WHEN no_data_found THEN hit := SQLERRM = 'group unavailable';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'blocked requester must see the group as unavailable'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.community_group_memberships
    WHERE group_id = (SELECT private_id FROM pg)
      AND profile_id = (SELECT stranger FROM pg)
      AND status = 'requested'
  ) THEN
    RAISE EXCEPTION 'blocked requester created an orphaned request';
  END IF;

  -- A request made before a later block disappears from review and cannot be
  -- approved through a stale or forged request action.
  DELETE FROM public.profile_blocks
  WHERE blocker_id = (SELECT owner FROM pg) AND blocked_id = (SELECT stranger FROM pg);
  PERFORM public.request_group_membership((SELECT stranger FROM pg), (SELECT private_id FROM pg));
  INSERT INTO public.profile_blocks (blocker_id, blocked_id)
  SELECT owner, stranger FROM pg;
  IF (SELECT count(*) FROM public.list_group_join_requests((SELECT owner FROM pg), (SELECT private_id FROM pg))) <> 0 THEN
    RAISE EXCEPTION 'blocked pending requester leaked into moderator review';
  END IF;
  hit := false;
  BEGIN
    PERFORM public.decide_group_join_request(
      (SELECT owner FROM pg), (SELECT private_id FROM pg), (SELECT stranger FROM pg), true
    );
  EXCEPTION WHEN no_data_found THEN hit := SQLERRM = 'request unavailable';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'blocked hidden request was directly approved'; END IF;
  DELETE FROM public.community_group_memberships
  WHERE group_id = (SELECT private_id FROM pg) AND profile_id = (SELECT stranger FROM pg);
  DELETE FROM public.profile_blocks
  WHERE blocker_id = (SELECT owner FROM pg) AND blocked_id = (SELECT stranger FROM pg);

  IF (SELECT count(*) FROM public.community_group_moderation_events WHERE action IN ('request_approved', 'request_declined')) <> 2 THEN
    RAISE EXCEPTION 'decisions must be audited';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Invitations: only moderators invite; invitee sees the unlisted shell;
--    accepting joins; leave from invited state declines; crossed request
--    resolves to membership; invite-only groups refuse requests.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  hit boolean := false;
  r jsonb;
BEGIN
  BEGIN
    PERFORM public.invite_to_group((SELECT asker FROM pg), (SELECT unlisted_id FROM pg), (SELECT invitee FROM pg));
  EXCEPTION WHEN insufficient_privilege THEN hit := true;
  END;
  IF NOT hit THEN RAISE EXCEPTION 'non-moderators must not invite'; END IF;

  hit := false;
  BEGIN
    PERFORM public.request_group_membership((SELECT invitee FROM pg), (SELECT unlisted_id FROM pg));
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'group_invite_only';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'unlisted invite-only group must refuse requests from strangers'; END IF;

  r := public.invite_to_group((SELECT owner FROM pg), (SELECT unlisted_id FROM pg), (SELECT invitee FROM pg));
  IF r->>'status' <> 'invited' THEN RAISE EXCEPTION 'invite failed: %', r; END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = (SELECT invitee FROM pg) AND type = 'group_invitation') <> 1 THEN
    RAISE EXCEPTION 'invitee should be notified';
  END IF;
  IF NOT public.community_group_shell_visible((SELECT invitee FROM pg), (SELECT unlisted_id FROM pg)) THEN
    RAISE EXCEPTION 'invitee should see the unlisted shell';
  END IF;
  IF (SELECT count(*) FROM public.list_my_group_invitations((SELECT invitee FROM pg))) <> 1 THEN
    RAISE EXCEPTION 'invitation should be listed for the invitee';
  END IF;

  -- Blocking after an invitation cancels both the actionable membership row
  -- and its notification, so accepting a stale invite cannot bypass a block.
  INSERT INTO public.profile_blocks (blocker_id, blocked_id)
  SELECT invitee, owner FROM pg;
  IF EXISTS (
    SELECT 1 FROM public.community_group_memberships
    WHERE group_id = (SELECT unlisted_id FROM pg)
      AND profile_id = (SELECT invitee FROM pg)
      AND status = 'invited'
  ) THEN
    RAISE EXCEPTION 'block did not cancel the group invitation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = (SELECT invitee FROM pg) AND type = 'group_invitation'
  ) THEN
    RAISE EXCEPTION 'block retained the group invitation notification';
  END IF;
  DELETE FROM public.profile_blocks
  WHERE blocker_id = (SELECT invitee FROM pg) AND blocked_id = (SELECT owner FROM pg);
  PERFORM public.invite_to_group((SELECT owner FROM pg), (SELECT unlisted_id FROM pg), (SELECT invitee FROM pg));

  -- Decline by leaving, then invite again and accept via join.
  IF NOT public.leave_curated_community_group((SELECT invitee FROM pg), (SELECT unlisted_id FROM pg)) THEN
    RAISE EXCEPTION 'declining an invitation should succeed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.community_group_memberships WHERE group_id = (SELECT unlisted_id FROM pg) AND profile_id = (SELECT invitee FROM pg)) THEN
    RAISE EXCEPTION 'declined invitation should leave no row';
  END IF;
  PERFORM public.invite_to_group((SELECT owner FROM pg), (SELECT unlisted_id FROM pg), (SELECT invitee FROM pg));
  IF NOT public.join_curated_community_group((SELECT invitee FROM pg), (SELECT unlisted_id FROM pg)) THEN
    RAISE EXCEPTION 'accepting an invitation should join';
  END IF;
  IF NOT public.community_group_content_visible((SELECT invitee FROM pg), (SELECT unlisted_id FROM pg)) THEN
    RAISE EXCEPTION 'joined invitee should see content';
  END IF;

  -- Crossed: stranger requests the private group, owner invites → member.
  PERFORM public.request_group_membership((SELECT stranger FROM pg), (SELECT private_id FROM pg));
  r := public.invite_to_group((SELECT owner FROM pg), (SELECT private_id FROM pg), (SELECT stranger FROM pg));
  IF r->>'status' <> 'active' THEN RAISE EXCEPTION 'crossed request/invite should resolve to membership: %', r; END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Owner opens the group: pending requests become members; badges count.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  g public.community_groups;
  badges jsonb;
BEGIN
  PERFORM public.leave_curated_community_group((SELECT asker FROM pg), (SELECT private_id FROM pg));
  UPDATE public.community_group_memberships SET decided_at = now() - interval '8 days'
  WHERE group_id = (SELECT private_id FROM pg) AND profile_id = (SELECT asker FROM pg);
  PERFORM public.request_group_membership((SELECT asker FROM pg), (SELECT private_id FROM pg));
  badges := public.member_activity_badges((SELECT owner FROM pg));
  IF (badges->>'pendingGroupRequests')::int <> 1 THEN RAISE EXCEPTION 'owner badge should count the pending request: %', badges; END IF;

  g := public.update_community_group_settings((SELECT owner FROM pg), (SELECT private_id FROM pg),
    'E30 Owners', 'Now open.', 'make_model', ARRAY[]::text[], 'BMW', 'E30', NULL, NULL, NULL, 'members', 'public', 'open');
  IF g.visibility <> 'public' OR g.join_policy <> 'open' THEN RAISE EXCEPTION 'settings should switch visibility/join policy'; END IF;
  IF public.community_group_role_of((SELECT asker FROM pg), (SELECT private_id FROM pg)) IS NULL THEN
    RAISE EXCEPTION 'opening the group should admit pending requests';
  END IF;
  IF NOT public.social_can_view_community_post((SELECT stranger FROM pg), '75000000-0000-0000-0000-000000000001', false) THEN
    RAISE EXCEPTION 'public group content should now be visible to everyone';
  END IF;
END
$$;

ROLLBACK;
