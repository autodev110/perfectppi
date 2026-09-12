BEGIN;

-- ============================================================================
-- Plan 25.2: Manage Listing — Edit, Mark Pending/Sold, Pause, Remove.
--
-- States: active (listed), pending (sale pending; still visible with a badge),
-- paused / archived (hidden, owner can resume), sold (kept for savers with
-- its status), removed (terminal soft delete). Remove is soft while
-- inspection requests, seller conversations, saves by other members,
-- community posts, or moderation reports still reference the listing;
-- otherwise the row is deleted.
-- ============================================================================

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

-- One live listing per vehicle: a paused or pending listing still holds the
-- vehicle, so a second listing cannot be created underneath it.
DROP INDEX IF EXISTS public.idx_listings_one_active_per_vehicle;
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_one_live_per_vehicle
  ON public.marketplace_listings(vehicle_id)
  WHERE status IN ('active', 'pending', 'paused');

CREATE OR REPLACE FUNCTION public.marketplace_listing_is_public(p_status public.listing_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_status IN ('active'::public.listing_status, 'pending'::public.listing_status);
$$;

CREATE OR REPLACE FUNCTION public.marketplace_listing_has_obligations(p_listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.ppi_requests r WHERE r.marketplace_listing_id = p_listing_id)
      OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.marketplace_listing_id = p_listing_id)
      OR EXISTS (
        SELECT 1 FROM public.marketplace_listing_saves s
        JOIN public.marketplace_listings l ON l.id = s.listing_id
        WHERE s.listing_id = p_listing_id AND s.profile_id <> l.seller_id
      )
      OR EXISTS (SELECT 1 FROM public.community_posts p WHERE p.marketplace_listing_id = p_listing_id)
      OR EXISTS (
        SELECT 1 FROM public.moderation_reports mr
        WHERE mr.entity_type = 'marketplace_listing' AND mr.entity_id = p_listing_id
      );
$$;

-- Lifecycle guard: `removed` is terminal, `removed_at` is stamped by the
-- database, and ordinary clients cannot hard-delete a listing others still
-- reference (they go through remove_marketplace_listing, which soft-removes).
CREATE OR REPLACE FUNCTION public.guard_marketplace_listing_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
       AND public.marketplace_listing_has_obligations(OLD.id) THEN
      RAISE EXCEPTION 'listing_remove_soft' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'removed'::public.listing_status
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'listing_removed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'removed'::public.listing_status THEN
    NEW.removed_at := COALESCE(NEW.removed_at, now());
  ELSE
    NEW.removed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_listings_lifecycle_guard ON public.marketplace_listings;
CREATE TRIGGER marketplace_listings_lifecycle_guard
  BEFORE UPDATE OR DELETE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.guard_marketplace_listing_lifecycle();

-- Owner status changes. sold → active relists; removed is terminal.
CREATE OR REPLACE FUNCTION public.set_marketplace_listing_status(
  p_actor_profile_id uuid,
  p_listing_id uuid,
  p_status public.listing_status
)
RETURNS public.marketplace_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_listing public.marketplace_listings;
BEGIN
  SELECT * INTO v_listing FROM public.marketplace_listings
  WHERE id = p_listing_id AND seller_id = p_actor_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_listing.status = 'removed'::public.listing_status THEN
    RAISE EXCEPTION 'listing_removed' USING ERRCODE = 'check_violation';
  END IF;
  IF v_listing.status = 'sold'::public.listing_status
     AND p_status NOT IN ('active'::public.listing_status, 'removed'::public.listing_status) THEN
    RAISE EXCEPTION 'listing_sold' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status = 'active'::public.listing_status AND NOT EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = v_listing.vehicle_id AND v.owner_id = p_actor_profile_id
  ) THEN
    RAISE EXCEPTION 'listing_vehicle_not_owned' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status IN ('active'::public.listing_status, 'pending'::public.listing_status, 'paused'::public.listing_status)
     AND EXISTS (
       SELECT 1 FROM public.marketplace_listings other
       WHERE other.vehicle_id = v_listing.vehicle_id
         AND other.id <> v_listing.id
         AND other.status IN ('active'::public.listing_status, 'pending'::public.listing_status, 'paused'::public.listing_status)
     ) THEN
    RAISE EXCEPTION 'listing_vehicle_already_listed' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status = v_listing.status THEN
    RETURN v_listing;
  END IF;

  UPDATE public.marketplace_listings
  SET status = p_status
  WHERE id = p_listing_id
  RETURNING * INTO v_listing;
  RETURN v_listing;
END;
$$;

-- Remove: soft (status removed) while anything references the listing, hard
-- otherwise. Returns the mode used.
CREATE OR REPLACE FUNCTION public.remove_marketplace_listing(
  p_actor_profile_id uuid,
  p_listing_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_listing public.marketplace_listings;
BEGIN
  SELECT * INTO v_listing FROM public.marketplace_listings
  WHERE id = p_listing_id AND seller_id = p_actor_profile_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_listing.status = 'removed'::public.listing_status THEN
    RETURN 'soft';
  END IF;
  IF public.marketplace_listing_has_obligations(p_listing_id) THEN
    UPDATE public.marketplace_listings
    SET status = 'removed'::public.listing_status
    WHERE id = p_listing_id;
    RETURN 'soft';
  END IF;
  DELETE FROM public.marketplace_listings WHERE id = p_listing_id;
  RETURN 'hard';
END;
$$;

-- Seller card (plan 25.2 §7): aggregate marketplace history only.
CREATE OR REPLACE FUNCTION public.marketplace_seller_history(p_seller_id uuid)
RETURNS TABLE(active_count integer, sold_count integer, first_listed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    count(*) FILTER (WHERE public.marketplace_listing_is_public(l.status))::integer,
    count(*) FILTER (WHERE l.status = 'sold'::public.listing_status)::integer,
    min(l.created_at)
  FROM public.marketplace_listings l
  WHERE l.seller_id = p_seller_id
    AND l.status <> 'removed'::public.listing_status;
$$;

-- Pending listings stay visible (with a badge); paused/archived/sold/removed
-- are not browseable.
CREATE OR REPLACE FUNCTION public.marketplace_visible_listing_ids(
  p_viewer_id uuid,
  p_listing_ids uuid[]
)
RETURNS TABLE (listing_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT listing_row.id
  FROM public.marketplace_listings listing_row
  JOIN public.vehicles vehicle_row ON vehicle_row.id = listing_row.vehicle_id
  WHERE listing_row.id = ANY(COALESCE(p_listing_ids, ARRAY[]::uuid[]))
    AND public.marketplace_listing_is_public(listing_row.status)
    AND vehicle_row.visibility = 'public'::public.vehicle_visibility
    AND vehicle_row.owner_id = listing_row.seller_id
    AND public.social_profile_is_available(listing_row.seller_id)
    AND (
      p_viewer_id IS NULL
      OR NOT public.social_profiles_are_blocked(p_viewer_id, listing_row.seller_id)
    );
$$;

DROP POLICY IF EXISTS listings_select_active ON public.marketplace_listings;
CREATE POLICY listings_select_active
  ON public.marketplace_listings FOR SELECT TO authenticated
  USING (
    public.marketplace_listing_is_public(status)
    AND public.social_current_user_can_view_profile(seller_id)
    AND EXISTS (
      SELECT 1 FROM public.vehicles vehicle
      WHERE vehicle.id = marketplace_listings.vehicle_id
        AND vehicle.visibility = 'public'
    )
  );

-- Unified search follows the same rule.
CREATE OR REPLACE FUNCTION public.search_marketplace_listings(p_viewer_id uuid, p_query text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE(listing_id uuid, rank integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q record;
BEGIN
  IF p_viewer_id IS NULL OR NOT public.social_profile_is_available(p_viewer_id) THEN RETURN; END IF;
  SELECT * INTO q FROM public.community_search_terms(p_query);
  IF cardinality(q.terms) = 0 AND cardinality(q.years) = 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT listing.id, listing.created_at, listing.seller_id,
      (SELECT count(*)::integer FROM unnest(q.terms) term
       WHERE listing.title ILIKE '%' || term || '%'
          OR listing.description ILIKE '%' || term || '%'
          OR listing.location ILIKE '%' || term || '%'
          OR vehicle.make ILIKE term || '%'
          OR vehicle.model ILIKE term || '%'
          OR vehicle.trim ILIKE '%' || term || '%') AS matched,
      (SELECT count(*)::integer FROM unnest(q.years) y WHERE vehicle.year = y) AS year_matches
    FROM public.marketplace_listings listing
    JOIN public.vehicles vehicle ON vehicle.id = listing.vehicle_id
    WHERE public.marketplace_listing_is_public(listing.status)
      AND vehicle.visibility = 'public'
      AND vehicle.owner_id = listing.seller_id
  )
  SELECT scored.id, scored.matched + scored.year_matches
  FROM scored
  WHERE scored.matched + scored.year_matches > 0
    AND (cardinality(q.terms) = 0 OR scored.matched > 0)
    AND public.social_profile_is_available(scored.seller_id)
    AND NOT public.social_profiles_are_blocked(p_viewer_id, scored.seller_id)
  ORDER BY scored.matched + scored.year_matches DESC, scored.created_at DESC, scored.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- Saver notices learn the new states.
CREATE OR REPLACE FUNCTION public.notify_saved_listing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_change text;
  v_body text;
  v_saver uuid;
  v_existing_id uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_change := CASE NEW.status::text
      WHEN 'sold' THEN 'sold'
      WHEN 'pending' THEN 'pending'
      WHEN 'archived' THEN 'removed'
      WHEN 'paused' THEN 'removed'
      WHEN 'removed' THEN 'removed'
      WHEN 'active' THEN 'relisted'
      ELSE NEW.status::text
    END;
    v_body := CASE v_change
      WHEN 'sold' THEN 'A listing you saved was marked sold: ' || NEW.title
      WHEN 'pending' THEN 'A sale is pending on a listing you saved: ' || NEW.title
      WHEN 'removed' THEN 'A listing you saved is no longer available: ' || NEW.title
      WHEN 'relisted' THEN 'A listing you saved is back on the market: ' || NEW.title
      ELSE 'A listing you saved changed: ' || NEW.title
    END;
  ELSIF NEW.asking_price_cents IS DISTINCT FROM OLD.asking_price_cents
        AND public.marketplace_listing_is_public(NEW.status) THEN
    v_change := CASE WHEN NEW.asking_price_cents < OLD.asking_price_cents THEN 'price_drop' ELSE 'price_increase' END;
    v_body := 'Price ' || CASE WHEN v_change = 'price_drop' THEN 'dropped' ELSE 'changed' END
      || ' to $' || to_char(NEW.asking_price_cents / 100.0, 'FM999,999,999')
      || ' on a listing you saved: ' || NEW.title;
  ELSE
    RETURN NEW;
  END IF;

  FOR v_saver IN
    SELECT save.profile_id FROM public.marketplace_listing_saves save
    WHERE save.listing_id = NEW.id
      AND save.profile_id <> NEW.seller_id
      AND NOT public.social_profiles_are_blocked(save.profile_id, NEW.seller_id)
  LOOP
    SELECT id INTO v_existing_id
    FROM public.notifications
    WHERE user_id = v_saver
      AND type = 'saved_listing_updated'
      AND read_at IS NULL
      AND data->>'listing_id' = NEW.id::text
      AND (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.notifications
      SET body = v_body,
          data = data || jsonb_build_object('change', v_change, 'status', NEW.status, 'asking_price_cents', NEW.asking_price_cents),
          created_at = now()
      WHERE id = v_existing_id;
    ELSE
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_saver, 'saved_listing_updated', 'Saved listing update', v_body,
        jsonb_build_object(
          'listing_id', NEW.id, 'vehicle_id', NEW.vehicle_id, 'change', v_change,
          'status', NEW.status, 'asking_price_cents', NEW.asking_price_cents
        )
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.marketplace_listing_is_public(public.listing_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_listing_is_public(public.listing_status) TO anon, authenticated, service_role;
-- The lifecycle trigger runs as the caller, so owners deleting through RLS
-- need to evaluate the obligation check (a boolean about their own row).
REVOKE ALL ON FUNCTION public.marketplace_listing_has_obligations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_marketplace_listing_status(uuid, uuid, public.listing_status) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_marketplace_listing(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_seller_history(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_marketplace_listing_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_listing_has_obligations(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_marketplace_listing_status(uuid, uuid, public.listing_status) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_marketplace_listing(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_seller_history(uuid) TO service_role;

COMMIT;
