import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const { allowedJoinPolicies, isAllowedGroupPolicy, GROUP_VISIBILITIES, GROUP_JOIN_POLICIES } =
  await import("../../src/lib/social/group-options.ts");

describe("group visibility / join policy table (plan 13.3)", () => {
  test("commits private-group enum values before the schema uses them", async () => {
    const [enumMigration, schemaMigration] = await Promise.all([
      readFile(new URL("../../supabase/migrations/20260911165000_private_group_enum_values.sql", import.meta.url), "utf8"),
      readFile(new URL("../../supabase/migrations/20260911170000_private_groups_requests_invitations.sql", import.meta.url), "utf8"),
    ]);

    for (const value of ["requested", "invited", "group_invitation", "group_join_request", "group_join_decision"]) {
      assert.match(enumMigration, new RegExp(`ADD VALUE IF NOT EXISTS '${value}'`));
    }
    assert.doesNotMatch(schemaMigration, /ALTER TYPE[\s\S]*ADD VALUE/);
  });

  test("public groups may use any join policy", () => {
    assert.deepEqual([...allowedJoinPolicies("public")], [...GROUP_JOIN_POLICIES]);
  });

  test("private and unlisted groups never open instantly", () => {
    for (const visibility of ["private", "unlisted"] as const) {
      assert.deepEqual([...allowedJoinPolicies(visibility)], ["request_approval", "invite_only"]);
      assert.equal(isAllowedGroupPolicy(visibility, "open"), false);
      assert.equal(isAllowedGroupPolicy(visibility, "request_approval"), true);
    }
  });

  test("every visibility has at least one policy so the form can always submit", () => {
    for (const visibility of GROUP_VISIBILITIES) {
      assert.ok(allowedJoinPolicies(visibility).length > 0);
    }
  });
});
