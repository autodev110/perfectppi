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
  | "transmission" | "drivetrain" | "body_style" | "engine"
  | "configuration_type" | "engine_original" | "transmission_original" | "drivetrain_original" | "mileage_status"
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
  /** Private bookmark (plan 25.2 Save); never shown to the seller. */
  saved_by_viewer: boolean;
  /** Plan 25.1 seller type: a listed technician / shop, or a private member. */
  seller_type: "member" | "technician";
};

/** Browseable states (plan 25.2); mirrors marketplace_listing_is_public. */
const PUBLIC_LISTING_STATUSES = ["active", "pending"] as const;

const LISTING_SELECT = `
  id, vehicle_id, seller_id, title, description, asking_price_cents, location, status, created_at, updated_at,
  attached_inspection_id, inspection_shared_at, removed_at,
  vehicle:vehicles!marketplace_listings_vehicle_id_fkey(
    id, owner_id, year, make, model, trim, nickname, mileage, mileage_updated_at, visibility, created_at, updated_at,
    transmission, drivetrain, body_style, engine,
    configuration_type, engine_original, transmission_original, drivetrain_original, mileage_status,
    vehicle_media(id, vehicle_id, url, media_type, is_primary, sort_order, uploaded_at, moderation_status)
  ),
  seller:profiles!marketplace_listings_seller_id_fkey(id, display_name, username, avatar_url, is_public)
`;

type ListingRow = Omit<MarketplaceListing, "inspection_summary" | "inspection_request" | "viewer_is_seller" | "saved_by_viewer" | "seller_type">;

import type { MarketplaceFilters } from "@/lib/marketplace/filters";
import type { InspectionReport } from "@/lib/marketplace/inspection-report";
import { getInspectionReport } from "@/features/marketplace/inspection-sharing";
export type { MarketplaceFilters } from "@/lib/marketplace/filters";

const contains = (haystack: string | null | undefined, needle: string | undefined) =>
  !needle || (haystack ?? "").toLowerCase().includes(needle.toLowerCase());

// Mirrors marketplace_listing_matches_filters in SQL (plan 25.1); the browse
// page filters in memory over the visible active listings.
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
  if (filters.maxMileage !== undefined) {
    result = result.filter((l) => l.vehicle?.mileage != null && l.vehicle.mileage <= filters.maxMileage!);
  }
  result = result.filter((l) =>
    contains(l.vehicle?.transmission, filters.transmission)
    && contains(l.vehicle?.drivetrain, filters.drivetrain)
    && contains(l.vehicle?.body_style, filters.bodyStyle)
    && contains(l.location, filters.region));
  if (filters.inspected) {
    result = result.filter((l) => l.inspection_summary !== null);
  }
  if (filters.sellerType) {
    result = result.filter((l) => (l.seller_type === "technician") === (filters.sellerType === "technician"));
  }

  // Sort
  if (filters.sort === "recently_inspected") {
    result = [...result].sort((a, b) =>
      (b.inspection_summary?.inspected_at ?? "").localeCompare(a.inspection_summary?.inspected_at ?? ""));
  } else if (filters.sort === "price_asc") {
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
  const listingIds = listings.map((listing) => listing.id);
  // The badge follows the inspection the seller explicitly shared (plan
  // 25.3), and only while that request is still submitted/completed.
  const attachedIds = [...new Set(listings.map((listing) => listing.attached_inspection_id).filter((id): id is string => Boolean(id)))];
  const { data: requestRows } = attachedIds.length > 0
    ? await admin
        .from("ppi_requests")
        .select("id, vehicle_id, requester_id, performer_type, inspection_scope, status")
        .in("id", attachedIds)
        .in("status", ["submitted", "completed"])
    : { data: [] };

  const eligibleRequests = requestRows ?? [];
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
  const inspectionByRequest = new Map<string, MarketplaceInspectionSummary>();

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
    inspectionByRequest.set(request.id, {
      request_id: request.id,
      scope: request.inspection_scope,
      inspected_at: inspectedAt,
      performed_by: performedBy,
    });
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

  const savedIds = new Set<string>();
  if (viewerId) {
    const { data: saveRows } = await admin.rpc("marketplace_listing_save_states", {
      p_viewer_id: viewerId,
      p_listing_ids: listingIds,
    });
    for (const row of saveRows ?? []) if (row.saved) savedIds.add(row.listing_id);
  }
  const sellerIds = [...new Set(listings.map((listing) => listing.seller_id))];
  const { data: technicianSellers } = sellerIds.length
    ? await admin.from("technician_profiles").select("profile_id").in("profile_id", sellerIds)
    : { data: [] };
  const technicianIds = new Set((technicianSellers ?? []).map((row) => row.profile_id));

  return listings.map((listing) => ({
    ...listing,
    inspection_summary: (listing.attached_inspection_id && inspectionByRequest.get(listing.attached_inspection_id)) || null,
    inspection_request: openRequestByListing.get(listing.id) ?? null,
    viewer_is_seller: viewerId === listing.seller_id,
    saved_by_viewer: savedIds.has(listing.id),
    seller_type: technicianIds.has(listing.seller_id) ? "technician" as const : "member" as const,
  }));
}

/**
 * Saved listings in save order (plan 25.1). Sold/removed listings stay so
 * the member sees the outcome; listings from blocked sellers are dropped.
 */
export async function getSavedMarketplaceListings(page = 1, perPage = 20) {
  const viewerId = await getCurrentSocialProfileId();
  if (!viewerId) return [];
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const admin = createAdminClient();
  const { data: savedRows, error } = await admin.rpc("list_saved_marketplace_listing_ids", {
    p_viewer_id: viewerId,
    p_limit: perPage,
    p_offset: (safePage - 1) * perPage,
  });
  if (error) {
    console.error("[marketplace] saved listings failed", error.message);
    return [];
  }
  const ids = (savedRows ?? []).map((row) => row.listing_id);
  if (ids.length === 0) return [];
  const { data } = await admin.from("marketplace_listings").select(LISTING_SELECT).in("id", ids);
  const rows = (data ?? []) as unknown as ListingRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  const cleaned = await Promise.all(ordered.map((item) => cleanListingMedia(item)));
  return addInspectionTrust(cleaned, viewerId);
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
    .in("status", PUBLIC_LISTING_STATUSES)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as ListingRow[];
  const publicListings = await filterVisibleListings(rows, viewerId);

  const cleaned = await Promise.all(publicListings.map((item) => cleanListingMedia(item)));
  return applyFilters(await addInspectionTrust(cleaned, viewerId), filters ?? {});
}

export const MARKETPLACE_PAGE_SIZE = 24;

export type MarketplaceListingPage = {
  items: MarketplaceListing[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
};

/** One page of the browse results (plan 25.1); `page` is clamped to 1+. */
export async function getMarketplaceListingsPage(
  filters: MarketplaceFilters | undefined,
  page = 1,
  perPage = MARKETPLACE_PAGE_SIZE,
): Promise<MarketplaceListingPage> {
  const all = await getMarketplaceListings(filters);
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const size = Math.min(Math.max(Number.isInteger(perPage) ? perPage : MARKETPLACE_PAGE_SIZE, 1), 100);
  const start = (safePage - 1) * size;
  return {
    items: all.slice(start, start + size),
    page: safePage,
    per_page: size,
    total: all.length,
    has_more: start + size < all.length,
  };
}

export async function getVehicleActiveListing(vehicleId: string) {
  const supabase = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();

  const { data } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("vehicle_id", vehicleId)
    .in("status", PUBLIC_LISTING_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
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
  // Owners see their own listing in any state (paused, sold, removed) so
  // Manage Listing has somewhere to live; everyone else needs it public.
  const ownerView = viewerId !== null && listing.seller_id === viewerId;
  if (!ownerView) {
    const [visible] = await filterVisibleListings([listing], viewerId);
    if (!visible) return null;
  }
  const [trusted] = await addInspectionTrust([await cleanListingMedia(listing, !ownerView)], viewerId);
  return trusted ?? null;
}

export type ListingHighlight = {
  id: string;
  title: string;
  detail: string | null;
  date: string | null;
  source: "build_journal" | "maintenance_log";
};

export type MarketplaceSellerHistory = {
  active_count: number;
  sold_count: number;
  first_listed_at: string | null;
};

export type MarketplaceListingDetail = MarketplaceListing & {
  /** Public vehicle photos in gallery order (primary first). */
  photos: Array<{ id: string; url: string }>;
  /** Owner-published build/maintenance entries, labeled by source (plan 25.2 §6). */
  highlights: ListingHighlight[];
  seller_history: MarketplaceSellerHistory;
  /** Redacted projection of the seller-shared inspection (plan 25.3). */
  inspection_report: InspectionReport | null;
};

/**
 * The listing screen (plan 25.2): the listing plus gallery, owner-published
 * modification / maintenance highlights, and the seller's aggregate history.
 */
export async function getMarketplaceListingDetail(listingId: string): Promise<MarketplaceListingDetail | null> {
  const listing = await getMarketplaceListing(listingId);
  if (!listing) return null;
  const admin = createAdminClient();
  const [{ data: history }, { data: build }, { data: maintenance }, inspectionReport] = await Promise.all([
    admin.rpc("marketplace_seller_history", { p_seller_id: listing.seller_id }),
    admin
      .from("vehicle_build_entries")
      .select("id, title, category, manufacturer, installed_on, installation_kind, shop_name")
      .eq("vehicle_id", listing.vehicle_id)
      .eq("is_public", true)
      .order("installed_on", { ascending: false, nullsFirst: false })
      .limit(4),
    admin
      .from("vehicle_maintenance_events")
      .select("id, service_type, serviced_on, mileage, provider")
      .eq("vehicle_id", listing.vehicle_id)
      .eq("is_public", true)
      .order("serviced_on", { ascending: false })
      .limit(4),
    listing.attached_inspection_id ? getInspectionReport(listing.attached_inspection_id) : Promise.resolve(null),
  ]);
  const photos = (listing.vehicle?.vehicle_media ?? [])
    .filter((item) => item.media_type === "image")
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .map((item) => ({ id: item.id, url: item.url }));
  const highlights: ListingHighlight[] = [
    ...(build ?? []).map((entry) => ({
      id: entry.id,
      title: entry.title,
      detail: [entry.manufacturer, entry.installation_kind === "shop_installed" ? (entry.shop_name ?? "Shop installed") : entry.installation_kind === "self_installed" ? "Self installed" : null].filter(Boolean).join(" · ") || null,
      date: entry.installed_on,
      source: "build_journal" as const,
    })),
    ...(maintenance ?? []).map((event) => ({
      id: event.id,
      title: event.service_type,
      detail: [event.mileage != null ? `${event.mileage.toLocaleString()} mi` : null, event.provider].filter(Boolean).join(" · ") || null,
      date: event.serviced_on,
      source: "maintenance_log" as const,
    })),
  ];
  const historyRow = history?.[0];
  return {
    ...listing,
    photos,
    highlights,
    seller_history: {
      active_count: historyRow?.active_count ?? 0,
      sold_count: historyRow?.sold_count ?? 0,
      first_listed_at: historyRow?.first_listed_at ?? null,
    },
    inspection_report: inspectionReport,
  };
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
