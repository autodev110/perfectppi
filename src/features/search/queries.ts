// Unified Community search (plan 27.2). Each tab is one service-only RPC
// that matches text first and applies the canonical visibility rules before
// returning ids; this module hydrates the ids into the same shapes the
// existing screens use, so nothing here invents a second visibility policy.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCommunityViewerId, getCommunityPostsForViewer, type CommunityFeedPost } from "@/features/community/queries";
import { getCommunityGroups, type CommunityGroupSummary } from "@/features/social/groups";
import { searchPeople, type PeopleSearchResult } from "@/features/social/friends";
import { getFeatureFlags } from "@/lib/feature-flags";
import { getPublicCredentialMap } from "@/features/technicians/credentials";
import type { PublicTechnicianCredential } from "@/features/technicians/credential-types";
import { searchCommunityEvents, type CommunityEventSummary } from "@/features/social/events";
import { encodeSearchCursor, type SearchCursor } from "@/features/search/cursor";

export const SEARCH_TABS = ["posts", "people", "groups", "vehicles", "listings", "technicians", "events"] as const;
export type SearchTab = (typeof SEARCH_TABS)[number];
export const SEARCH_TAB_LABELS: Record<SearchTab, string> = {
  posts: "Posts", people: "People", groups: "Groups", vehicles: "Vehicles", listings: "Listings", technicians: "Technicians", events: "Events",
};
export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

export type SearchVehicleResult = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  nickname: string | null;
  visibility: string;
  owner: { id: string; username: string | null; display_name: string | null; avatar_url: string | null } | null;
  photo_url: string | null;
  listing_id: string | null;
};

export type SearchListingResult = {
  id: string;
  title: string;
  asking_price_cents: number;
  location: string | null;
  vehicle_id: string;
  vehicle_label: string;
  photo_url: string | null;
};

export type SearchTechnicianResult = {
  id: string;
  profile_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  specialties: string[];
  service_area: string | null;
  credentials: PublicTechnicianCredential[];
  total_inspections: number;
  avg_rating: number;
};

export type UnifiedSearchResults =
  | { tab: "posts"; items: CommunityFeedPost[] }
  | { tab: "people"; items: PeopleSearchResult[] }
  | { tab: "groups"; items: CommunityGroupSummary[] }
  | { tab: "vehicles"; items: SearchVehicleResult[] }
  | { tab: "listings"; items: SearchListingResult[] }
  | { tab: "technicians"; items: SearchTechnicianResult[] }
  | { tab: "events"; items: CommunityEventSummary[] };

export type UnifiedSearchPage = UnifiedSearchResults & {
  query: string;
  page: number;
  hasMore: boolean;
  nextCursor: string | null;
  /** Makes that look like a misspelled term, for the no-results state. */
  suggestions: string[];
};

export function normalizeSearchQuery(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_LENGTH);
}

export function isSearchTab(value: unknown): value is SearchTab {
  return typeof value === "string" && (SEARCH_TABS as readonly string[]).includes(value);
}

function vehicleLabel(vehicle: { year: number | null; make: string | null; model: string | null; trim?: string | null }) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
}

function primaryPhoto(media: Array<{ url: string; is_primary: boolean; moderation_status: string }> | null | undefined) {
  const active = (media ?? []).filter((item) => item.moderation_status === "active");
  return (active.find((item) => item.is_primary) ?? active[0])?.url ?? null;
}

export async function unifiedSearch(
  rawQuery: string,
  tab: SearchTab,
  page = 1,
  cursor?: SearchCursor | null,
): Promise<UnifiedSearchPage> {
  const query = normalizeSearchQuery(rawQuery);
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const empty = (): UnifiedSearchPage => ({ tab, items: [], query, page: safePage, hasMore: false, nextCursor: null, suggestions: [] } as UnifiedSearchPage);
  if (query.length < SEARCH_MIN_LENGTH) return empty();
  const viewerId = await getCommunityViewerId();
  if (!viewerId) return empty();

  const admin = createAdminClient();
  const limit = SEARCH_PAGE_SIZE + 1;
  const offset = (safePage - 1) * SEARCH_PAGE_SIZE;
  const rpcArgs = { p_viewer_id: viewerId, p_query: query, p_limit: limit, p_offset: offset };

  let result: UnifiedSearchResults;
  let hasMore = false;
  let nextCursor: string | null = null;
  switch (tab) {
    case "people": {
      const people = await searchPeople(
        query,
        safePage,
        cursor !== undefined ? (cursor?.tab === "people" ? cursor : null) : undefined,
      );
      result = { tab, items: people.results };
      hasMore = people.hasMore;
      nextCursor = people.nextCursor;
      break;
    }
    case "posts": {
      let rows: Array<{ post_id: string; rank: number; sort_at?: string }>;
      let error: { message: string } | null;
      if (cursor !== undefined) {
        const boundary = cursor?.tab === "posts" ? cursor : null;
        const response = await admin.rpc("search_community_posts_cursor", {
          p_viewer_id: viewerId,
          p_query: query,
          p_limit: limit,
          p_before_rank: boundary?.rank ?? null,
          p_before_sort_at: boundary?.sortAt ?? null,
          p_before_id: boundary?.id ?? null,
        });
        rows = response.data ?? [];
        error = response.error;
      } else {
        const response = await admin.rpc("search_community_posts", rpcArgs);
        rows = response.data ?? [];
        error = response.error;
      }
      if (error) console.error("search_community_posts failed", error.message);
      hasMore = rows.length > SEARCH_PAGE_SIZE;
      const pageRows = rows.slice(0, SEARCH_PAGE_SIZE);
      const boundary = pageRows.at(-1);
      if (cursor !== undefined && hasMore && boundary?.sort_at) {
        nextCursor = encodeSearchCursor({ v: 1, tab, q: query, rank: boundary.rank, sortAt: boundary.sort_at, id: boundary.post_id });
      }
      result = { tab, items: await getCommunityPostsForViewer(viewerId, pageRows.map((row) => row.post_id)) };
      break;
    }
    case "groups": {
      if (!(await getFeatureFlags()).flags.groups) { result = { tab, items: [] }; break; }
      let rows: Array<{ group_id: string; rank: number; sort_text?: string }>;
      let error: { message: string } | null;
      if (cursor !== undefined) {
        const boundary = cursor?.tab === "groups" ? cursor : null;
        const response = await admin.rpc("search_community_groups_cursor", {
          p_viewer_id: viewerId,
          p_query: query,
          p_limit: limit,
          p_before_rank: boundary?.rank ?? null,
          p_before_sort_text: boundary?.sortText ?? null,
          p_before_id: boundary?.id ?? null,
        });
        rows = response.data ?? [];
        error = response.error;
      } else {
        const response = await admin.rpc("search_community_groups", rpcArgs);
        rows = response.data ?? [];
        error = response.error;
      }
      if (error) console.error("search_community_groups failed", error.message);
      hasMore = rows.length > SEARCH_PAGE_SIZE;
      const pageRows = rows.slice(0, SEARCH_PAGE_SIZE);
      const boundary = pageRows.at(-1);
      if (cursor !== undefined && hasMore && boundary?.sort_text) {
        nextCursor = encodeSearchCursor({ v: 1, tab, q: query, rank: boundary.rank, sortText: boundary.sort_text, id: boundary.group_id });
      }
      const ids = pageRows.map((row) => row.group_id);
      // The directory already carries membership state and counts for this
      // viewer; keep the search order.
      const directory = new Map((await getCommunityGroups()).map((group) => [group.id, group]));
      result = { tab, items: ids.flatMap((id) => directory.get(id) ?? []) };
      break;
    }
    case "vehicles": {
      let rows: Array<{ vehicle_id: string; rank: number; sort_at?: string }>;
      let error: { message: string } | null;
      if (cursor !== undefined) {
        const boundary = cursor?.tab === "vehicles" ? cursor : null;
        const response = await admin.rpc("search_vehicles_cursor", {
          p_viewer_id: viewerId,
          p_query: query,
          p_limit: limit,
          p_before_rank: boundary?.rank ?? null,
          p_before_sort_at: boundary?.sortAt ?? null,
          p_before_id: boundary?.id ?? null,
        });
        rows = response.data ?? [];
        error = response.error;
      } else {
        const response = await admin.rpc("search_vehicles", rpcArgs);
        rows = response.data ?? [];
        error = response.error;
      }
      if (error) console.error("search_vehicles failed", error.message);
      hasMore = rows.length > SEARCH_PAGE_SIZE;
      const pageRows = rows.slice(0, SEARCH_PAGE_SIZE);
      const boundary = pageRows.at(-1);
      if (cursor !== undefined && hasMore && boundary?.sort_at) {
        nextCursor = encodeSearchCursor({ v: 1, tab, q: query, rank: boundary.rank, sortAt: boundary.sort_at, id: boundary.vehicle_id });
      }
      const pageIds = pageRows.map((row) => row.vehicle_id);
      const [{ data: vehicles }, { data: listings }] = pageIds.length
        ? await Promise.all([
          admin
            .from("vehicles")
            .select("id, year, make, model, trim, nickname, visibility, owner:profiles!vehicles_owner_id_fkey(id, username, display_name, avatar_url), vehicle_media(url, is_primary, moderation_status)")
            .in("id", pageIds),
          admin.from("marketplace_listings").select("id, vehicle_id").in("vehicle_id", pageIds).eq("status", "active"),
        ])
        : [{ data: [] }, { data: [] }];
      const listingByVehicle = new Map((listings ?? []).map((listing) => [listing.vehicle_id, listing.id]));
      const byId = new Map((vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));
      result = {
        tab,
        // Redacted projection (23.3): never VIN, plate, or location.
        items: pageIds.flatMap((id) => {
          const vehicle = byId.get(id);
          if (!vehicle) return [];
          const owner = Array.isArray(vehicle.owner) ? vehicle.owner[0] : vehicle.owner;
          return [{
            id: vehicle.id,
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            trim: vehicle.trim,
            nickname: vehicle.nickname,
            visibility: vehicle.visibility,
            owner: owner ? { id: owner.id, username: owner.username, display_name: owner.display_name, avatar_url: owner.avatar_url } : null,
            photo_url: primaryPhoto(vehicle.vehicle_media),
            listing_id: listingByVehicle.get(vehicle.id) ?? null,
          }];
        }),
      };
      break;
    }
    case "listings": {
      let rows: Array<{ listing_id: string; rank: number; sort_at?: string }>;
      let error: { message: string } | null;
      if (cursor !== undefined) {
        const boundary = cursor?.tab === "listings" ? cursor : null;
        const response = await admin.rpc("search_marketplace_listings_cursor", {
          p_viewer_id: viewerId,
          p_query: query,
          p_limit: limit,
          p_before_rank: boundary?.rank ?? null,
          p_before_sort_at: boundary?.sortAt ?? null,
          p_before_id: boundary?.id ?? null,
        });
        rows = response.data ?? [];
        error = response.error;
      } else {
        const response = await admin.rpc("search_marketplace_listings", rpcArgs);
        rows = response.data ?? [];
        error = response.error;
      }
      if (error) console.error("search_marketplace_listings failed", error.message);
      hasMore = rows.length > SEARCH_PAGE_SIZE;
      const pageRows = rows.slice(0, SEARCH_PAGE_SIZE);
      const boundary = pageRows.at(-1);
      if (cursor !== undefined && hasMore && boundary?.sort_at) {
        nextCursor = encodeSearchCursor({ v: 1, tab, q: query, rank: boundary.rank, sortAt: boundary.sort_at, id: boundary.listing_id });
      }
      const pageIds = pageRows.map((row) => row.listing_id);
      const { data: listings } = pageIds.length
        ? await admin
          .from("marketplace_listings")
          .select("id, title, asking_price_cents, location, vehicle_id, vehicle:vehicles!marketplace_listings_vehicle_id_fkey(year, make, model, trim, vehicle_media(url, is_primary, moderation_status))")
          .in("id", pageIds)
        : { data: [] };
      const byId = new Map((listings ?? []).map((listing) => [listing.id, listing]));
      result = {
        tab,
        items: pageIds.flatMap((id) => {
          const listing = byId.get(id);
          if (!listing) return [];
          const vehicle = Array.isArray(listing.vehicle) ? listing.vehicle[0] : listing.vehicle;
          return [{
            id: listing.id,
            title: listing.title,
            asking_price_cents: listing.asking_price_cents,
            location: listing.location,
            vehicle_id: listing.vehicle_id,
            vehicle_label: vehicle ? vehicleLabel(vehicle) : "",
            photo_url: primaryPhoto(vehicle?.vehicle_media),
          }];
        }),
      };
      break;
    }
    case "technicians": {
      let rows: Array<{ technician_id: string; profile_id: string; rank: number; sort_count?: number }>;
      let error: { message: string } | null;
      if (cursor !== undefined) {
        const boundary = cursor?.tab === "technicians" ? cursor : null;
        const response = await admin.rpc("search_technicians_cursor", {
          p_viewer_id: viewerId,
          p_query: query,
          p_limit: limit,
          p_before_rank: boundary?.rank ?? null,
          p_before_sort_count: boundary?.sortCount ?? null,
          p_before_id: boundary?.id ?? null,
        });
        rows = response.data ?? [];
        error = response.error;
      } else {
        const response = await admin.rpc("search_technicians", rpcArgs);
        rows = response.data ?? [];
        error = response.error;
      }
      if (error) console.error("search_technicians failed", error.message);
      hasMore = rows.length > SEARCH_PAGE_SIZE;
      const pageRows = rows.slice(0, SEARCH_PAGE_SIZE);
      const boundary = pageRows.at(-1);
      if (cursor !== undefined && hasMore && boundary?.sort_count != null) {
        nextCursor = encodeSearchCursor({ v: 1, tab, q: query, rank: boundary.rank, sortCount: boundary.sort_count, id: boundary.technician_id });
      }
      const { data: technicians } = pageRows.length
        ? await admin
          .from("technician_profiles")
          .select("id, profile_id, specialties, service_area, total_inspections, avg_rating, profile:profiles!technician_profiles_profile_id_fkey(username, display_name, avatar_url)")
          .in("id", pageRows.map((row) => row.technician_id))
        : { data: [] };
      const byId = new Map((technicians ?? []).map((technician) => [technician.id, technician]));
      const credentialMap = await getPublicCredentialMap((technicians ?? []).map((technician) => technician.id));
      result = {
        tab,
        items: pageRows.flatMap((row) => {
          const technician = byId.get(row.technician_id);
          if (!technician) return [];
          const profile = Array.isArray(technician.profile) ? technician.profile[0] : technician.profile;
          return [{
            id: technician.id,
            profile_id: technician.profile_id,
            username: profile?.username ?? null,
            display_name: profile?.display_name ?? null,
            avatar_url: profile?.avatar_url ?? null,
            specialties: technician.specialties ?? [],
            service_area: technician.service_area,
            credentials: credentialMap.get(technician.id) ?? [],
            total_inspections: technician.total_inspections,
            avg_rating: Number(technician.avg_rating ?? 0),
          }];
        }),
      };
      break;
    }
    case "events": {
      const found = await searchCommunityEvents(
        query,
        safePage,
        SEARCH_PAGE_SIZE,
        cursor !== undefined ? (cursor?.tab === "events" ? cursor : null) : undefined,
      );
      result = { tab, items: found.events };
      hasMore = found.hasMore;
      nextCursor = found.nextCursor;
      break;
    }
  }

  let suggestions: string[] = [];
  if (result.items.length === 0) {
    const { data } = await admin.rpc("search_make_suggestions", { p_query: query });
    suggestions = (data ?? []).map((row) => row.suggestion);
  }
  return { ...result, query, page: safePage, hasMore, nextCursor, suggestions };
}
