BEGIN;

CREATE TYPE public.community_post_assembly_state AS ENUM (
  'assembling', 'submitted', 'finalized'
);

CREATE TABLE public.community_post_assemblies (
  post_id uuid PRIMARY KEY REFERENCES public.community_posts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  creation_token uuid NOT NULL,
  expected_media_count smallint NOT NULL CHECK (expected_media_count BETWEEN 1 AND 10),
  state public.community_post_assembly_state NOT NULL DEFAULT 'assembling',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  finalized_at timestamptz,
  UNIQUE (owner_id, creation_token),
  CHECK (
    (state = 'assembling' AND submitted_at IS NULL AND finalized_at IS NULL)
    OR (state = 'submitted' AND submitted_at IS NOT NULL AND finalized_at IS NULL)
    OR (state = 'finalized' AND finalized_at IS NOT NULL)
  )
);

CREATE INDEX community_post_assemblies_expiry_idx
  ON public.community_post_assemblies(state, expires_at)
  WHERE state = 'assembling';

ALTER TABLE public.community_post_assemblies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_post_assemblies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_post_assemblies TO service_role;

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
  p_moderation_version text
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
    moderation_checked_at, moderation_version
  ) VALUES (
    p_author_id, p_audience, p_vehicle_id, p_marketplace_listing_id, p_group_id,
    p_post_type, p_content, 'hidden', p_moderation_status, p_moderation_reason,
    p_moderation_checked_at, p_moderation_version
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

CREATE FUNCTION public.community_post_assembly_media_ready(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_post_assemblies assembly
    WHERE assembly.post_id = p_post_id
      AND assembly.state <> 'finalized'
      AND assembly.expected_media_count = (
        SELECT count(*) FROM public.community_post_media media WHERE media.post_id = p_post_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.community_post_media media
        WHERE media.post_id = p_post_id AND media.moderation_status <> 'active'
      )
  );
$$;

CREATE FUNCTION public.guard_community_post_assembly_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state public.community_post_assembly_state;
BEGIN
  SELECT assembly.state INTO v_state
  FROM public.community_post_assemblies assembly
  WHERE assembly.post_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND OR v_state = 'finalized' OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.moderation_status = 'active'
     AND public.community_post_assembly_media_ready(NEW.id) THEN
    UPDATE public.community_post_assemblies
    SET state = 'finalized', finalized_at = now(), submitted_at = COALESCE(submitted_at, now())
    WHERE post_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Moderation may approve the text before every photo is ready. The post
  -- remains hidden until the assembly itself is complete.
  NEW.status := 'hidden';
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_posts_guard_assembly_publication
  BEFORE UPDATE OF status, moderation_status ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_post_assembly_publication();

CREATE FUNCTION public.try_finalize_community_post_assembly()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected_count integer;
  v_media_count integer;
BEGIN
  SELECT assembly.expected_media_count INTO v_expected_count
  FROM public.community_post_assemblies assembly
  WHERE assembly.post_id = NEW.post_id
    AND assembly.state <> 'finalized'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_media_count
  FROM public.community_post_media media
  WHERE media.post_id = NEW.post_id;

  IF v_media_count <> v_expected_count THEN
    RETURN NEW;
  END IF;

  IF NEW.moderation_status = 'active' AND EXISTS (
    SELECT 1
    FROM public.community_posts post
    WHERE post.id = NEW.post_id
      AND post.moderation_status = 'active'
  ) AND public.community_post_assembly_media_ready(NEW.post_id) THEN
    UPDATE public.community_post_assemblies
    SET state = 'finalized', finalized_at = now(), submitted_at = COALESCE(submitted_at, now())
    WHERE post_id = NEW.post_id AND state <> 'finalized';
    UPDATE public.community_posts
    SET status = 'active'
    WHERE id = NEW.post_id AND moderation_status = 'active';
  ELSE
    -- Preserve a complete draft in the owner's review queue even if the
    -- client disappears before making its explicit finalize request.
    UPDATE public.community_post_assemblies
    SET state = 'submitted', submitted_at = COALESCE(submitted_at, now())
    WHERE post_id = NEW.post_id AND state = 'assembling';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_media_try_finalize_assembly
  AFTER INSERT OR UPDATE OF moderation_status ON public.community_post_media
  FOR EACH ROW EXECUTE FUNCTION public.try_finalize_community_post_assembly();

CREATE FUNCTION public.finalize_community_post_assembly(
  p_actor_profile_id uuid,
  p_post_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_assembly public.community_post_assemblies%ROWTYPE;
  v_post public.community_posts%ROWTYPE;
  v_media_count integer;
  v_media_status text;
  v_published boolean := false;
BEGIN
  SELECT * INTO v_assembly
  FROM public.community_post_assemblies assembly
  WHERE assembly.post_id = p_post_id
  FOR UPDATE;
  IF NOT FOUND OR v_assembly.owner_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'post assembly unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_post FROM public.community_posts WHERE id = p_post_id FOR UPDATE;
  IF NOT FOUND OR v_post.author_id <> p_actor_profile_id THEN
    RAISE EXCEPTION 'post assembly unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_media_count
  FROM public.community_post_media media WHERE media.post_id = p_post_id;
  IF v_media_count <> v_assembly.expected_media_count THEN
    RAISE EXCEPTION 'post media assembly is incomplete' USING ERRCODE = 'check_violation';
  END IF;

  SELECT CASE
    WHEN bool_or(media.moderation_status = 'legal_hold') THEN 'legal_hold'
    WHEN bool_or(media.moderation_status = 'rejected') THEN 'rejected'
    WHEN bool_or(media.moderation_status = 'pending_review') THEN 'pending_review'
    WHEN bool_or(media.moderation_status = 'pending_scan') THEN 'pending_scan'
    ELSE 'active'
  END INTO v_media_status
  FROM public.community_post_media media WHERE media.post_id = p_post_id;

  IF v_assembly.state = 'finalized' OR (
    v_post.moderation_status = 'active' AND v_media_status = 'active'
  ) THEN
    UPDATE public.community_post_assemblies
    SET state = 'finalized', submitted_at = COALESCE(submitted_at, now()),
        finalized_at = COALESCE(finalized_at, now())
    WHERE post_id = p_post_id;
    UPDATE public.community_posts SET status = 'active' WHERE id = p_post_id;
    v_published := true;
  ELSE
    UPDATE public.community_post_assemblies
    SET state = 'submitted', submitted_at = COALESCE(submitted_at, now())
    WHERE post_id = p_post_id AND state = 'assembling';
    UPDATE public.community_posts SET status = 'hidden' WHERE id = p_post_id;
  END IF;

  RETURN jsonb_build_object(
    'postId', p_post_id,
    'published', v_published,
    'moderationStatus', CASE
      WHEN v_post.moderation_status <> 'active' THEN v_post.moderation_status
      ELSE v_media_status
    END
  );
END;
$$;

CREATE FUNCTION public.expire_community_post_assemblies(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post_id uuid;
  v_media_ids uuid[];
  v_expired integer := 0;
BEGIN
  FOR v_post_id IN
    SELECT assembly.post_id
    FROM public.community_post_assemblies assembly
    WHERE assembly.state = 'assembling'
      AND assembly.expires_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.moderation_items item
        WHERE (
          (item.entity_type = 'community_post' AND item.entity_id = assembly.post_id)
          OR (item.entity_type = 'community_post_media' AND item.entity_id IN (
            SELECT media.id FROM public.community_post_media media WHERE media.post_id = assembly.post_id
          ))
        ) AND item.status <> 'active'
      )
    ORDER BY assembly.expires_at
    LIMIT GREATEST(1, LEAST(p_limit, 500))
    FOR UPDATE OF assembly SKIP LOCKED
  LOOP
    SELECT COALESCE(array_agg(media.id), ARRAY[]::uuid[]) INTO v_media_ids
    FROM public.community_post_media media WHERE media.post_id = v_post_id;

    INSERT INTO public.storage_cleanup_jobs (storage_reference, reason, status, next_attempt_at)
    SELECT DISTINCT reference, 'expired_post_assembly', 'pending', now()
    FROM (
      SELECT reservation.storage_reference AS reference
      FROM public.community_upload_reservations reservation WHERE reservation.post_id = v_post_id
      UNION ALL
      SELECT media.url FROM public.community_post_media media WHERE media.post_id = v_post_id
      UNION ALL
      SELECT media.display_reference FROM public.community_post_media media
      WHERE media.post_id = v_post_id AND media.display_reference IS NOT NULL
    ) AS storage_refs
    WHERE reference ~ '^r2-private:///'
    ON CONFLICT (storage_reference) DO UPDATE
      SET status = 'pending', reason = 'expired_post_assembly', next_attempt_at = now(), completed_at = NULL;

    DELETE FROM public.community_upload_reservations WHERE post_id = v_post_id;
    DELETE FROM public.moderation_hashes
    WHERE entity_type = 'community_post_media' AND entity_id = ANY(v_media_ids);
    DELETE FROM public.moderation_items
    WHERE (entity_type = 'community_post' AND entity_id = v_post_id)
       OR (entity_type = 'community_post_media' AND entity_id = ANY(v_media_ids));
    DELETE FROM public.community_posts WHERE id = v_post_id;
    v_expired := v_expired + 1;
  END LOOP;
  RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION public.create_community_post_assembly(
  uuid, uuid, smallint, public.community_post_audience, uuid, uuid, uuid,
  public.community_post_type, text, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_post_assembly_media_ready(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_community_post_assembly_publication() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_finalize_community_post_assembly() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_community_post_assembly(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_community_post_assemblies(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_post_assembly(
  uuid, uuid, smallint, public.community_post_audience, uuid, uuid, uuid,
  public.community_post_type, text, text, text, timestamptz, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_community_post_assembly(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_community_post_assemblies(integer) TO service_role;

COMMENT ON TABLE public.community_post_assemblies IS
  'Private server-owned publication assembly. Its post remains hidden until the expected moderated media set is complete.';

COMMIT;
