import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("privacy-safe product analytics", () => {
  test("schema is allowlisted, service-only, expiring, and opt-out deletes events", () => {
    const migration = read("supabase/migrations/20260913163512_privacy_safe_product_analytics.sql");
    assert.match(migration, /no arbitrary JSON payload/);
    assert.match(migration, /REVOKE ALL ON public\.product_analytics_events FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON public\.product_analytics_preferences FROM PUBLIC, anon, authenticated/);
    assert.doesNotMatch(migration, /ADD COLUMN[^;]*usage_analytics_enabled/);
    assert.match(migration, /expires_at timestamptz NOT NULL DEFAULT \(now\(\) \+ interval '90 days'\)/);
    assert.match(migration, /IF NOT p_enabled THEN[\s\S]*DELETE FROM public\.product_analytics_events/);
    assert.doesNotMatch(migration, /properties jsonb|content text|vin text|location text/);
  });

  test("web and iOS expose one preference backed by an authenticated route", () => {
    const route = read("src/app/api/privacy/analytics/route.ts");
    assert.match(route, /requireApiRole/);
    assert.match(route, /set_product_analytics_preference/);
    assert.match(read("src/components/legal/privacy-center.tsx"), /Share product usage analytics/);
    assert.match(read("mobile-app/PerfectPPI/Features/Profile/ProfileView.swift"), /Share product usage analytics/);
  });

  test("events are emitted after meaningful server-confirmed actions", () => {
    const vehicleActions = read("src/features/vehicles/actions.ts");
    const communityActions = read("src/features/community/actions.ts");
    const marketplaceActions = read("src/features/marketplace/actions.ts");
    assert.match(vehicleActions, /garage_vehicle_added/);
    assert.match(communityActions, /question_published/);
    assert.match(communityActions, /answer_accepted/);
    assert.match(marketplaceActions, /listing_saved/);
    assert.match(marketplaceActions, /inspection_requested/);
  });

  test("admin receives aggregates instead of raw event rows", () => {
    const page = read("src/app/(admin)/admin/analytics/page.tsx");
    const query = read("src/features/analytics/queries.ts");
    assert.match(query, /get_product_analytics_summary/);
    assert.match(query, /get_product_safety_analytics_summary/);
    assert.doesNotMatch(page, /profileId|profile_id|dedupeHash|dedupe_hash/);
    assert.match(page, /Aggregate first-party measures/);
  });

  test("safety analytics suppress small report cohorts and remain service-only", () => {
    const migration = read("supabase/migrations/20260913215140_product_safety_analytics.sql");
    const privilegeFix = read("supabase/migrations/20260913220718_fix_product_safety_analytics_privileges.sql");
    assert.match(migration, /FROM report_groups WHERE report_count >= 5/);
    assert.match(migration, /reportBreakdownSuppressed/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_product_safety_analytics_summary\(integer\)[\s\S]*FROM PUBLIC, anon, authenticated/);
    assert.doesNotMatch(migration, /report\.details|content_snapshot|statement/);
    assert.match(privilegeFix, /ALTER FUNCTION public\.get_product_safety_analytics_summary\(integer\)[\s\S]*SECURITY DEFINER/);
    assert.match(privilegeFix, /SET search_path = ''/);
    assert.match(privilegeFix, /GRANT EXECUTE ON FUNCTION public\.get_product_safety_analytics_summary\(integer\)[\s\S]*TO service_role/);
  });
});
