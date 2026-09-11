-- Plan 14.2 / 14.7: structured post types. Each type's fields live in
-- `community_posts.details` (jsonb) and are validated per type by a trigger,
-- so the shape is enforced whether the row comes from the text path or the
-- media assembly RPC. Details travel with revisions (14.6).
--
--   build_update          { stage: planning|in_progress|complete, parts?: text[] ≤10×60 }
--   maintenance           { service: 1..80 chars, mileage?, cost_cents?, diy?: bool, parts?: text[] }
--   before_after          {} — needs at least two photos (checked on the assembly)
--   inspection_discussion { inspection_request_id } — the author's own submitted /
--                         completed inspection of the attached vehicle; cards show
--                         scope, status, and date only, never findings
--   buying_advice         { budget_cents?, year_min?, year_max?, makes?: text[] ≤5, use_case?: ≤120 }
--   poll                  { poll: { duration_hours: 24|72|168, options: [{key,label}] 2..6 } }
--                         closes_at is stamped by the trigger; options freeze after
--                         the first vote; votes are private (counts only).

BEGIN;

ALTER TABLE public.community_posts
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN poll_closes_at timestamptz;
ALTER TABLE public.community_post_revisions
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX community_posts_poll_open_idx
  ON public.community_posts(poll_closes_at)
  WHERE poll_closes_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1. Details validation
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.community_text_array_ok(p_value jsonb, p_max_items integer, p_max_length integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_value IS NULL OR (
    jsonb_typeof(p_value) = 'array'
    AND jsonb_array_length(p_value) <= p_max_items
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_value) element
      WHERE jsonb_typeof(element) <> 'string'
         OR char_length(btrim(element #>> '{}')) NOT BETWEEN 1 AND p_max_length
    )
  );
$$;

CREATE FUNCTION public.validate_community_post_details()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  d jsonb := COALESCE(NEW.details, '{}'::jsonb);
  v_allowed text[];
  v_key text;
  v_poll jsonb;
  v_option jsonb;
  v_keys text[] := ARRAY[]::text[];
  v_duration integer;
  v_request public.ppi_requests%ROWTYPE;
BEGIN
  IF jsonb_typeof(d) <> 'object' THEN
    RAISE EXCEPTION 'post details must be an object' USING ERRCODE = 'check_violation';
  END IF;

  v_allowed := CASE NEW.post_type::text
    WHEN 'build_update' THEN ARRAY['stage', 'parts']
    WHEN 'maintenance' THEN ARRAY['service', 'mileage', 'cost_cents', 'diy', 'parts']
    WHEN 'inspection_discussion' THEN ARRAY['inspection_request_id']
    WHEN 'buying_advice' THEN ARRAY['budget_cents', 'year_min', 'year_max', 'makes', 'use_case']
    WHEN 'poll' THEN ARRAY['poll']
    ELSE ARRAY[]::text[]
  END;
  FOR v_key IN SELECT jsonb_object_keys(d) LOOP
    IF NOT (v_key = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'post details do not match the post type' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  CASE NEW.post_type::text
  WHEN 'build_update' THEN
    IF NOT (d->>'stage' IN ('planning', 'in_progress', 'complete')) THEN
      RAISE EXCEPTION 'build updates need a stage' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.community_text_array_ok(d->'parts', 10, 60) THEN
      RAISE EXCEPTION 'build parts must be up to 10 short names' USING ERRCODE = 'check_violation';
    END IF;
  WHEN 'maintenance' THEN
    IF char_length(btrim(COALESCE(d->>'service', ''))) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'maintenance posts need the service performed' USING ERRCODE = 'check_violation';
    END IF;
    IF (d ? 'mileage' AND (jsonb_typeof(d->'mileage') <> 'number' OR (d->>'mileage')::numeric NOT BETWEEN 0 AND 2000000
         OR (d->>'mileage')::numeric <> trunc((d->>'mileage')::numeric)))
       OR (d ? 'cost_cents' AND (jsonb_typeof(d->'cost_cents') <> 'number' OR (d->>'cost_cents')::numeric NOT BETWEEN 0 AND 100000000
         OR (d->>'cost_cents')::numeric <> trunc((d->>'cost_cents')::numeric)))
       OR (d ? 'diy' AND jsonb_typeof(d->'diy') <> 'boolean')
       OR NOT public.community_text_array_ok(d->'parts', 10, 60) THEN
      RAISE EXCEPTION 'maintenance details are out of range' USING ERRCODE = 'check_violation';
    END IF;
  WHEN 'inspection_discussion' THEN
    IF NEW.vehicle_id IS NULL OR (d->>'inspection_request_id') IS NULL THEN
      RAISE EXCEPTION 'inspection discussions attach the inspected vehicle and inspection' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_request FROM public.ppi_requests WHERE id = (d->>'inspection_request_id')::uuid;
    IF NOT FOUND OR v_request.requester_id IS DISTINCT FROM NEW.author_id
       OR v_request.vehicle_id <> NEW.vehicle_id
       OR v_request.status NOT IN ('submitted', 'completed') THEN
      RAISE EXCEPTION 'only your own submitted or completed inspection of the attached vehicle can be discussed' USING ERRCODE = 'check_violation';
    END IF;
  WHEN 'buying_advice' THEN
    IF (d ? 'budget_cents' AND (jsonb_typeof(d->'budget_cents') <> 'number' OR (d->>'budget_cents')::numeric NOT BETWEEN 0 AND 100000000
         OR (d->>'budget_cents')::numeric <> trunc((d->>'budget_cents')::numeric)))
       OR (d ? 'year_min' AND (jsonb_typeof(d->'year_min') <> 'number' OR (d->>'year_min')::numeric NOT BETWEEN 1886 AND 2100
         OR (d->>'year_min')::numeric <> trunc((d->>'year_min')::numeric)))
       OR (d ? 'year_max' AND (jsonb_typeof(d->'year_max') <> 'number' OR (d->>'year_max')::numeric NOT BETWEEN 1886 AND 2100
         OR (d->>'year_max')::numeric <> trunc((d->>'year_max')::numeric)))
       OR (d ? 'year_min' AND d ? 'year_max' AND (d->>'year_min')::numeric > (d->>'year_max')::numeric)
       OR NOT public.community_text_array_ok(d->'makes', 5, 40)
       OR (d ? 'use_case' AND (jsonb_typeof(d->'use_case') <> 'string' OR char_length(btrim(d->>'use_case')) NOT BETWEEN 1 AND 120)) THEN
      RAISE EXCEPTION 'buying advice details are out of range' USING ERRCODE = 'check_violation';
    END IF;
  WHEN 'poll' THEN
    v_poll := d->'poll';
    IF v_poll IS NULL OR jsonb_typeof(v_poll) <> 'object' OR jsonb_typeof(v_poll->'options') <> 'array' THEN
      RAISE EXCEPTION 'polls need options' USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_array_length(v_poll->'options') NOT BETWEEN 2 AND 6 THEN
      RAISE EXCEPTION 'polls need between 2 and 6 options' USING ERRCODE = 'check_violation';
    END IF;
    FOR v_option IN SELECT * FROM jsonb_array_elements(v_poll->'options') LOOP
      IF jsonb_typeof(v_option) <> 'object'
         OR (v_option->>'key') !~ '^[a-z0-9_-]{1,32}$'
         OR char_length(btrim(COALESCE(v_option->>'label', ''))) NOT BETWEEN 1 AND 80
         OR (v_option->>'key') = ANY(v_keys) THEN
        RAISE EXCEPTION 'poll options need distinct keys and non-empty labels' USING ERRCODE = 'check_violation';
      END IF;
      v_keys := array_append(v_keys, v_option->>'key');
    END LOOP;
    v_duration := CASE WHEN jsonb_typeof(v_poll->'duration_hours') = 'number' THEN (v_poll->>'duration_hours')::integer END;
    IF v_duration IS NULL OR (v_poll->>'duration_hours')::numeric <> trunc((v_poll->>'duration_hours')::numeric)
       OR v_duration NOT IN (24, 72, 168) THEN
      RAISE EXCEPTION 'polls run for 24 hours, 3 days, or 7 days' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'INSERT' THEN
      NEW.poll_closes_at := COALESCE(NEW.created_at, now()) + make_interval(hours => v_duration);
    ELSIF OLD.post_type <> 'poll' THEN
      NEW.poll_closes_at := COALESCE(NEW.created_at, now()) + make_interval(hours => v_duration);
    ELSIF OLD.details->'poll'->'options' IS DISTINCT FROM v_poll->'options'
          AND EXISTS (SELECT 1 FROM public.community_poll_votes vote WHERE vote.post_id = NEW.id) THEN
      RAISE EXCEPTION 'poll options cannot change after the first vote' USING ERRCODE = 'check_violation';
    ELSIF OLD.details->'poll'->>'duration_hours' IS DISTINCT FROM v_poll->>'duration_hours' THEN
      RAISE EXCEPTION 'poll duration cannot change' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    NULL;
  END CASE;

  IF NEW.post_type <> 'poll' THEN
    NEW.poll_closes_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Votes reference the post; the trigger needs the table to exist first.
CREATE TABLE public.community_poll_votes (
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_key text NOT NULL CHECK (option_key ~ '^[a-z0-9_-]{1,32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, profile_id)
);
CREATE INDEX community_poll_votes_post_option_idx ON public.community_poll_votes(post_id, option_key);
ALTER TABLE public.community_poll_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_poll_votes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_poll_votes TO service_role;
COMMENT ON TABLE public.community_poll_votes IS
  'One vote per account per poll; the account link exists for integrity and is never exposed — readers get counts only.';

CREATE TRIGGER community_posts_validate_details
  BEFORE INSERT OR UPDATE OF details, post_type, vehicle_id ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.validate_community_post_details();

-- Before / After needs two photos: the assembly carries the count.
CREATE FUNCTION public.guard_before_after_assembly()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.community_posts post
    WHERE post.id = NEW.post_id AND post.post_type = 'before_after'
  ) AND NEW.expected_media_count < 2 THEN
    RAISE EXCEPTION 'before and after posts need at least two photos' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_post_assemblies_before_after
  BEFORE INSERT ON public.community_post_assemblies
  FOR EACH ROW EXECUTE FUNCTION public.guard_before_after_assembly();

-- ---------------------------------------------------------------------------
-- 2. Revisions carry details; edits to details count as edits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_community_post_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
  v_is_edit boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.active_revision_id := COALESCE(NEW.active_revision_id, gen_random_uuid());
    RETURN NEW;
  END IF;

  v_is_edit := NEW.content IS DISTINCT FROM OLD.content
    OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
    OR NEW.marketplace_listing_id IS DISTINCT FROM OLD.marketplace_listing_id
    OR NEW.group_id IS DISTINCT FROM OLD.group_id
    OR NEW.post_type IS DISTINCT FROM OLD.post_type
    OR NEW.details IS DISTINCT FROM OLD.details
    OR (
      NEW.audience IS DISTINCT FROM OLD.audience
      AND NOT (OLD.audience = 'public' AND NEW.audience = 'friends')
    );

  IF NEW.active_revision_id IS DISTINCT FROM OLD.active_revision_id AND NOT v_is_edit THEN
    RAISE EXCEPTION 'active revision is managed by the revision trigger';
  END IF;
  IF v_is_edit THEN
    IF OLD.status <> 'active' OR OLD.moderation_status <> 'active' THEN
      RAISE EXCEPTION 'content under review or removal cannot be edited';
    END IF;
    IF OLD.post_type = 'question' AND NEW.post_type <> 'question'
       AND OLD.accepted_answer_comment_id IS NOT NULL THEN
      RAISE EXCEPTION 'clear the accepted answer before changing post type';
    END IF;
    IF OLD.post_type = 'poll' AND NEW.post_type <> 'poll'
       AND EXISTS (SELECT 1 FROM public.community_poll_votes vote WHERE vote.post_id = OLD.id) THEN
      RAISE EXCEPTION 'a poll with votes cannot change type';
    END IF;
    SELECT revision_number + 1 INTO v_revision_number
    FROM public.community_post_revisions
    WHERE id = OLD.active_revision_id;
    IF v_revision_number IS NULL THEN
      RAISE EXCEPTION 'active post revision is unavailable';
    END IF;
    NEW.active_revision_id := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_community_post_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_revision_number integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_revision_number := 1;
  ELSE
    IF NEW.active_revision_id IS NOT DISTINCT FROM OLD.active_revision_id THEN
      RETURN NEW;
    END IF;
    SELECT revision_number + 1 INTO v_revision_number
    FROM public.community_post_revisions
    WHERE id = OLD.active_revision_id;
  END IF;

  INSERT INTO public.community_post_revisions (
    id, post_id, revision_number, content, audience, vehicle_id,
    marketplace_listing_id, author_id, group_id, group_status, post_type, details
  ) VALUES (
    NEW.active_revision_id, NEW.id, v_revision_number, NEW.content, NEW.audience,
    NEW.vehicle_id, NEW.marketplace_listing_id, NEW.author_id, NEW.group_id,
    NEW.group_status, NEW.post_type, NEW.details
  );
  RETURN NEW;
END;
$$;

-- The revision triggers watch a column list; details joins it.
DROP TRIGGER community_posts_capture_revision ON public.community_posts;
CREATE TRIGGER community_posts_capture_revision
  BEFORE INSERT OR UPDATE OF content, audience, vehicle_id, marketplace_listing_id, group_id, group_status, post_type, active_revision_id, details
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.capture_community_post_revision();
DROP TRIGGER community_posts_persist_revision ON public.community_posts;
CREATE TRIGGER community_posts_persist_revision
  AFTER INSERT OR UPDATE OF content, audience, vehicle_id, marketplace_listing_id, group_id, group_status, post_type, active_revision_id, details
  ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.persist_community_post_revision();

-- ---------------------------------------------------------------------------
-- 3. Assembly RPC accepts details
-- ---------------------------------------------------------------------------
DROP FUNCTION public.create_community_post_assembly(uuid, uuid, smallint, public.community_post_audience, uuid, uuid, uuid, public.community_post_type, text, text, text, timestamptz, text);
CREATE FUNCTION public.create_community_post_assembly(
  p_author_id uuid,
  p_creation_token uuid,
  p_expected_media_count smallint,
  p_audience public.community_post_audience,
  p_vehicle_id uuid,
  p_marketplace_listing_id uuid,
  p_group_id uuid,
  p_post_type public.community_post_type,
  p_content text,
  p_moderation_status text,
  p_moderation_reason text,
  p_moderation_checked_at timestamptz,
  p_moderation_version text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post_id uuid;
BEGIN
  IF p_expected_media_count NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'invalid expected media count' USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize retries for the same client-generated token before checking it.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_author_id::text || ':' || p_creation_token::text, 0));
  SELECT assembly.post_id INTO v_post_id
  FROM public.community_post_assemblies assembly
  WHERE assembly.owner_id = p_author_id
    AND assembly.creation_token = p_creation_token;
  IF FOUND THEN
    RETURN v_post_id;
  END IF;

  INSERT INTO public.community_posts (
    author_id, audience, vehicle_id, marketplace_listing_id, group_id,
    post_type, content, status, moderation_status, moderation_reason,
    moderation_checked_at, moderation_version, details
  ) VALUES (
    p_author_id, p_audience, p_vehicle_id, p_marketplace_listing_id, p_group_id,
    p_post_type, p_content, 'hidden', p_moderation_status, p_moderation_reason,
    p_moderation_checked_at, p_moderation_version, COALESCE(p_details, '{}'::jsonb)
  )
  RETURNING id INTO v_post_id;

  INSERT INTO public.community_post_assemblies (
    post_id, owner_id, creation_token, expected_media_count
  ) VALUES (
    v_post_id, p_author_id, p_creation_token, p_expected_media_count
  );

  RETURN v_post_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Polls: vote, and results for a viewer (counts only)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.community_poll_results(p_viewer_id uuid, p_post_ids uuid[])
RETURNS TABLE(post_id uuid, closes_at timestamptz, closed boolean, total_votes integer, viewer_option_key text, options jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH visible AS (
    SELECT post.id, post.poll_closes_at, post.details
    FROM public.community_posts post
    WHERE post.id = ANY(COALESCE(p_post_ids, ARRAY[]::uuid[]))
      AND post.post_type = 'poll'
      AND public.social_can_view_community_post(p_viewer_id, post.id, true)
  ),
  mine AS (
    SELECT vote.post_id, vote.option_key
    FROM public.community_poll_votes vote
    WHERE vote.profile_id = p_viewer_id AND vote.post_id IN (SELECT id FROM visible)
  ),
  counts AS (
    SELECT vote.post_id, vote.option_key, count(*)::integer AS votes
    FROM public.community_poll_votes vote
    WHERE vote.post_id IN (SELECT id FROM visible)
    GROUP BY vote.post_id, vote.option_key
  )
  SELECT
    visible.id,
    visible.poll_closes_at,
    visible.poll_closes_at <= now(),
    COALESCE((SELECT sum(counts.votes)::integer FROM counts WHERE counts.post_id = visible.id), 0),
    (SELECT mine.option_key FROM mine WHERE mine.post_id = visible.id),
    (
      SELECT jsonb_agg(jsonb_build_object(
        'key', option->>'key',
        'label', option->>'label',
        -- Results show after the viewer voted or the poll closed (14.2).
        'votes', CASE
          WHEN visible.poll_closes_at <= now() OR EXISTS (SELECT 1 FROM mine WHERE mine.post_id = visible.id)
            THEN COALESCE((SELECT counts.votes FROM counts WHERE counts.post_id = visible.id AND counts.option_key = option->>'key'), 0)
          ELSE NULL END
      ) ORDER BY ordinality)
      FROM jsonb_array_elements(visible.details->'poll'->'options') WITH ORDINALITY AS opts(option, ordinality)
    )
  FROM visible;
$$;

CREATE FUNCTION public.cast_community_poll_vote(p_actor_profile_id uuid, p_post_id uuid, p_option_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.community_posts%ROWTYPE;
  v_result record;
BEGIN
  IF NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_post FROM public.community_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  -- A hidden, removed, or out-of-audience poll stops voting (14.2).
  IF NOT public.social_can_view_community_post(p_actor_profile_id, p_post_id, true) THEN
    RAISE EXCEPTION 'post unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_post.post_type <> 'poll' THEN
    RAISE EXCEPTION 'not a poll' USING ERRCODE = 'check_violation';
  END IF;
  IF v_post.poll_closes_at <= now() THEN
    RAISE EXCEPTION 'poll_closed' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_post.details->'poll'->'options') option
    WHERE option->>'key' = p_option_key
  ) THEN
    RAISE EXCEPTION 'invalid poll option' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.community_poll_votes (post_id, profile_id, option_key)
  VALUES (p_post_id, p_actor_profile_id, p_option_key)
  ON CONFLICT (post_id, profile_id) DO UPDATE
    SET option_key = EXCLUDED.option_key, updated_at = now();

  SELECT * INTO v_result FROM public.community_poll_results(p_actor_profile_id, ARRAY[p_post_id]);
  RETURN jsonb_build_object(
    'postId', p_post_id,
    'closesAt', v_result.closes_at,
    'closed', v_result.closed,
    'totalVotes', v_result.total_votes,
    'viewerOptionKey', v_result.viewer_option_key,
    'options', v_result.options
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_text_array_ok(jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_community_post_details() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_before_after_assembly() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_community_post_assembly(uuid, uuid, smallint, public.community_post_audience, uuid, uuid, uuid, public.community_post_type, text, text, text, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_poll_results(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cast_community_poll_vote(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_post_assembly(uuid, uuid, smallint, public.community_post_audience, uuid, uuid, uuid, public.community_post_type, text, text, text, timestamptz, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_poll_results(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.cast_community_poll_vote(uuid, uuid, text) TO service_role;

COMMIT;
