import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { generatePresignedGetUrl, isPrivateStorageReference } from "@/lib/storage/r2";
import { getCurrentSocialProfileId } from "@/features/social/relationships";

type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "display_name" | "username" | "avatar_url" | "is_public"
>;

type VehicleMediaRow = Database["public"]["Tables"]["vehicle_media"]["Row"];
type MarketplaceVehicleMedia = Pick<
  VehicleMediaRow,
  "id" | "vehicle_id" | "url" | "media_type" | "is_primary" | "sort_order" | "uploaded_at" | "moderation_status"
>;
type MarketplaceVehicle = Pick<
  Database["public"]["Tables"]["vehicles"]["Row"],
  "id" | "owner_id" | "year" | "make" | "model" | "trim" | "nickname" | "mileage" | "mileage_updated_at" | "visibility" | "created_at" | "updated_at"
> & {
  vehicle_media: MarketplaceVehicleMedia[];
};

type Listing = Database["public"]["Tables"]["marketplace_listings"]["Row"];

export type MarketplaceInspectionSummary = {
  request_id: string;
  scope: Database["public"]["Enums"]["inspection_scope"];
  inspected_at: string;
  performed_by: string;
};

export type MarketplaceInspectionRequestSummary = {
  request_id: string;
  status: Database["public"]["Enums"]["ppi_request_status"];
};

export type MarketplaceListing = Listing & {
  vehicle: MarketplaceVehicle | null;
  seller: Profile | null;
  inspection_summary: MarketplaceInspectionSummary | null;
  inspection_request: MarketplaceInspectionRequestSummary | null;
  viewer_is_seller: boolean;
};

const LISTING_SELECT = `
  id, vehicle_id, seller_id, title, description, asking_price_cents, location, status, created_at, updated_at,
  vehicle:vehicles!marketplace_listings_vehicle_id_fkey(
    id, owner_id, year, make, model, trim, nickname, mileage, mileage_updated_at, visibility, created_at, updated_at,
    vehicle_media(id, vehicle_id, url, media_type, is_primary, sort_order, uploaded_at, moderation_status)
  ),
  seller:profiles!marketplace_listings_seller_id_fkey(id, display_name, username, avatar_url, is_public)
`;

type ListingRow = Omit<MarketplaceListing, "inspection_summary" | "inspection_request" | "viewer_is_seller">;

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

async function cleanListingMedia(listing: ListingRow, publicOnly = true): Promise<ListingRow> {
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

async function addInspectionTrust(
  listings: ListingRow[],
  viewerId: string | null,
): Promise<MarketplaceListing[]> {
  if (listings.length === 0) return [];

  const admin = createAdminClient();
  const vehicleIds = [...new Set(listings.map((listing) => listing.vehicle_id))];
  const listingIds = listings.map((listing) => listing.id);
  const { data: requestRows } = await admin
    .from("ppi_requests")
    .select("id, vehicle_id, requester_id, performer_type, inspection_scope, status")
    .in("vehicle_id", vehicleIds)
    .in("status", ["submitted", "completed"]);

  const sellerByVehicle = new Map(listings.map((listing) => [listing.vehicle_id, listing.seller_id]));
  const eligibleRequests = (requestRows ?? []).filter(
    (request) => request.requester_id === sellerByVehicle.get(request.vehicle_id),
  );
  const requestIds = eligibleRequests.map((request) => request.id);
  const [{ data: submissionRows }, { data: openRequestRows }] = await Promise.all([
    requestIds.length > 0
      ? admin
          .from("ppi_submissions")
          .select("ppi_request_id, performer_id, submitted_at, completed_at")
          .in("ppi_request_id", requestIds)
          .eq("is_current", true)
          .in("status", ["submitted", "completed"])
      : Promise.resolve({ data: [] }),
    viewerId
      ? admin
          .from("ppi_requests")
          .select("id, marketplace_listing_id, status, created_at")
          .eq("requester_id", viewerId)
          .in("marketplace_listing_id", listingIds)
          .in("status", [
            "draft",
            "pending_assignment",
            "assigned",
            "accepted",
            "in_progress",
            "submitted",
            "needs_revision",
          ])
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const performerIds = [...new Set((submissionRows ?? []).map((row) => row.performer_id))];
  const { data: performerRows } = performerIds.length > 0
    ? await admin
        .from("profiles")
        .select("id, display_name, username, is_public")
        .in("id", performerIds)
    : { data: [] };
  const performerById = new Map((performerRows ?? []).map((profile) => [profile.id, profile]));
  const requestById = new Map(eligibleRequests.map((request) => [request.id, request]));
  const inspectionByVehicle = new Map<string, MarketplaceInspectionSummary>();

  for (const submission of submissionRows ?? []) {
    const request = requestById.get(submission.ppi_request_id);
    const inspectedAt = submission.completed_at ?? submission.submitted_at;
    if (!request || !inspectedAt) continue;

    const performer = performerById.get(submission.performer_id);
    const performedBy = request.performer_type === "self"
      ? "Owner self-inspection"
      : performer?.is_public
        ? performer.display_name ?? performer.username ?? "PerfectPPI technician"
        : "PerfectPPI technician";
    const current = inspectionByVehicle.get(request.vehicle_id);
    if (!current || inspectedAt > current.inspected_at) {
      inspectionByVehicle.set(request.vehicle_id, {
        request_id: request.id,
        scope: request.inspection_scope,
        inspected_at: inspectedAt,
        performed_by: performedBy,
      });
    }
  }

  const openRequestByListing = new Map<string, MarketplaceInspectionRequestSummary>();
  for (const request of openRequestRows ?? []) {
    if (request.marketplace_listing_id && !openRequestByListing.has(request.marketplace_listing_id)) {
      openRequestByListing.set(request.marketplace_listing_id, {
        request_id: request.id,
        status: request.status,
      });
    }
  }

  return listings.map((listing) => ({
    ...listing,
    inspection_summary: inspectionByVehicle.get(listing.vehicle_id) ?? null,
    inspection_request: openRequestByListing.get(listing.id) ?? null,
    viewer_is_seller: viewerId === listing.seller_id,
  }));
}

async function filterVisibleListings(listings: ListingRow[], viewerId: string | null) {
  if (listings.length === 0) return [];
  const { data, error } = await createAdminClient().rpc("marketplace_visible_listing_ids", {
    p_viewer_id: viewerId,
    p_listing_ids: listings.map((listing) => listing.id),
  });
  if (error) {
    console.error("[marketplace] Visibility check failed", error);
    return [];
  }
  const visibleIds = new Set((data ?? []).map((row) => row.listing_id));
  return listings.filter((listing) => visibleIds.has(listing.id));
}

export async function getMarketplaceListings(filters?: MarketplaceFilters) {
  const supabase = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();

  const { data } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as ListingRow[];
  const publicListings = await filterVisibleListings(rows, viewerId);

  const cleaned = await Promise.all(publicListings.map((item) => cleanListingMedia(item)));
  return applyFilters(await addInspectionTrust(cleaned, viewerId), filters ?? {});
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

  const listing = (data as unknown as ListingRow | null) ?? null;
  if (!listing) return null;
  const [visible] = await filterVisibleListings([listing], viewerId);
  if (!visible) return null;
  const [trusted] = await addInspectionTrust([await cleanListingMedia(visible)], viewerId);
  return trusted ?? null;
}

export async function getMarketplaceListing(listingId: string) {
  const supabase = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();

  const { data } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("id", listingId)
    .maybeSingle();

  const listing = (data as unknown as ListingRow | null) ?? null;
  if (!listing) return null;
  const [visible] = await filterVisibleListings([listing], viewerId);
  if (!visible) return null;
  const [trusted] = await addInspectionTrust([await cleanListingMedia(visible)], viewerId);
  return trusted ?? null;
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

  const rows = (data ?? []) as unknown as ListingRow[];
  return addInspectionTrust(await Promise.all(rows.map((item) => cleanListingMedia(item, false))), profile.id);
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
    listings: await addInspectionTrust(
      await Promise.all(((data ?? []) as unknown as ListingRow[])
        .map((item) => cleanListingMedia(item, false))),
      null,
    ),
    total: count ?? 0,
  };
}
