import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const enumMigration = await readFile(
  new URL("../../supabase/migrations/20260912210000_saved_collection_and_build_notification_enum.sql", import.meta.url),
  "utf8",
);
const schemaMigration = await readFile(
  new URL("../../supabase/migrations/20260912211000_named_saved_collections_and_build_subscriptions.sql", import.meta.url),
  "utf8",
);
const privacyExport = await readFile(new URL("../../src/lib/privacy/export.ts", import.meta.url), "utf8");

describe("named saved collections and build subscriptions", () => {
  test("commits enum values before the schema references them", () => {
    assert.match(enumMigration, /ADD VALUE IF NOT EXISTS 'build_update'/);
    assert.match(enumMigration, /CREATE TYPE public\.saved_collection_entity_type/);
    assert.doesNotMatch(schemaMigration, /ALTER TYPE public\.notification_type ADD VALUE/);
  });

  test("keeps collection and subscription tables private and service-routed", () => {
    for (const table of ["saved_collections", "saved_collection_items", "vehicle_build_subscriptions"]) {
      assert.match(schemaMigration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
      assert.match(schemaMigration, new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated`));
    }
    assert.doesNotMatch(schemaMigration, /CREATE POLICY/);
  });

  test("re-checks visibility and never creates a public subscription count", () => {
    assert.match(schemaMigration, /social_can_view_community_post/);
    assert.match(schemaMigration, /marketplace_visible_listing_ids/);
    assert.match(schemaMigration, /social_can_view_vehicle/);
    assert.match(schemaMigration, /subscription\.profile_id <> NEW\.owner_id/);
    assert.doesNotMatch(schemaMigration, /subscriber_count|follower_count/);
  });

  test("security-definer entry points are revoked from ordinary clients", () => {
    for (const fn of ["upsert_saved_collection", "delete_saved_collection", "set_saved_collection_item", "set_vehicle_build_subscription"]) {
      assert.match(schemaMigration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}`));
      assert.match(schemaMigration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}.*TO service_role`, "s"));
    }
  });

  test("includes private organization data in account exports", () => {
    assert.match(privacyExport, /savedCollections/);
    assert.match(privacyExport, /savedCollectionItems/);
    assert.match(privacyExport, /vehicleBuildSubscriptions/);
  });
});
