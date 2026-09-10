import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { normalizeUsername, usernameSchema } from "../../src/features/profiles/username.ts";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8");

describe("social username foundation", () => {
  test("uses the same 4-16 ASCII username rules", () => {
    for (const value of ["RoadPilot", "driver_2026", "ABCD", "A123456789012345"]) {
      assert.equal(usernameSchema.safeParse(value).success, true, value);
    }
    for (const value of ["abc", "A1234567890123456", "road-pilot", "road.pilot", "röad", "road pilot"]) {
      assert.equal(usernameSchema.safeParse(value).success, false, value);
    }
    assert.equal(normalizeUsername("  RoadPilot  "), "roadpilot");
  });

  test("enforces one-time claims and case-insensitive reservations in the database", async () => {
    const migration = await source("supabase/migrations/20260910105218_social_username_foundation.sql");
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_normalized_unique/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.claim_own_username/);
    assert.match(migration, /CREATE TRIGGER profiles_guard_username_change/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.username_reservations/);
    assert.match(migration, /ON DELETE SET NULL/);
  });

  test("gates pending accounts and removes generic username editing", async () => {
    const [middleware, profileApi, webProfile, techProfile, orgProfile, mobileProfile] = await Promise.all([
      source("src/middleware.ts"),
      source("src/app/api/profiles/me/route.ts"),
      source("src/app/(dashboard)/dashboard/profile/page.tsx"),
      source("src/app/(tech)/tech/profile/page.tsx"),
      source("src/app/(org)/org/profile/page.tsx"),
      source("mobile-app/PerfectPPI/Features/Profile/ProfileView.swift"),
    ]);
    assert.match(middleware, /username_required/);
    assert.match(middleware, /USERNAME_PENDING_ROUTES/);
    assert.doesNotMatch(profileApi, /username:\s*z\./);
    assert.match(webProfile, /Usernames cannot be changed yet/);
    assert.doesNotMatch(techProfile, /name="username"/);
    assert.doesNotMatch(orgProfile, /name="username"/);
    assert.match(mobileProfile, /Usernames cannot be changed yet/);
  });

  test("requires a completed viewer and returns a redacted Community feed", async () => {
    const [queries, route, migration] = await Promise.all([
      source("src/features/community/queries.ts"),
      source("src/app/api/community/posts/route.ts"),
      source("supabase/migrations/20260910112116_community_viewer_aware_reads.sql"),
    ]);
    assert.match(route, /requireApiRole/);
    assert.match(queries, /COMMUNITY_FEED_SELECT/);
    assert.match(queries, /hasCommunityViewer/);
    assert.doesNotMatch(
      queries.match(/const COMMUNITY_FEED_SELECT = `[\s\S]*?`;/)?.[0] ?? "",
      /\bvin\b|moderation_reason|organization_id/,
    );
    assert.match(migration, /REVOKE SELECT ON public\.community_posts FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /TO authenticated/);
  });
});
