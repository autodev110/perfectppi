-- Saved listings and saved-listing change notices (plan 25.1, 25.2, 22.1,
-- Phase 1B "saved-listing activity").
--
-- Saves are private to the member. Saving requires the listing to be
-- visible to the actor right now (same projection the marketplace uses);
-- unsaving always works. When a saved listing changes price or leaves the
-- market, each saver gets one neutral notice per listing per day — enough to
-- act on, not a stream.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'saved_listing_updated';

BEGIN;

CREATE TABLE public.marketplace_listing_saves (
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, profile_id)
);
CREATE INDEX marketplace_listing_saves_profile_idx
  ON public.marketplace_listing_saves(profile_id, created_at DESC, listing_id DESC);
ALTER TABLE public.marketplace_listing_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_listing_saves FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.marketplace_listing_saves TO service_role;

-- The "marketplace" notification category already exists; map the new type.
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
    WHEN 'answer_accepted' THEN 'social'
    WHEN 'accepted_answer_unavailable' THEN 'social'
    WHEN 'group_post_removed' THEN 'groups'
    WHEN 'group_role_changed' THEN 'groups'
    WHEN 'message_received' THEN 'messages'
    WHEN 'listing_inspection_requested' THEN 'marketplace'
    WHEN 'saved_listing_updated' THEN 'marketplace'
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

CREATE FUNCTION public.set_marketplace_listing_save(
  p_actor_profile_id uuid,
  p_listing_id uuid,
  p_saved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_actor_profile_id IS NULL OR p_listing_id IS NULL THEN
    RAISE EXCEPTION 'listing unavailable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_saved THEN
    IF NOT public.social_profile_is_available(p_actor_profile_id) OR NOT EXISTS (
      SELECT 1 FROM public.marketplace_visible_listing_ids(p_actor_profile_id, ARRAY[p_listing_id])
    ) THEN
      RAISE EXCEPTION 'listing unavailable' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF EXISTS (SELECT 1 FROM public.marketplace_listings WHERE id = p_listing_id AND seller_id = p_actor_profile_id) THEN
      RAISE EXCEPTION 'you cannot save your own listing' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.marketplace_listing_saves (listing_id, profile_id)
    VALUES (p_listing_id, p_actor_profile_id)
    ON CONFLICT (listing_id, profile_id) DO NOTHING;
  ELSE
    DELETE FROM public.marketplace_listing_saves
    WHERE listing_id = p_listing_id AND profile_id = p_actor_profile_id;
  END IF;
  RETURN jsonb_build_object('listingId', p_listing_id, 'saved', p_saved);
END;
$$;

CREATE FUNCTION public.marketplace_listing_save_states(p_viewer_id uuid, p_listing_ids uuid[])
RETURNS TABLE(listing_id uuid, saved boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT requested.id,
         EXISTS (
           SELECT 1 FROM public.marketplace_listing_saves save
           WHERE save.listing_id = requested.id AND save.profile_id = p_viewer_id
         )
  FROM (SELECT DISTINCT unnest(COALESCE(p_listing_ids, ARRAY[]::uuid[])) AS id) requested;
$$;

-- Saved listings in save order. Unlike posts, a listing that was sold or
-- removed stays in the list with its status so the member sees the outcome;
-- listings from members who blocked the viewer (or vice versa) disappear.
CREATE FUNCTION public.list_saved_marketplace_listing_ids(
  p_viewer_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(listing_id uuid, saved_at timestamptz, listing_status public.listing_status)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT save.listing_id, save.created_at, listing.status
  FROM public.marketplace_listing_saves save
  JOIN public.marketplace_listings listing ON listing.id = save.listing_id
  WHERE save.profile_id = p_viewer_id
    AND NOT public.social_profiles_are_blocked(p_viewer_id, listing.seller_id)
  ORDER BY save.created_at DESC, save.listing_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- Change notices for savers: price changes and status changes. One unread
-- notice per listing per saver per day is updated in place (plan 22.2).
CREATE FUNCTION public.notify_saved_listing_change()
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
      WHEN 'archived' THEN 'removed'
      WHEN 'active' THEN 'relisted'
      ELSE NEW.status::text
    END;
    v_body := CASE v_change
      WHEN 'sold' THEN 'A listing you saved was marked sold: ' || NEW.title
      WHEN 'removed' THEN 'A listing you saved is no longer available: ' || NEW.title
      WHEN 'relisted' THEN 'A listing you saved is back on the market: ' || NEW.title
      ELSE 'A listing you saved changed: ' || NEW.title
    END;
  ELSIF NEW.asking_price_cents IS DISTINCT FROM OLD.asking_price_cents AND NEW.status = 'active' THEN
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

CREATE TRIGGER marketplace_listings_notify_savers
  AFTER UPDATE OF status, asking_price_cents ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.notify_saved_listing_change();

REVOKE ALL ON FUNCTION public.set_marketplace_listing_save(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_listing_save_states(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_saved_marketplace_listing_ids(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_saved_listing_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_marketplace_listing_save(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_listing_save_states(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_saved_marketplace_listing_ids(uuid, integer, integer) TO service_role;

COMMENT ON TABLE public.marketplace_listing_saves IS
  'Private saved listings. Sellers never see who saved; change notices go only to savers.';

COMMIT;
