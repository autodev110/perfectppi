import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { sharePath, shareUrl, shareCardTitle, NEUTRAL_SHARE_CARD } = await import("../../src/lib/share/links.ts");

describe("permission-aware share links (plan 15.4)", () => {
  test("links are the canonical pages, never tokens", () => {
    assert.equal(sharePath({ kind: "post", id: "abc" }), "/community/posts/abc");
    assert.equal(sharePath({ kind: "profile", username: "Bea Cole" }), "/profile/Bea%20Cole");
    assert.equal(sharePath({ kind: "group", slug: "e30-owners" }), "/community/groups/e30-owners");
    assert.equal(sharePath({ kind: "vehicle", id: "v1" }), "/vehicle/v1");
    assert.equal(sharePath({ kind: "listing", id: "l1" }), "/marketplace/listings/l1");
    assert.equal(shareUrl({ kind: "post", id: "abc" }, "https://www.perfectppi.com"), "https://www.perfectppi.com/community/posts/abc");
  });

  test("card titles carry the label only", () => {
    assert.equal(shareCardTitle({ kind: "post", id: "x" }, "Question by Pat"), "Question by Pat on PerfectPPI Community");
    assert.equal(shareCardTitle({ kind: "group", slug: "x" }, "E30 Owners"), "E30 Owners · PerfectPPI Groups");
    assert.ok(!NEUTRAL_SHARE_CARD.description.includes("private"), "the neutral card must not hint at why");
  });
});
