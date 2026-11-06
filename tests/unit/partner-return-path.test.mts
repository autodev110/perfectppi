import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { legalAcceptPath, safeReturnPath } from "../../src/features/auth/routing.ts";

describe("the path to return to after signing in", () => {
  test("keeps a connect link with a long encoded shop name", () => {
    const shop = encodeURIComponent("მ".repeat(80));
    const path = `/connect/shopowl?state=${"a".repeat(43)}&code_challenge=${"b".repeat(43)}&shop=${shop}`;
    assert.ok(path.length > 500);
    assert.equal(safeReturnPath(path), path);
  });

  test("refuses anything that could leave this site", () => {
    for (const bad of ["https://example.com", "//example.com", "/\\example.com", "/\t/example.com", "/\n/example.com", "/x\u007f", "", null, undefined, 42, "x".repeat(10)]) {
      assert.equal(safeReturnPath(bad), null, String(bad));
    }
  });

  test("refuses a path too long to be a real link", () => {
    assert.equal(safeReturnPath(`/${"a".repeat(2048)}`), null);
  });

  test("sends every return path through terms first", () => {
    assert.equal(legalAcceptPath(null), "/legal/accept");
    assert.equal(legalAcceptPath("/connect/shopowl?state=a"), "/legal/accept?next=%2Fconnect%2Fshopowl%3Fstate%3Da");
    assert.equal(legalAcceptPath("/legal/accept?next=%2Fx"), "/legal/accept?next=%2Fx");
  });
});
