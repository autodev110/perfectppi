import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { applyStrangerPreview } = await import("../../src/lib/social/stranger-preview.ts");

function dto(overrides: Partial<{ is_public: boolean }> = {}) {
  return {
    profile: { is_public: overrides.is_public ?? true, bio: "Weekend wrench" },
    relationship: {
      state: "self",
      mutual_friend_count: 3,
      friends_enabled: true,
      muted_by_me: false,
      blocked_by_me: false,
      can_view_restricted: true,
    },
    vehicles: [{ id: "v1" }],
    listings: [{ id: "l1" }],
    posts: [
      { id: "p1", audience: "public", group_id: null, report_context: null, can_like: false },
      { id: "p2", audience: "friends", group_id: null, report_context: null, can_like: false },
      { id: "p3", audience: "public", group_id: "g1", report_context: null, can_like: false },
    ],
  };
}

describe("view as stranger (plan 9.3)", () => {
  test("public profile: bio and garage stay, only Public general posts remain", () => {
    const preview = applyStrangerPreview(dto());
    assert.equal(preview.profile.bio, "Weekend wrench");
    assert.equal(preview.vehicles.length, 1);
    assert.equal(preview.listings.length, 1);
    assert.deepEqual(preview.posts.map((post) => post.id), ["p1"]);
    assert.equal(preview.relationship.state, "none");
    assert.equal(preview.relationship.mutual_friend_count, 0);
    assert.equal(preview.relationship.can_view_restricted, false);
  });

  test("private profile: strangers see identity only", () => {
    const preview = applyStrangerPreview(dto({ is_public: false }));
    assert.equal(preview.profile.bio, null);
    assert.deepEqual(preview.vehicles, []);
    assert.deepEqual(preview.listings, []);
    assert.deepEqual(preview.posts, []);
    assert.equal(preview.relationship.state, "none");
  });

  test("does not mutate the input", () => {
    const input = dto();
    applyStrangerPreview(input);
    assert.equal(input.posts.length, 3);
    assert.equal(input.relationship.state, "self");
  });
});
