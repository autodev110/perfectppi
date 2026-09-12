import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = new URL("../../", import.meta.url);
const migration = await readFile(
  new URL("supabase/migrations/20260912220000_member_contribution_reputation.sql", root),
  "utf8",
);
const service = await readFile(new URL("src/features/profiles/reputation.ts", root), "utf8");
const strangerPreview = await readFile(new URL("src/lib/social/stranger-preview.ts", root), "utf8");

describe("transparent member contribution reputation (plan 26.1 / Phase 3)", () => {
  test("counts only active, moderated, viewer-visible technical answers", () => {
    assert.match(migration, /comment\.status = 'active'/);
    assert.match(migration, /comment\.moderation_status = 'active'/);
    assert.match(migration, /post\.status = 'active'/);
    assert.match(migration, /post\.moderation_status = 'active'/);
    assert.match(migration, /post\.group_status = 'active'/);
    assert.match(migration, /social_can_view_community_post\([\s\S]*p_viewer_profile_id/);
  });

  test("derives accepted, helpful and outcome facts without an opaque score or rank", () => {
    const executableSql = migration.replace(/--.*$/gm, "");
    assert.match(migration, /acceptedAnswers/);
    assert.match(migration, /helpfulMarks/);
    assert.match(migration, /fixedIssues/);
    assert.match(migration, /helpedIssues/);
    assert.doesNotMatch(executableSql, /reputation_score|leaderboard|rank_position/i);
    assert.doesNotMatch(service, /weighted|points|score|rank/i);
  });

  test("keeps the viewer-aware function service-routed", () => {
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.member_contribution_summary\(uuid, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.member_contribution_summary\(uuid, uuid\)[\s\S]*TO service_role/);
    assert.match(migration, /social_can_view_profile\(p_viewer_profile_id, p_target_profile_id\)/);
  });

  test("does not reuse owner-visible contribution totals in stranger preview", () => {
    assert.match(strangerPreview, /contributions: null/);
  });
});
