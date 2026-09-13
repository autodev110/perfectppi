\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '8f100000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'safety-analytics-one@example.test', '', '{}',
    '{"username":"SafetyAnalytic1"}', now() - interval '40 days', now()
  ),
  (
    '8f100000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'safety-analytics-two@example.test', '', '{}',
    '{"username":"SafetyAnalytic2"}', now() - interval '40 days', now()
  );

SELECT set_config('test.safety_analytics_profile_one', id::text, true)
FROM public.profiles
WHERE auth_user_id = '8f100000-0000-0000-0000-000000000001'::uuid;
SELECT set_config('test.safety_analytics_profile_two', id::text, true)
FROM public.profiles
WHERE auth_user_id = '8f100000-0000-0000-0000-000000000002'::uuid;

-- Reproduce the production/fresh-migration boundary even if a developer's
-- reused local database retained a historical service-role table grant.
REVOKE SELECT ON public.community_posts, public.community_comments, public.community_post_media
  FROM service_role;

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_one uuid := current_setting('test.safety_analytics_profile_one')::uuid;
  v_two uuid := current_setting('test.safety_analytics_profile_two')::uuid;
  v_summary jsonb;
BEGIN
  PERFORM public.record_product_analytics_event(v_one, 'listing_viewed', 'marketplace', repeat('1', 64));
  PERFORM public.record_product_analytics_event(v_one, 'seller_message_started', 'marketplace', repeat('2', 64));
  INSERT INTO public.friend_request_events (actor_id, target_id, event)
  VALUES (v_one, v_two, 'sent'), (v_two, v_one, 'accepted');
  INSERT INTO public.profile_blocks (blocker_id, blocked_id) VALUES (v_one, v_two);
  INSERT INTO public.profile_mutes (muter_id, muted_id) VALUES (v_two, v_one);
  INSERT INTO public.notification_preferences (profile_id, category, in_app, push)
  VALUES (v_one, 'social', false, false);

  v_summary := public.get_product_safety_analytics_summary(30);
  IF (v_summary ->> 'windowDays')::integer <> 30 THEN
    RAISE EXCEPTION 'analytics window was not preserved';
  END IF;
  IF (v_summary #>> '{product,friendRequestsSent}')::integer <> 1
     OR (v_summary #>> '{product,friendRequestsAccepted}')::integer <> 1 THEN
    RAISE EXCEPTION 'friend request aggregates are incorrect';
  END IF;
  IF (v_summary #>> '{safety,blocksCreated}')::integer <> 1
     OR (v_summary #>> '{safety,mutesCreated}')::integer <> 1 THEN
    RAISE EXCEPTION 'block or mute aggregates are incorrect';
  END IF;
  IF (v_summary #>> '{safety,notificationOptOut,optedOutProfiles}')::integer <> 1 THEN
    RAISE EXCEPTION 'notification opt-out aggregate is incorrect';
  END IF;
  IF jsonb_array_length(v_summary #> '{product,marketplaceFunnel}') <> 5 THEN
    RAISE EXCEPTION 'marketplace funnel stages are incomplete';
  END IF;
  IF v_summary #> '{safety,reportBreakdown}' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'empty report breakdown was not returned safely';
  END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege(
       'authenticated', 'public.get_product_safety_analytics_summary(integer)', 'EXECUTE'
     ) OR has_function_privilege(
       'anon', 'public.get_product_safety_analytics_summary(integer)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'aggregate analytics function leaked to application roles';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'get_product_safety_analytics_summary'
      AND procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'aggregate analytics function is missing its restricted definer boundary';
  END IF;
END
$$;

ROLLBACK;
