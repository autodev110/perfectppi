import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export const savedCollectionNameSchema = z.string().trim().min(1, "Enter a collection name").max(60);
export const savedCollectionEntitySchema = z.enum(["post", "listing", "vehicle", "build"]);

export type SavedCollectionEntityType = z.infer<typeof savedCollectionEntitySchema>;
export type SavedCollectionSummary = {
  id: string;
  name: string;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export type SavedCollectionItem = {
  id: string;
  entity_type: SavedCollectionEntityType;
  available: boolean;
  title: string;
  subtitle: string | null;
  href: string | null;
  created_at: string;
};

function vehicleName(vehicle: { year: number | null; make: string | null; model: string | null; nickname?: string | null }) {
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle";
}

export async function listSavedCollections(profileId: string): Promise<SavedCollectionSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("saved_collections")
    .select("id, name, created_at, updated_at, saved_collection_items(count)")
    .eq("owner_id", profileId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((collection) => ({
    id: collection.id,
    name: collection.name,
    item_count: collection.saved_collection_items[0]?.count ?? 0,
    created_at: collection.created_at,
    updated_at: collection.updated_at,
  }));
}

export async function upsertSavedCollection(profileId: string, collectionId: string | null, name: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("upsert_saved_collection", {
    p_actor_profile_id: profileId,
    p_collection_id: collectionId,
    p_name: name,
  });
  if (error) throw error;
  return data;
}

export async function removeSavedCollection(profileId: string, collectionId: string) {
  const { data, error } = await createAdminClient().rpc("delete_saved_collection", {
    p_actor_profile_id: profileId,
    p_collection_id: collectionId,
  });
  if (error) throw error;
  return data;
}

export async function setSavedCollectionItem(input: {
  profileId: string;
  collectionId: string;
  entityType: SavedCollectionEntityType;
  entityId: string;
  saved: boolean;
}) {
  const { data, error } = await createAdminClient().rpc("set_saved_collection_item", {
    p_actor_profile_id: input.profileId,
    p_collection_id: input.collectionId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_saved: input.saved,
  });
  if (error) throw error;
  return data;
}

export async function removeSavedCollectionItem(profileId: string, collectionId: string, itemId: string) {
  const admin = createAdminClient();
  const { data: collection } = await admin.from("saved_collections")
    .select("id")
    .eq("id", collectionId)
    .eq("owner_id", profileId)
    .maybeSingle();
  if (!collection) return false;
  const { data, error } = await admin.from("saved_collection_items")
    .delete()
    .eq("id", itemId)
    .eq("collection_id", collectionId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (data) await admin.from("saved_collections").update({ updated_at: new Date().toISOString() }).eq("id", collectionId);
  return !!data;
}

/**
 * Collection rows deliberately keep only IDs. We re-check current visibility
 * here and return a generic placeholder when the source was removed or made
 * private, so prior text and vehicle details cannot leak from a stale save.
 */
export async function getSavedCollectionItems(profileId: string, collectionId: string): Promise<SavedCollectionItem[] | null> {
  const admin = createAdminClient();
  const { data: collection } = await admin
    .from("saved_collections")
    .select("id")
    .eq("id", collectionId)
    .eq("owner_id", profileId)
    .maybeSingle();
  if (!collection) return null;

  const { data: rows, error } = await admin
    .from("saved_collection_items")
    .select("id, entity_type, entity_id, created_at")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  if (!rows?.length) return [];

  const grouped = new Map<SavedCollectionEntityType, typeof rows>();
  for (const row of rows) {
    const items = grouped.get(row.entity_type) ?? [];
    items.push(row);
    grouped.set(row.entity_type, items);
  }

  const available = new Map<string, Omit<SavedCollectionItem, "id" | "entity_type" | "created_at">>();

  const postRows = grouped.get("post") ?? [];
  if (postRows.length) {
    const visibility = await Promise.all(postRows.map(async (row) => {
      const { data } = await admin.rpc("social_can_view_community_post", {
        p_viewer_id: profileId, p_post_id: row.entity_id, p_include_muted: true,
      });
      return data ? row.entity_id : null;
    }));
    const ids = visibility.filter((id): id is string => !!id);
    if (ids.length) {
      const { data } = await admin.from("community_posts")
        .select("id, content, author:profiles!community_posts_author_id_fkey(display_name, username)")
        .in("id", ids);
      for (const post of data ?? []) {
        const author = Array.isArray(post.author) ? post.author[0] : post.author;
        available.set(`post:${post.id}`, {
          available: true,
          title: post.content.trim().slice(0, 100) || "Community post",
          subtitle: author?.display_name ?? author?.username ?? "PerfectPPI member",
          href: `/community/posts/${post.id}`,
        });
      }
    }
  }

  const listingRows = grouped.get("listing") ?? [];
  if (listingRows.length) {
    const listingIds = listingRows.map((row) => row.entity_id);
    const [{ data: visible }, { data: owned }] = await Promise.all([
      admin.rpc("marketplace_visible_listing_ids", { p_viewer_id: profileId, p_listing_ids: listingIds }),
      admin.from("marketplace_listings").select("id").eq("seller_id", profileId).in("id", listingIds),
    ]);
    const ids = [...new Set([...(visible ?? []).map((row) => row.listing_id), ...(owned ?? []).map((row) => row.id)])];
    if (ids.length) {
      const { data } = await admin.from("marketplace_listings")
        .select("id, title, asking_price_cents, vehicle:vehicles!marketplace_listings_vehicle_id_fkey(year, make, model, nickname)")
        .in("id", ids);
      for (const listing of data ?? []) {
        const vehicle = Array.isArray(listing.vehicle) ? listing.vehicle[0] : listing.vehicle;
        available.set(`listing:${listing.id}`, {
          available: true,
          title: listing.title || (vehicle ? vehicleName(vehicle) : "Marketplace listing"),
          subtitle: `$${Math.round(listing.asking_price_cents / 100).toLocaleString()}`,
          href: `/marketplace/listings/${listing.id}`,
        });
      }
    }
  }

  const vehicleRows = grouped.get("vehicle") ?? [];
  const buildRows = grouped.get("build") ?? [];
  const { data: builds } = buildRows.length
    ? await admin.from("vehicle_build_entries").select("id, vehicle_id, owner_id, title, category, is_public").in("id", buildRows.map((row) => row.entity_id))
    : { data: [] as Array<{ id: string; vehicle_id: string; owner_id: string; title: string; category: string; is_public: boolean }> };
  const vehicleIds = [...new Set([
    ...vehicleRows.map((row) => row.entity_id),
    ...(builds ?? []).map((entry) => entry.vehicle_id),
  ])];
  const visibleVehicleIds = new Set((await Promise.all(vehicleIds.map(async (id) => {
    const { data } = await admin.rpc("social_can_view_vehicle", { p_viewer_id: profileId, p_vehicle_id: id });
    return data ? id : null;
  }))).filter((id): id is string => !!id));
  if (visibleVehicleIds.size) {
    const { data: vehicles } = await admin.from("vehicles")
      .select("id, year, make, model, nickname")
      .in("id", [...visibleVehicleIds]);
    for (const vehicle of vehicles ?? []) {
      available.set(`vehicle:${vehicle.id}`, {
        available: true,
        title: vehicleName(vehicle),
        subtitle: "Vehicle Passport",
        href: `/vehicle/${vehicle.id}`,
      });
    }
    const vehicleById = new Map((vehicles ?? []).map((vehicle) => [vehicle.id, vehicleName(vehicle)]));
    for (const entry of builds ?? []) {
      if (!visibleVehicleIds.has(entry.vehicle_id) || (!entry.is_public && entry.owner_id !== profileId)) continue;
      available.set(`build:${entry.id}`, {
        available: true,
        title: entry.title,
        subtitle: [vehicleById.get(entry.vehicle_id), entry.category].filter(Boolean).join(" · "),
        href: `/vehicle/${entry.vehicle_id}?tab=build#build-${entry.id}`,
      });
    }
  }

  return rows.map((row) => ({
    id: row.id,
    entity_type: row.entity_type,
    created_at: row.created_at,
    ...(available.get(`${row.entity_type}:${row.entity_id}`) ?? {
      available: false,
      title: "Saved item unavailable",
      subtitle: "It may have been removed or made private.",
      href: null,
    }),
  }));
}

export async function getVehicleBuildSubscription(profileId: string, vehicleId: string) {
  const { data } = await createAdminClient().from("vehicle_build_subscriptions")
    .select("vehicle_id")
    .eq("profile_id", profileId)
    .eq("vehicle_id", vehicleId)
    .maybeSingle();
  return !!data;
}

export async function setVehicleBuildSubscription(profileId: string, vehicleId: string, subscribed: boolean) {
  const { data, error } = await createAdminClient().rpc("set_vehicle_build_subscription", {
    p_actor_profile_id: profileId,
    p_vehicle_id: vehicleId,
    p_subscribed: subscribed,
  });
  if (error) throw error;
  return data;
}

export type SavedCollectionRow = Database["public"]["Tables"]["saved_collections"]["Row"];
