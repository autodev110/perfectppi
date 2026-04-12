import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

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

export async function getMarketplaceListings(filters?: MarketplaceFilters) {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const publicListings = ((data ?? []) as MarketplaceListing[]).filter(
    (listing) => listing.vehicle?.visibility === "public"
  );

  return applyFilters(publicListings, filters ?? {});
}

export async function getVehicleActiveListing(vehicleId: string) {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("vehicle_id", vehicleId)
    .eq("status", "active")
    .maybeSingle();

  return (data as MarketplaceListing | null) ?? null;
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

  return (data ?? []) as MarketplaceListing[];
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
    listings: (data ?? []) as MarketplaceListing[],
    total: count ?? 0,
  };
}
