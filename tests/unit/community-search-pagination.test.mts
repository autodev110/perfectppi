import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("Community search cursor pagination", () => {
  test("uses bounded service-only keysets for every ranked result type", async () => {
    const migration = await source("supabase/migrations/20260913182857_unified_search_cursor_pagination.sql");
    for (const name of [
      "search_community_posts_cursor",
      "search_community_groups_cursor",
      "search_vehicles_cursor",
      "search_marketplace_listings_cursor",
      "search_technicians_cursor",
      "search_profiles_cursor",
      "search_community_events_cursor",
    ]) {
      assert.match(migration, new RegExp(`CREATE FUNCTION public\\.${name}`));
      assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}`));
    }
    assert.match(migration, /num_nonnulls\(p_before_rank, p_before_sort_at, p_before_id\) NOT IN \(0, 3\)/);
    assert.match(migration, /LIMIT LEAST\(GREATEST\(COALESCE\(p_limit, 20\), 1\), 50\)/);
  });

  test("binds opaque cursors to both the normalized query and result tab", async () => {
    const cursor = await source("src/features/search/cursor.ts");
    assert.match(cursor, /parsed\.data\.tab !== expectedTab/);
    assert.match(cursor, /parsed\.data\.q !== expectedQuery/);
    assert.match(cursor, /value\.length > 512/);
  });

  test("keeps offset compatibility while updated web and iOS clients opt in", async () => {
    const [route, web, peopleRoute, peopleWeb, iosApi, iosView, iosPeopleApi, iosPeopleView] = await Promise.all([
      source("src/app/api/community/search/route.ts"),
      source("src/app/(public)/community/search/page.tsx"),
      source("src/app/api/social/people/route.ts"),
      source("src/app/(public)/community/people/page.tsx"),
      source("mobile-app/PerfectPPI/Core/Networking/Endpoints/CommunityAPI.swift"),
      source("mobile-app/PerfectPPI/Features/Community/CommunitySearchView.swift"),
      source("mobile-app/PerfectPPI/Core/Networking/Endpoints/SocialAPI.swift"),
      source("mobile-app/PerfectPPI/Features/Social/PeopleSearchView.swift"),
    ]);
    assert.match(route, /pagination"\) === "cursor"/);
    assert.match(route, /This search page link is invalid/);
    assert.match(web, /results\.nextCursor/);
    assert.match(iosApi, /URLQueryItem\(name: "pagination", value: "cursor"\)/);
    assert.match(iosView, /current\.nextCursor/);
    assert.match(peopleRoute, /decodeSearchCursor\(rawCursor, "people", query\)/);
    assert.match(peopleWeb, /searchPeople\(query, page, cursor\)/);
    assert.match(iosPeopleApi, /URLQueryItem\(name: "pagination", value: "cursor"\)/);
    assert.match(iosPeopleView, /response\.nextCursor/);
  });
});
