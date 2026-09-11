import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { allowedJoinPolicies, isAllowedGroupPolicy, GROUP_VISIBILITIES, GROUP_JOIN_POLICIES } =
  await import("../../src/lib/social/group-options.ts");

describe("group visibility / join policy table (plan 13.3)", () => {
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
