import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { generatePresignedGetUrl, isPrivateStorageReference } from "@/lib/storage/r2";
import { getBlockedProfileIds, getCurrentSocialProfileId } from "@/features/social/relationships";

type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "display_name" | "username" | "avatar_url" | "is_public"
>;

type VehicleMedia = Database["public"]["Tables"]["vehicle_media"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"] & {
  vehicle_media: VehicleMedia[];
};

type Listing = Database["public"]["Tables"]["marketplace_listings"]["Row"];

export type MarketplaceListing = Listing & {
  vehicle: Vehicle | null;
  seller: Profile | null;
};

const LISTING_SELECT = `
  *,
  vehicle:vehicles!marketplace_listings_vehicle_id_fkey(*, vehicle_media(*)),
  seller:profiles!marketplace_listings_seller_id_fkey(id, display_name, username, avatar_url, is_public)
`;

export type MarketplaceFilters = {
  q?: string;
  make?: string;
  model?: string;
  minYear?: number;
  maxYear?: number;
  maxPrice?: number; // dollars
  sort?: "newest" | "oldest" | "price_asc" | "price_desc" | "mileage_asc";
};

function applyFilters(listings: MarketplaceListing[], filters: MarketplaceFilters): MarketplaceListing[] {
  let result = listings;

  // Text search
  const normalized = filters.q?.trim().toLowerCase();
  if (normalized) {
    result = result.filter((listing) => {
      const vehicle = listing.vehicle;
      const haystack = [
        listing.title,
        listing.location,
        vehicle?.year,
        vehicle?.make,
        vehicle?.model,
        vehicle?.trim,
        vehicle?.vin,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }

  // Make filter
  if (filters.make) {
    result = result.filter((l) => l.vehicle?.make?.toLowerCase() === filters.make!.toLowerCase());
  }

  // Model filter
  if (filters.model) {
    result = result.filter((l) => l.vehicle?.model?.toLowerCase().includes(filters.model!.toLowerCase()));
  }

  // Year range
  if (filters.minYear) {
    result = result.filter((l) => (l.vehicle?.year ?? 0) >= filters.minYear!);
  }
  if (filters.maxYear) {
    result = result.filter((l) => (l.vehicle?.year ?? 9999) <= filters.maxYear!);
  }

  // Max price (dollars → cents)
  if (filters.maxPrice) {
    result = result.filter((l) => l.asking_price_cents <= filters.maxPrice! * 100);
  }

  // Sort
  if (filters.sort === "price_asc") {
    result = [...result].sort((a, b) => a.asking_price_cents - b.asking_price_cents);
  } else if (filters.sort === "price_desc") {
    result = [...result].sort((a, b) => b.asking_price_cents - a.asking_price_cents);
  } else if (filters.sort === "mileage_asc") {
    result = [...result].sort((a, b) => (a.vehicle?.mileage ?? 999999) - (b.vehicle?.mileage ?? 999999));
  } else if (filters.sort === "oldest") {
    result = [...result].reverse();
  }
  // default: newest (already ordered by DB)

  return result;
}

async function cleanListingMedia(listing: MarketplaceListing, publicOnly = true): Promise<MarketplaceListing> {
  if (!listing.vehicle) return listing;
  const visible = publicOnly
    ? listing.vehicle.vehicle_media.filter((item) => item.moderation_status === "active")
    : listing.vehicle.vehicle_media;
  return {
    ...listing,
    vehicle: {
      ...listing.vehicle,
      vehicle_media: await Promise.all(visible.map(async (item) => ({
        ...item,
        url: isPrivateStorageReference(item.url) ? await generatePresignedGetUrl(item.url, 900) : item.url,
      }))),
    },
  };
}

export async function getMarketplaceListings(filters?: MarketplaceFilters) {
  const supabase = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();

  const { data } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as MarketplaceListing[];
  const blockedIds = viewerId
    ? await getBlockedProfileIds(viewerId, rows.map((listing) => listing.seller_id))
    : new Set<string>();
  const publicListings = rows.filter(
    (listing) => listing.vehicle?.visibility === "public" && !blockedIds.has(listing.seller_id)
  );

  return applyFilters(await Promise.all(publicListings.map((item) => cleanListingMedia(item))), filters ?? {});
}

export async function getVehicleActiveListing(vehicleId: string) {
  const supabase = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();

  const { data } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("vehicle_id", vehicleId)
    .eq("status", "active")
    .maybeSingle();

  const listing = (data as MarketplaceListing | null) ?? null;
  if (listing && viewerId && (await getBlockedProfileIds(viewerId, [listing.seller_id])).has(listing.seller_id)) return null;
  return listing ? cleanListingMedia(listing) : null;
}

export async function getMarketplaceListing(listingId: string) {
  const supabase = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();

  const { data } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("id", listingId)
    .maybeSingle();

  const listing = (data as MarketplaceListing | null) ?? null;
  if (!listing) return null;
  if (viewerId && (await getBlockedProfileIds(viewerId, [listing.seller_id])).has(listing.seller_id)) return null;

  const isPublicActive =
    listing.status === "active" && listing.vehicle?.visibility === "public";

  if (!isPublicActive) return null;
  return cleanListingMedia(listing);
}

export async function getMyMarketplaceListings() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("seller_id", profile.id)
    .order("created_at", { ascending: false });

  return Promise.all(((data ?? []) as MarketplaceListing[]).map((item) => cleanListingMedia(item, false)));
}

export async function getMyMarketplaceListing(listingId: string) {
  const listings = await getMyMarketplaceListings();
  return listings.find((listing) => listing.id === listingId) ?? null;
}

export async function getAdminMarketplaceListings(page = 1, perPage = 50) {
  const supabase = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, count } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  return {
    listings: await Promise.all(((data ?? []) as MarketplaceListing[])
      .map((item) => cleanListingMedia(item, false))),
    total: count ?? 0,
  };
}
