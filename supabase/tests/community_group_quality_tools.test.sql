\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('7b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'quality-owner@example.test', '', '{}', '{"username":"QualityOwner"}', now(), now()),
  ('7b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'quality-member@example.test', '', '{}', '{"username":"QualityMember"}', now(), now()),
  ('7b000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'quality-helper@example.test', '', '{}', '{"username":"QualityHelper"}', now(), now());

UPDATE public.profiles SET is_public = true, created_at = now() - interval '30 days'
WHERE auth_user_id::text LIKE '7b000000-%';

CREATE TEMP TABLE quality_ids AS
SELECT
  (SELECT id FROM public.profiles WHERE auth_user_id = '7b000000-0000-0000-0000-000000000001') owner_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7b000000-0000-0000-0000-000000000002') member_id,
  (SELECT id FROM public.profiles WHERE auth_user_id = '7b000000-0000-0000-0000-000000000003') helper_id,
  NULL::uuid group_id,
  gen_random_uuid() question_id,
  gen_random_uuid() answer_id;
GRANT SELECT ON quality_ids TO PUBLIC;

DO $$
DECLARE created public.community_groups;
BEGIN
  created := public.create_community_group(
    (SELECT owner_id FROM quality_ids), 'quality-tools', 'Quality Tools', 'Group quality controls.',
    'technical', ARRAY['Be specific', 'No spam'], NULL, NULL, NULL, NULL, NULL,
    'members', 'public', 'open'
  );
  UPDATE quality_ids SET group_id = created.id;
  PERFORM public.join_curated_community_group((SELECT member_id FROM quality_ids), created.id);
  PERFORM public.join_curated_community_group((SELECT helper_id FROM quality_ids), created.id);
END
$$;

-- New members see rules before their first post; acknowledgement is
-- idempotent and rule edits require a new acknowledgement.
DO $$
DECLARE hit boolean := false;
DECLARE result jsonb;
DECLARE version_before integer;
BEGIN
  BEGIN
    INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
    SELECT member_id, group_id, 'Posting without accepting the rules', 'public', 'active', 'active' FROM quality_ids;
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'group rules acknowledgement required';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'unacknowledged member posted'; END IF;

  result := public.acknowledge_community_group_rules((SELECT member_id FROM quality_ids), (SELECT group_id FROM quality_ids));
  IF result->>'changed' <> 'true' THEN RAISE EXCEPTION 'first acknowledgement was not recorded'; END IF;
  result := public.acknowledge_community_group_rules((SELECT member_id FROM quality_ids), (SELECT group_id FROM quality_ids));
  IF result->>'changed' <> 'false' THEN RAISE EXCEPTION 'acknowledgement was not idempotent'; END IF;

  INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
  SELECT member_id, group_id, 'First rules-aware post', 'public', 'active', 'active' FROM quality_ids;

  SELECT rules_version INTO version_before FROM public.community_groups WHERE id = (SELECT group_id FROM quality_ids);
  UPDATE public.community_groups SET rules = ARRAY['Be specific', 'No spam', 'Use clear titles']
  WHERE id = (SELECT group_id FROM quality_ids);
  IF (SELECT rules_version FROM public.community_groups WHERE id = (SELECT group_id FROM quality_ids)) <> version_before + 1 THEN
    RAISE EXCEPTION 'rules version did not advance';
  END IF;
  hit := false;
  BEGIN
    INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
    SELECT member_id, group_id, 'Posting after rules changed', 'public', 'active', 'active' FROM quality_ids;
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM = 'group rules acknowledgement required';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'rules change did not require acknowledgement'; END IF;
  PERFORM public.acknowledge_community_group_rules((SELECT member_id FROM quality_ids), (SELECT group_id FROM quality_ids));
END
$$;

-- Slow mode is moderator-controlled and includes every prior post creation,
-- even if the author later archives it.
DO $$
DECLARE hit boolean := false;
BEGIN
  PERFORM public.set_community_group_slow_mode((SELECT owner_id FROM quality_ids), (SELECT group_id FROM quality_ids), 30);
  BEGIN
    INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
    SELECT member_id, group_id, 'Too soon under slow mode', 'public', 'active', 'active' FROM quality_ids;
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM LIKE 'group slow mode active; retry after % seconds';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'slow mode did not block a rapid post'; END IF;

  UPDATE public.community_posts SET created_at = now() - interval '31 seconds'
  WHERE group_id = (SELECT group_id FROM quality_ids) AND author_id = (SELECT member_id FROM quality_ids);
  INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
  SELECT member_id, group_id, 'Allowed after slow mode elapsed', 'public', 'active', 'active' FROM quality_ids;
END
$$;

-- Temporary restrictions follow the role hierarchy, require a reason, and
-- leave prior posts intact. Restoring access is audited separately.
DO $$
DECLARE hit boolean := false;
BEGIN
  PERFORM public.set_group_member_posting_restriction(
    (SELECT owner_id FROM quality_ids), (SELECT group_id FROM quality_ids),
    (SELECT member_id FROM quality_ids), now() + interval '1 day', 'Repeated off-topic posts'
  );
  UPDATE public.community_posts SET created_at = now() - interval '31 seconds'
  WHERE group_id = (SELECT group_id FROM quality_ids) AND author_id = (SELECT member_id FROM quality_ids);
  BEGIN
    INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
    SELECT member_id, group_id, 'Blocked by temporary restriction', 'public', 'active', 'active' FROM quality_ids;
  EXCEPTION WHEN OTHERS THEN hit := SQLERRM LIKE 'group posting restricted until %';
  END;
  IF NOT hit THEN RAISE EXCEPTION 'temporary restriction did not block posting'; END IF;
  PERFORM public.set_group_member_posting_restriction(
    (SELECT owner_id FROM quality_ids), (SELECT group_id FROM quality_ids),
    (SELECT member_id FROM quality_ids), NULL, NULL
  );
  INSERT INTO public.community_posts (author_id, group_id, content, audience, status, moderation_status)
  SELECT member_id, group_id, 'Posting restored', 'public', 'active', 'active' FROM quality_ids;
  IF (SELECT count(*) FROM public.community_group_moderation_events
      WHERE group_id = (SELECT group_id FROM quality_ids)
        AND action IN ('slow_mode_changed', 'member_posting_restricted', 'member_posting_restored')) <> 3 THEN
    RAISE EXCEPTION 'quality control audit events are incomplete';
  END IF;
END
$$;

-- Accepted answers can become searchable FAQ entries; manual entries can be
-- edited, and non-members cannot read a private group's FAQ via the RPC.
DO $$
DECLARE faq public.community_group_faq_entries;
BEGIN
  PERFORM public.acknowledge_community_group_rules((SELECT owner_id FROM quality_ids), (SELECT group_id FROM quality_ids));
  PERFORM public.acknowledge_community_group_rules((SELECT helper_id FROM quality_ids), (SELECT group_id FROM quality_ids));
  INSERT INTO public.community_posts (id, author_id, group_id, content, audience, post_type, status, moderation_status)
  SELECT question_id, owner_id, group_id, 'What tire pressure should I use?', 'public', 'question', 'active', 'active'
  FROM quality_ids;
  INSERT INTO public.community_comments (id, post_id, author_id, content, status, moderation_status)
  SELECT answer_id, question_id, helper_id, 'Use the door-jamb placard pressure when the tires are cold.', 'active', 'active'
  FROM quality_ids;
  PERFORM public.set_accepted_community_answer(
    (SELECT owner_id FROM quality_ids), (SELECT question_id FROM quality_ids), (SELECT answer_id FROM quality_ids)
  );
  faq := public.upsert_community_group_faq(
    (SELECT owner_id FROM quality_ids), (SELECT group_id FROM quality_ids), NULL, NULL, NULL,
    (SELECT question_id FROM quality_ids)
  );
  IF faq.source_comment_id <> (SELECT answer_id FROM quality_ids) THEN RAISE EXCEPTION 'accepted answer was not copied'; END IF;
  IF (SELECT count(*) FROM public.list_community_group_faq(
      (SELECT member_id FROM quality_ids), (SELECT group_id FROM quality_ids), 'door-jamb', 20, 0)) <> 1 THEN
    RAISE EXCEPTION 'faq search did not find the accepted answer';
  END IF;

  faq := public.upsert_community_group_faq(
    (SELECT owner_id FROM quality_ids), (SELECT group_id FROM quality_ids), NULL,
    'How should I title a question?', 'Include the vehicle and the symptom.', NULL
  );
  faq := public.upsert_community_group_faq(
    (SELECT owner_id FROM quality_ids), (SELECT group_id FROM quality_ids), faq.id,
    'How should I write a question?', 'Include the vehicle, symptom, and recent work.', NULL
  );
  IF faq.question <> 'How should I write a question?' THEN RAISE EXCEPTION 'faq update failed'; END IF;
  PERFORM public.delete_community_group_faq((SELECT owner_id FROM quality_ids), (SELECT group_id FROM quality_ids), faq.id);
END
$$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.acknowledge_community_group_rules(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.set_community_group_slow_mode(uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.set_group_member_posting_restriction(uuid,uuid,uuid,timestamptz,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.upsert_community_group_faq(uuid,uuid,uuid,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.delete_community_group_faq(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'group quality RPC leaked to authenticated clients';
  END IF;
END
$$;

ROLLBACK;
