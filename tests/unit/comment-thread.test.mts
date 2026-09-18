import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { projectCommentThread } = await import("../../src/lib/community/comment-thread.ts");

type C = { id: string; parent_comment_id: string | null; status: string; moderation_status: string; created_at: string };
const live = (id: string, at: string, parent: string | null = null): C =>
  ({ id, parent_comment_id: parent, status: "active", moderation_status: "active", created_at: at });

describe("comment thread projection (plan 15.1)", () => {
  test("replies follow their parent, oldest first, one level deep", () => {
    const thread = projectCommentThread([
      live("b", "2026-09-18T10:02:00Z"),
      live("b1", "2026-09-18T10:05:00Z", "b"),
      live("a", "2026-09-18T10:01:00Z"),
      live("a2", "2026-09-18T10:06:00Z", "a"),
      live("a1", "2026-09-18T10:03:00Z", "a"),
    ]);
    assert.deepEqual(thread.map((c) => c.id), ["a", "a1", "a2", "b", "b1"]);
    assert.ok(thread.every((c) => !c.removed));
  });

  test("a removed parent with live replies becomes a placeholder; without replies it is omitted", () => {
    const thread = projectCommentThread([
      { ...live("gone", "2026-09-18T10:00:00Z"), status: "archived" },
      live("reply", "2026-09-18T10:01:00Z", "gone"),
      { ...live("lonely", "2026-09-18T10:02:00Z"), status: "archived" },
    ]);
    assert.deepEqual(thread.map((c) => [c.id, c.removed]), [["gone", true], ["reply", false]]);
  });

  test("a moderated parent reads the same as an author-removed one", () => {
    const thread = projectCommentThread([
      { ...live("hidden", "2026-09-18T10:00:00Z"), status: "hidden", moderation_status: "rejected" },
      live("reply", "2026-09-18T10:01:00Z", "hidden"),
    ]);
    assert.deepEqual(thread.map((c) => [c.id, c.removed]), [["hidden", true], ["reply", false]]);
  });

  test("a hidden reply never surfaces, and a placeholder is not kept for it", () => {
    const thread = projectCommentThread([
      { ...live("parent", "2026-09-18T10:00:00Z"), status: "archived" },
      { ...live("reply", "2026-09-18T10:01:00Z", "parent"), status: "hidden" },
    ]);
    assert.deepEqual(thread, []);
  });

  test("a reply whose parent is absent renders flat as top-level", () => {
    const thread = projectCommentThread([
      live("orphan", "2026-09-18T10:01:00Z", "purged"),
      live("top", "2026-09-18T10:00:00Z"),
    ]);
    assert.deepEqual(thread.map((c) => c.id), ["top", "orphan"]);
  });
});
