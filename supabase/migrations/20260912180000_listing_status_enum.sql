-- Plan 25.2: listing lifecycle states. Enum values are added in their own
-- migration so the functions that name them can be created afterwards.
ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'removed';
