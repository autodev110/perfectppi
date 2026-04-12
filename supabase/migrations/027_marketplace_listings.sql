-- ============================================================================
-- Migration 027: Marketplace Listings
-- Parent platform module — allows sellers to list public vehicles for sale
-- ============================================================================

CREATE TYPE public.listing_status AS ENUM ('active', 'sold', 'archived');

CREATE TABLE public.marketplace_listings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id     uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  seller_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text,
  asking_price_cents integer NOT NULL CHECK (asking_price_cents > 0),
  location       text,
  status         public.listing_status NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_listings_seller   ON public.marketplace_listings(seller_id);
CREATE INDEX idx_listings_vehicle  ON public.marketplace_listings(vehicle_id);
CREATE INDEX idx_listings_status   ON public.marketplace_listings(status);
CREATE INDEX idx_listings_created  ON public.marketplace_listings(created_at DESC);
CREATE UNIQUE INDEX idx_listings_one_active_per_vehicle
  ON public.marketplace_listings(vehicle_id)
  WHERE status = 'active';

CREATE TRIGGER marketplace_listings_updated_at
  BEFORE UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

-- Anyone can browse active listings
CREATE POLICY listings_select_active ON public.marketplace_listings
  FOR SELECT USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id
        AND v.visibility = 'public'
    )
  );

-- Sellers can see all their own listings (active + sold + archived)
CREATE POLICY listings_select_own ON public.marketplace_listings
  FOR SELECT USING (seller_id = public.get_my_profile_id());

-- Sellers can create listings for vehicles they own
CREATE POLICY listings_insert_own ON public.marketplace_listings
  FOR INSERT WITH CHECK (
    seller_id = public.get_my_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id
        AND v.owner_id = public.get_my_profile_id()
    )
  );

-- Sellers can update their own listings
CREATE POLICY listings_update_own ON public.marketplace_listings
  FOR UPDATE
  USING  (seller_id = public.get_my_profile_id())
  WITH CHECK (seller_id = public.get_my_profile_id());

-- Sellers can delete their own listings
CREATE POLICY listings_delete_own ON public.marketplace_listings
  FOR DELETE USING (seller_id = public.get_my_profile_id());

-- Admin full access
CREATE POLICY listings_admin ON public.marketplace_listings
  FOR ALL USING (public.get_my_role() = 'admin');
