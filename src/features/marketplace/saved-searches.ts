// Saved marketplace searches (plan 25.1). Ten per member, one aggregated
// notice per search per day from the daily worker.
import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSocialProfileId } from "@/features/social/relationships";
import { cleanFilters, hasActiveFilters, marketplaceFiltersSchema, type MarketplaceFilters } from "@/lib/marketplace/filters";
import type { Json } from "@/types/database";

export type SavedSearch = {
  id: string;
  name: string;
  filters: MarketplaceFilters;
  notify: boolean;
  created_at: string;
  updated_at: string;
};

const saveSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1, "Give the search a name").max(60),
  filters: marketplaceFiltersSchema,
  notify: z.boolean().default(true),
});

export type SavedSearchResult =
  | { ok: true; search: SavedSearch }
  | { ok: false; outcome: "invalid" | "unauthenticated" | "limit" | "not_found" | "failed"; message: string };

function toSavedSearch(row: { id: string; name: string; filters: Json; notify: boolean; created_at: string; updated_at: string }): SavedSearch {
  const parsed = marketplaceFiltersSchema.safeParse(row.filters ?? {});
  return { id: row.id, name: row.name, filters: parsed.success ? cleanFilters(parsed.data) : {}, notify: row.notify, created_at: row.created_at, updated_at: row.updated_at };
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const profileId = await getCurrentSocialProfileId();
  if (!profileId) return [];
  const { data, error } = await createAdminClient().rpc("list_marketplace_saved_searches", { p_actor_profile_id: profileId });
  if (error) {
    console.error("list_marketplace_saved_searches failed", error.message);
    return [];
  }
  return (data ?? []).map(toSavedSearch);
}

export async function getSavedSearch(id: string): Promise<SavedSearch | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  return (await listSavedSearches()).find((search) => search.id === id) ?? null;
}

export async function saveSearch(input: unknown): Promise<SavedSearchResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, outcome: "invalid", message: parsed.error.errors[0]?.message ?? "Check the saved search." };
  const filters = cleanFilters(parsed.data.filters);
  if (!hasActiveFilters(filters)) return { ok: false, outcome: "invalid", message: "Add at least one filter before saving a search." };
  const profileId = await getCurrentSocialProfileId();
  if (!profileId) return { ok: false, outcome: "unauthenticated", message: "Sign in to save searches." };

  const { data, error } = await createAdminClient().rpc("upsert_marketplace_saved_search", {
    p_actor_profile_id: profileId,
    p_search_id: parsed.data.id ?? null,
    p_name: parsed.data.name,
    p_filters: filters as Json,
    p_notify: parsed.data.notify,
  });
  if (error || !data) {
    if (error?.message.includes("saved_search_limit")) return { ok: false, outcome: "limit", message: "You can keep up to 10 saved searches. Remove one to add another." };
    if (error?.code === "P0002") return { ok: false, outcome: "not_found", message: "That saved search is no longer available." };
    console.warn("upsert_marketplace_saved_search failed", { code: error?.code, message: error?.message });
    return { ok: false, outcome: "failed", message: "The search could not be saved. Please try again." };
  }
  return { ok: true, search: toSavedSearch(data) };
}

export async function deleteSavedSearch(id: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(id).success) return false;
  const profileId = await getCurrentSocialProfileId();
  if (!profileId) return false;
  const { data, error } = await createAdminClient().rpc("delete_marketplace_saved_search", { p_actor_profile_id: profileId, p_search_id: id });
  if (error) console.warn("delete_marketplace_saved_search failed", error.message);
  return data === true;
}

/** Daily worker: one notice per saved search with new matching listings. */
export async function runSavedSearchNotifications(limit = 500) {
  const { data, error } = await createAdminClient().rpc("notify_marketplace_saved_search_matches", { p_limit: limit });
  if (error) throw new Error(error.message);
  return { notices: data ?? 0 };
}
