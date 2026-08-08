-- ============================================================================
-- Migration 035: Marketplace context on conversations
--
-- Conversations started from a "Contact Seller" click carry no record of which
-- listing they were about, so message list titles can only ever show people —
-- never the car being discussed. Store the listing the thread is currently
-- about so both the web and iOS clients can title the thread
-- "Buyer & Seller · 2019 Toyota Supra".
--
-- ON DELETE SET NULL: a delisted/removed vehicle should not take the message
-- history with it, the thread just loses its car label.
-- ============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS marketplace_listing_id uuid
    REFERENCES public.marketplace_listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_marketplace_listing_id_idx
  ON public.conversations(marketplace_listing_id);
