import { resolveSourceCopy } from "../helpers/localized-source.mts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8").then(resolveSourceCopy);

describe("Marketplace cursor pagination", () => {
  test("uses a bounded service-only keyset for every browse sort", async () => {
    const migration = await source("supabase/migrations/20260913230200_marketplace_directory_cursor_pagination.sql");
    assert.match(migration, /CREATE FUNCTION public\.list_marketplace_listing_ids_cursor/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.list_marketplace_listing_ids_cursor/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.list_marketplace_listing_ids_cursor[\s\S]*?TO service_role/);
    assert.match(migration, /LIMIT LEAST\(GREATEST\(COALESCE\(p_limit, 24\), 1\), 100\)/);
    for (const sort of ["newest", "oldest", "price_asc", "price_desc", "mileage_asc", "recently_inspected"]) {
      assert.match(migration, new RegExp(`'${sort}'`));
    }
    assert.match(migration, /\(ranked\.timestamp_value, ranked\.id\) < \(p_before_timestamp, p_before_listing_id\)/);
    assert.match(migration, /\(ranked\.numeric_value, ranked\.id\) > \(p_before_numeric, p_before_listing_id\)/);
    assert.doesNotMatch(migration, /\bOFFSET\b/);
  });

  test("binds opaque cursors to the normalized filters and sort", async () => {
    const cursor = await source("src/features/marketplace/cursor.ts");
    assert.match(cursor, /marketplaceFilterFingerprint\(filters\)/);
    assert.match(cursor, /parsed\.data\.sort !== marketplaceSort\(filters\)/);
    assert.match(cursor, /parsed\.data\.filters !== marketplaceFilterFingerprint\(filters\)/);
    assert.match(cursor, /value\.length > 512/);
  });

  test("keeps legacy responses while current web and iOS clients use cursors", async () => {
    const [route, queries, web, iosApi, iosView] = await Promise.all([
      source("src/app/api/marketplace/listings/route.ts"),
      source("src/features/marketplace/queries.ts"),
      source("src/app/(public)/marketplace/page.tsx"),
      source("mobile-app/PerfectPPI/Core/Networking/Endpoints/MarketplaceAPI.swift"),
      source("mobile-app/PerfectPPI/Features/Marketplace/MarketplaceView.swift"),
    ]);
    assert.match(route, /pagination"\) === "cursor"/);
    assert.match(route, /getMarketplaceListingsPage\(filters/);
    assert.match(route, /getMarketplaceListings\(filters\)/);
    assert.match(route, /status: 400/);
    assert.match(route, /status: 503/);
    assert.match(queries, /getMarketplaceListingsCursorPage/);
    assert.match(queries, /p_limit: size \+ 1/);
    assert.match(web, /getMarketplaceListingsCursorPage\(filters, cursor\)/);
    assert.match(web, /Back to first results/);
    assert.match(web, /More results/);
    assert.match(iosApi, /static func listCursorPage\(filters: MarketplaceFilters, cursor: String\? = nil\)/);
    assert.match(iosApi, /URLQueryItem\(name: "pagination", value: "cursor"\)/);
    assert.match(iosView, /firstPage\.nextCursor/);
    assert.match(iosView, /MarketplaceAPI\.listCursorPage\(filters: filters, cursor: cursor\)/);
  });
});
