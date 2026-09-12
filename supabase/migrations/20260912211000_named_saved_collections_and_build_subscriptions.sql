-- Phase 2: private named collections and private vehicle build subscriptions.
-- Collection membership and subscription state are service-routed and are
-- never exposed as public popularity or follower counts.
BEGIN;

CREATE TABLE public.saved_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 60)
);

CREATE UNIQUE INDEX saved_collections_owner_name_unique
  ON public.saved_collections(owner_id, lower(btrim(name)));
CREATE INDEX saved_collections_owner_updated_idx
  ON public.saved_collections(owner_id, updated_at DESC, id DESC);

CREATE TABLE public.saved_collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.saved_collections(id) ON DELETE CASCADE,
  entity_type public.saved_collection_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, entity_type, entity_id)
);

CREATE INDEX saved_collection_items_collection_created_idx
  ON public.saved_collection_items(collection_id, created_at DESC, id DESC);

CREATE TABLE public.vehicle_build_subscriptions (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, vehicle_id)
);

CREATE INDEX vehicle_build_subscriptions_vehicle_idx
  ON public.vehicle_build_subscriptions(vehicle_id, profile_id);

ALTER TABLE public.saved_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_build_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.saved_collections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.saved_collection_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vehicle_build_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_collections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_collection_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_build_subscriptions TO service_role;

CREATE FUNCTION public.upsert_saved_collection(
  p_actor_profile_id uuid,
  p_collection_id uuid,
  p_name text
)
RETURNS public.saved_collections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_row public.saved_collections%ROWTYPE;
BEGIN
  IF p_actor_profile_id IS NULL OR NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'collection name must be between 1 and 60 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_collection_id IS NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_profile_id::text, 701));
    IF (SELECT count(*) FROM public.saved_collections collection WHERE collection.owner_id = p_actor_profile_id) >= 30 THEN
      RAISE EXCEPTION 'collection limit reached' USING ERRCODE = 'program_limit_exceeded';
    END IF;
    INSERT INTO public.saved_collections (owner_id, name)
    VALUES (p_actor_profile_id, v_name)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.saved_collections collection
    SET name = v_name, updated_at = now()
    WHERE collection.id = p_collection_id
      AND collection.owner_id = p_actor_profile_id
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'collection not found' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;
  RETURN v_row;
END;
$$;

CREATE FUNCTION public.delete_saved_collection(
  p_actor_profile_id uuid,
  p_collection_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH removed AS (
    DELETE FROM public.saved_collections collection
    WHERE collection.id = p_collection_id
      AND collection.owner_id = p_actor_profile_id
      AND public.social_profile_is_available(p_actor_profile_id)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM removed);
$$;

CREATE FUNCTION public.set_saved_collection_item(
  p_actor_profile_id uuid,
  p_collection_id uuid,
  p_entity_type public.saved_collection_entity_type,
  p_entity_id uuid,
  p_saved boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_visible boolean := false;
  v_vehicle_id uuid;
  v_owner_id uuid;
  v_public boolean;
BEGIN
  IF p_actor_profile_id IS NULL OR NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.saved_collections collection
    WHERE collection.id = p_collection_id AND collection.owner_id = p_actor_profile_id
  ) THEN
    RAISE EXCEPTION 'collection not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT COALESCE(p_saved, false) THEN
    DELETE FROM public.saved_collection_items item
    WHERE item.collection_id = p_collection_id
      AND item.entity_type = p_entity_type
      AND item.entity_id = p_entity_id;
    UPDATE public.saved_collections SET updated_at = now() WHERE id = p_collection_id;
    RETURN false;
  END IF;

  CASE p_entity_type
    WHEN 'post' THEN
      v_visible := public.social_can_view_community_post(p_actor_profile_id, p_entity_id, true);
    WHEN 'listing' THEN
      v_visible := EXISTS (
        SELECT 1 FROM public.marketplace_listings listing
        WHERE listing.id = p_entity_id AND listing.seller_id = p_actor_profile_id
      ) OR EXISTS (
        SELECT 1 FROM public.marketplace_visible_listing_ids(
          p_actor_profile_id, ARRAY[p_entity_id]::uuid[]
        ) visible WHERE visible.listing_id = p_entity_id
      );
    WHEN 'vehicle' THEN
      v_visible := public.social_can_view_vehicle(p_actor_profile_id, p_entity_id);
    WHEN 'build' THEN
      SELECT entry.vehicle_id, entry.owner_id, entry.is_public
      INTO v_vehicle_id, v_owner_id, v_public
      FROM public.vehicle_build_entries entry
      WHERE entry.id = p_entity_id;
      v_visible := v_vehicle_id IS NOT NULL
        AND (v_owner_id = p_actor_profile_id OR v_public)
        AND public.social_can_view_vehicle(p_actor_profile_id, v_vehicle_id);
  END CASE;

  IF NOT v_visible THEN
    RAISE EXCEPTION 'item unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_collection_id::text, 702));
  IF (SELECT count(*) FROM public.saved_collection_items item WHERE item.collection_id = p_collection_id) >= 200
     AND NOT EXISTS (
       SELECT 1 FROM public.saved_collection_items item
       WHERE item.collection_id = p_collection_id
         AND item.entity_type = p_entity_type
         AND item.entity_id = p_entity_id
     ) THEN
    RAISE EXCEPTION 'collection item limit reached' USING ERRCODE = 'program_limit_exceeded';
  END IF;

  INSERT INTO public.saved_collection_items (collection_id, entity_type, entity_id)
  VALUES (p_collection_id, p_entity_type, p_entity_id)
  ON CONFLICT (collection_id, entity_type, entity_id) DO NOTHING;

  -- Preserve the established one-tap All Saved lists when organizing a post
  -- or listing into a named collection. Removing it from a collection does
  -- not unexpectedly remove the original bookmark.
  IF p_entity_type = 'post' THEN
    INSERT INTO public.community_post_saves (post_id, profile_id)
    VALUES (p_entity_id, p_actor_profile_id)
    ON CONFLICT (post_id, profile_id) DO NOTHING;
  ELSIF p_entity_type = 'listing' THEN
    INSERT INTO public.marketplace_listing_saves (listing_id, profile_id)
    SELECT p_entity_id, p_actor_profile_id
    WHERE EXISTS (
      SELECT 1 FROM public.marketplace_listings listing
      WHERE listing.id = p_entity_id AND listing.seller_id <> p_actor_profile_id
    )
    ON CONFLICT (listing_id, profile_id) DO NOTHING;
  END IF;

  UPDATE public.saved_collections SET updated_at = now() WHERE id = p_collection_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.set_vehicle_build_subscription(
  p_actor_profile_id uuid,
  p_vehicle_id uuid,
  p_subscribed boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  IF p_actor_profile_id IS NULL OR NOT public.social_profile_is_available(p_actor_profile_id) THEN
    RAISE EXCEPTION 'profile unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT COALESCE(p_subscribed, false) THEN
    DELETE FROM public.vehicle_build_subscriptions subscription
    WHERE subscription.profile_id = p_actor_profile_id
      AND subscription.vehicle_id = p_vehicle_id;
    RETURN false;
  END IF;

  SELECT vehicle.owner_id INTO v_owner_id
  FROM public.vehicles vehicle WHERE vehicle.id = p_vehicle_id;
  IF v_owner_id IS NULL OR v_owner_id = p_actor_profile_id
     OR NOT public.social_can_view_vehicle(p_actor_profile_id, p_vehicle_id) THEN
    RAISE EXCEPTION 'vehicle unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor_profile_id::text, 703));
  IF (SELECT count(*) FROM public.vehicle_build_subscriptions subscription WHERE subscription.profile_id = p_actor_profile_id) >= 200
     AND NOT EXISTS (
       SELECT 1 FROM public.vehicle_build_subscriptions subscription
       WHERE subscription.profile_id = p_actor_profile_id AND subscription.vehicle_id = p_vehicle_id
     ) THEN
    RAISE EXCEPTION 'build subscription limit reached' USING ERRCODE = 'program_limit_exceeded';
  END IF;

  INSERT INTO public.vehicle_build_subscriptions (profile_id, vehicle_id)
  VALUES (p_actor_profile_id, p_vehicle_id)
  ON CONFLICT (profile_id, vehicle_id) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_category(p_type public.notification_type)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_type::text
    WHEN 'friend_request' THEN 'social'
    WHEN 'friend_request_accepted' THEN 'social'
    WHEN 'post_comment' THEN 'social'
    WHEN 'post_likes' THEN 'social'
    WHEN 'post_mention' THEN 'social'
    WHEN 'answer_accepted' THEN 'social'
    WHEN 'accepted_answer_unavailable' THEN 'social'
    WHEN 'answer_helpful' THEN 'social'
    WHEN 'build_update' THEN 'social'
    WHEN 'group_post_removed' THEN 'groups'
    WHEN 'group_role_changed' THEN 'groups'
    WHEN 'group_invitation' THEN 'groups'
    WHEN 'group_join_request' THEN 'groups'
    WHEN 'group_join_decision' THEN 'groups'
    WHEN 'message_received' THEN 'messages'
    WHEN 'listing_inspection_requested' THEN 'marketplace'
    WHEN 'saved_listing_updated' THEN 'marketplace'
    WHEN 'saved_search_match' THEN 'marketplace'
    WHEN 'tech_request_new' THEN 'inspections'
    WHEN 'tech_request_accepted' THEN 'inspections'
    WHEN 'inspection_submitted' THEN 'inspections'
    WHEN 'inspection_updated' THEN 'inspections'
    WHEN 'warranty_available' THEN 'inspections'
    WHEN 'payment_completed' THEN 'account'
    WHEN 'moderation_decision' THEN 'safety'
    WHEN 'moderation_case' THEN 'safety'
    WHEN 'report_received' THEN 'safety'
    ELSE 'account'
  END;
$$;

CREATE FUNCTION public.notify_vehicle_build_subscribers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT NEW.is_public
     OR (TG_OP = 'UPDATE' AND OLD.is_public) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT subscription.profile_id,
         'build_update'::public.notification_type,
         'New build update',
         'A vehicle build you subscribed to has a new shared entry.',
         jsonb_build_object('vehicle_id', NEW.vehicle_id, 'build_entry_id', NEW.id)
  FROM public.vehicle_build_subscriptions subscription
  WHERE subscription.vehicle_id = NEW.vehicle_id
    AND subscription.profile_id <> NEW.owner_id
    AND public.social_profile_is_available(subscription.profile_id)
    AND public.social_can_view_vehicle(subscription.profile_id, NEW.vehicle_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications notice
      WHERE notice.user_id = subscription.profile_id
        AND notice.type = 'build_update'::public.notification_type
        AND notice.data->>'build_entry_id' = NEW.id::text
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicle_build_entries_notify_subscribers
  AFTER INSERT OR UPDATE OF is_public ON public.vehicle_build_entries
  FOR EACH ROW EXECUTE FUNCTION public.notify_vehicle_build_subscribers();

REVOKE ALL ON FUNCTION public.upsert_saved_collection(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_saved_collection(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_saved_collection_item(uuid, uuid, public.saved_collection_entity_type, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_vehicle_build_subscription(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_vehicle_build_subscribers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_saved_collection(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_saved_collection(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_saved_collection_item(uuid, uuid, public.saved_collection_entity_type, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_vehicle_build_subscription(uuid, uuid, boolean) TO service_role;

COMMENT ON TABLE public.saved_collections IS
  'Private member-owned saved-item collections. Names and counts are never public.';
COMMENT ON TABLE public.saved_collection_items IS
  'Private collection membership. Polymorphic IDs remain as neutral placeholders when source content disappears.';
COMMENT ON TABLE public.vehicle_build_subscriptions IS
  'Private vehicle-level build update subscriptions. Never expose aggregate subscriber counts.';

COMMIT;
