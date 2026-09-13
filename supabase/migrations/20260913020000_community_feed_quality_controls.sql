BEGIN;

CREATE TYPE public.community_feed_mute_scope AS ENUM ('group', 'post_type', 'vehicle_topic');

CREATE TABLE public.community_feed_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope public.community_feed_mute_scope NOT NULL,
  target_key text NOT NULL CHECK (char_length(target_key) BETWEEN 1 AND 160),
  group_id uuid REFERENCES public.community_groups(id) ON DELETE CASCADE,
  post_type public.community_post_type,
  vehicle_make text,
  vehicle_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_feed_mutes_target_shape CHECK (
    (scope = 'group' AND group_id IS NOT NULL AND post_type IS NULL AND vehicle_make IS NULL AND vehicle_model IS NULL)
    OR (scope = 'post_type' AND group_id IS NULL AND post_type IS NOT NULL AND vehicle_make IS NULL AND vehicle_model IS NULL)
    OR (scope = 'vehicle_topic' AND group_id IS NULL AND post_type IS NULL AND vehicle_make IS NOT NULL)
  ),
  UNIQUE (profile_id, scope, target_key)
);

CREATE INDEX community_feed_mutes_profile_scope_idx
  ON public.community_feed_mutes(profile_id, scope);
CREATE INDEX community_feed_mutes_group_idx
  ON public.community_feed_mutes(profile_id, group_id)
  WHERE group_id IS NOT NULL;

ALTER TABLE public.community_feed_mutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.community_feed_mutes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.community_feed_mutes TO service_role;

COMMENT ON TABLE public.community_feed_mutes IS
  'Private feed-only preferences. They do not leave groups, alter friendships, or block direct links.';

CREATE FUNCTION public.community_feed_normalize_topic(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT NULLIF(regexp_replace(lower(btrim(COALESCE(p_value, ''))), '[[:space:]]+', ' ', 'g'), '');
$$;

CREATE FUNCTION public.community_feed_content_fingerprint(p_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT md5(regexp_replace(lower(btrim(COALESCE(p_content, ''))), '[[:space:][:punct:]]+', ' ', 'g'));
$$;

-- A post whose text is only punctuation ("...", "!!!") has nothing to
-- fingerprint; it gets a per-post value so two such posts by one author on
-- the same day never collapse into each other.
CREATE FUNCTION public.community_feed_post_fingerprint(p_post_id uuid, p_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN btrim(regexp_replace(COALESCE(p_content, ''), '[[:space:][:punct:]]+', ' ', 'g')) = '' THEN md5('post:' || p_post_id::text)
    ELSE public.community_feed_content_fingerprint(p_content)
  END;
$$;

ALTER TABLE public.community_posts ADD COLUMN feed_fingerprint text;
UPDATE public.community_posts
SET feed_fingerprint = public.community_feed_post_fingerprint(id, content);
ALTER TABLE public.community_posts ALTER COLUMN feed_fingerprint SET NOT NULL;

CREATE INDEX community_posts_repost_cluster_idx
  ON public.community_posts(author_id, feed_fingerprint, created_at DESC)
  WHERE status = 'active' AND moderation_status = 'active';

CREATE FUNCTION public.set_community_post_feed_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.feed_fingerprint := public.community_feed_post_fingerprint(NEW.id, NEW.content);
  RETURN NEW;
END;
$$;

CREATE TRIGGER community_posts_set_feed_fingerprint
  BEFORE INSERT OR UPDATE OF content ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_community_post_feed_fingerprint();

CREATE FUNCTION public.set_community_feed_mute(
  p_actor_profile_id uuid,
  p_scope public.community_feed_mute_scope,
  p_muted boolean,
  p_group_id uuid DEFAULT NULL,
  p_post_type public.community_post_type DEFAULT NULL,
  p_vehicle_make text DEFAULT NULL,
  p_vehicle_model text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_make text;
  v_model text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile_unavailable' USING ERRCODE = 'no_data_found';
  END IF;

  CASE p_scope
    WHEN 'group' THEN
      IF p_group_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.community_groups community_group WHERE community_group.id = p_group_id
      ) THEN
        RAISE EXCEPTION 'group_unavailable' USING ERRCODE = 'no_data_found';
      END IF;
      v_key := p_group_id::text;
    WHEN 'post_type' THEN
      IF p_post_type IS NULL THEN
        RAISE EXCEPTION 'post_type_required' USING ERRCODE = 'check_violation';
      END IF;
      v_key := p_post_type::text;
    WHEN 'vehicle_topic' THEN
      v_make := public.community_feed_normalize_topic(p_vehicle_make);
      v_model := public.community_feed_normalize_topic(p_vehicle_model);
      IF v_make IS NULL OR char_length(v_make) > 60 OR char_length(COALESCE(v_model, '')) > 60 THEN
        RAISE EXCEPTION 'vehicle_topic_invalid' USING ERRCODE = 'check_violation';
      END IF;
      v_key := v_make || ':' || COALESCE(v_model, '*');
  END CASE;

  IF p_muted THEN
    INSERT INTO public.community_feed_mutes (
      profile_id, scope, target_key, group_id, post_type, vehicle_make, vehicle_model
    ) VALUES (
      p_actor_profile_id,
      p_scope,
      v_key,
      CASE WHEN p_scope = 'group' THEN p_group_id END,
      CASE WHEN p_scope = 'post_type' THEN p_post_type END,
      CASE WHEN p_scope = 'vehicle_topic' THEN v_make END,
      CASE WHEN p_scope = 'vehicle_topic' THEN v_model END
    )
    ON CONFLICT (profile_id, scope, target_key) DO NOTHING;
    RETURN true;
  END IF;

  DELETE FROM public.community_feed_mutes mute
  WHERE mute.profile_id = p_actor_profile_id
    AND mute.scope = p_scope
    AND mute.target_key = v_key;
  RETURN false;
END;
$$;

CREATE FUNCTION public.social_quality_filtered_community_post_ids(
  p_viewer_id uuid,
  p_filter public.community_feed_filter DEFAULT 'all',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_include_group_posts boolean DEFAULT true
)
RETURNS TABLE(post_id uuid, collapsed_repost_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH eligible AS MATERIALIZED (
    SELECT
      post.id,
      post.author_id,
      post.created_at,
      post.feed_fingerprint,
      date_trunc('day', post.created_at AT TIME ZONE 'UTC') AS publication_day
    FROM public.community_posts post
    WHERE public.social_can_view_community_post(p_viewer_id, post.id, false)
      AND (
        post.group_id IS NULL
        OR (
          p_include_group_posts
          AND EXISTS (
            SELECT 1
            FROM public.community_group_memberships membership
            WHERE membership.group_id = post.group_id
              AND membership.profile_id = p_viewer_id
              AND membership.status = 'active'
          )
        )
      )
      AND CASE p_filter
        WHEN 'all' THEN true
        WHEN 'friends' THEN public.social_profiles_are_friends(p_viewer_id, post.author_id)
        WHEN 'my_cars' THEN EXISTS (
          SELECT 1
          FROM public.vehicles garage_vehicle
          JOIN public.vehicles tagged_vehicle ON tagged_vehicle.id = post.vehicle_id
          WHERE garage_vehicle.owner_id = p_viewer_id
            AND (
              garage_vehicle.id = tagged_vehicle.id
              OR (
                public.community_feed_normalize_topic(garage_vehicle.make) =
                  public.community_feed_normalize_topic(tagged_vehicle.make)
                AND (
                  public.community_feed_normalize_topic(garage_vehicle.model) IS NULL
                  OR public.community_feed_normalize_topic(tagged_vehicle.model) IS NULL
                  OR public.community_feed_normalize_topic(garage_vehicle.model) =
                    public.community_feed_normalize_topic(tagged_vehicle.model)
                )
              )
            )
        )
      END
      AND NOT EXISTS (
        SELECT 1
        FROM public.community_feed_mutes mute
        WHERE mute.profile_id = p_viewer_id
          AND (
            (mute.scope = 'group' AND mute.group_id = post.group_id)
            OR (mute.scope = 'post_type' AND mute.post_type = post.post_type)
            OR (
              mute.scope = 'vehicle_topic'
              AND EXISTS (
                SELECT 1
                FROM public.vehicles topic_vehicle
                WHERE topic_vehicle.id = post.vehicle_id
                  AND public.community_feed_normalize_topic(topic_vehicle.make) = mute.vehicle_make
                  AND (
                    mute.vehicle_model IS NULL
                    OR public.community_feed_normalize_topic(topic_vehicle.model) = mute.vehicle_model
                  )
              )
            )
          )
      )
  ), clustered AS (
    SELECT
      eligible.*,
      row_number() OVER (
        PARTITION BY eligible.author_id, eligible.feed_fingerprint, eligible.publication_day
        ORDER BY eligible.created_at DESC, eligible.id DESC
      ) AS cluster_position,
      count(*) OVER (
        PARTITION BY eligible.author_id, eligible.feed_fingerprint, eligible.publication_day
      ) AS cluster_size
    FROM eligible
  )
  SELECT clustered.id, (clustered.cluster_size - 1)::integer
  FROM clustered
  WHERE clustered.cluster_position = 1
  ORDER BY clustered.created_at DESC, clustered.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.community_feed_normalize_topic(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_feed_content_fingerprint(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_feed_post_fingerprint(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_community_post_feed_fingerprint() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_community_feed_mute(
  uuid, public.community_feed_mute_scope, boolean, uuid, public.community_post_type, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.social_quality_filtered_community_post_ids(
  uuid, public.community_feed_filter, integer, integer, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.community_feed_normalize_topic(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_feed_content_fingerprint(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_feed_post_fingerprint(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_community_feed_mute(
  uuid, public.community_feed_mute_scope, boolean, uuid, public.community_post_type, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.social_quality_filtered_community_post_ids(
  uuid, public.community_feed_filter, integer, integer, boolean
) TO service_role;

COMMENT ON FUNCTION public.social_quality_filtered_community_post_ids(
  uuid, public.community_feed_filter, integer, integer, boolean
) IS 'Visibility-first chronological feed with private scoped mutes and one representative per same-author daily repost cluster.';

COMMIT;
