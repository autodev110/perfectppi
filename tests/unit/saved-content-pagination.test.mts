import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("Saved content cursor pagination", () => {
  test("uses indexed service-only keysets without removing legacy RPCs", async () => {
    const migration = await source("supabase/migrations/20260913230000_saved_content_cursor_pagination.sql");
    assert.match(migration, /community_post_saves\(profile_id, created_at DESC, post_id DESC\)/);
    assert.match(migration, /marketplace_listing_saves\(profile_id, created_at DESC, listing_id DESC\)/);
    assert.match(migration, /\(save\.created_at, save\.post_id\) < \(p_before_saved_at, p_before_post_id\)/);
    assert.match(migration, /\(save\.created_at, save\.listing_id\) < \(p_before_saved_at, p_before_listing_id\)/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.list_saved_community_post_ids_cursor/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.list_saved_marketplace_listing_ids_cursor/);
    assert.doesNotMatch(migration, /DROP FUNCTION/);
  });

  test("binds cursors to their saved-content type", async () => {
    const cursor = await source("src/features/saved/cursor.ts");
    assert.match(cursor, /parsed\.data\.kind !== expectedKind/);
    assert.match(cursor, /value\.length > 256/);
  });

  test("keeps old API responses while web and iOS opt into cursor pages", async () => {
    const [postRoute, listingRoute, web, communityApi, marketplaceApi, mobile] = await Promise.all([
      source("src/app/api/community/saved/route.ts"),
      source("src/app/api/marketplace/saved/route.ts"),
      source("src/app/(dashboard)/dashboard/saved/page.tsx"),
      source("mobile-app/PerfectPPI/Core/Networking/Endpoints/CommunityAPI.swift"),
      source("mobile-app/PerfectPPI/Core/Networking/Endpoints/MarketplaceAPI.swift"),
      source("mobile-app/PerfectPPI/Features/Community/SavedPostsView.swift"),
    ]);
    assert.match(postRoute, /getSavedCommunityPosts\(parsed\.data\.page, 20\)/);
    assert.match(postRoute, /getSavedCommunityPostsPage\(cursor, 20\)/);
    assert.match(listingRoute, /getSavedMarketplaceListings\(parsed\.data\.page, 20\)/);
    assert.match(listingRoute, /getSavedMarketplaceListingsPage\(cursor, 20\)/);
    assert.match(web, /postPage\.nextCursor/);
    assert.match(web, /listingPage\.nextCursor/);
    assert.match(communityApi, /static func savedPage\(cursor: String\? = nil\)/);
    assert.match(marketplaceApi, /static func savedPage\(cursor: String\? = nil\)/);
    assert.match(mobile, /Text\(loadingMore \? "Loading…" : "Load More"\)/);
  });
});
