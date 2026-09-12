import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { notificationDestinationIntent, notificationWebPath, NOTIFICATION_CATEGORY_LABELS, NOTIFICATION_CATEGORIES } =
  await import("../../src/lib/notifications/routing.ts");

describe("notification deep links (plan 22.1)", () => {
  test("social activity opens the post; requests open the friends list", () => {
    assert.deepEqual(notificationDestinationIntent("post_comment", { post_id: "p1", comment_id: "c1" }), {
      kind: "post", id: "p1", secondaryId: "c1",
    });
    assert.equal(notificationDestinationIntent("post_likes", { post_id: "p1" }).kind, "post");
    assert.deepEqual(notificationDestinationIntent("answer_helpful", { post_id: "p1", comment_id: "c2" }), {
      kind: "post", id: "p1", secondaryId: "c2",
    });
    assert.equal(notificationDestinationIntent("post_mention", { post_id: "p1", comment_id: "c1" }).kind, "post");
    assert.equal(notificationDestinationIntent("friend_request", { requester_id: "x" }).kind, "friends");
    assert.deepEqual(notificationDestinationIntent("friend_request_accepted", { username: "Bea" }), {
      kind: "profile", id: "Bea", secondaryId: null,
    });
  });

  test("messages carry the conversation and message id into the web path", () => {
    const intent = notificationDestinationIntent("message_received", { conversation_id: "conv", message_id: "m1" });
    assert.equal(notificationWebPath(intent, "/tech/messages"), "/tech/messages/conv?m=m1");
  });

  test("moderation notices route to owner-only or moderator-only places", () => {
    assert.equal(notificationWebPath(notificationDestinationIntent("moderation_decision", {})), "/dashboard/posts?tab=review");
    assert.equal(notificationWebPath(notificationDestinationIntent("moderation_case", { caseId: "k" })), "/admin/moderation/cases/k");
    // Reporter receipts deliberately have nowhere to go.
    assert.equal(notificationDestinationIntent("report_received", { caseId: "k" }).kind, "none");
    assert.equal(notificationWebPath(notificationDestinationIntent("report_received", { caseId: "k" })), null);
  });

  test("listing notices open the listing screen; inspection requests are not saved-search routes (plan 25.2)", () => {
    const requested = notificationDestinationIntent("listing_inspection_requested", { listing_id: "l1", vehicle_id: "v1", request_id: "r1" });
    assert.deepEqual(requested, { kind: "listing_vehicle", id: "v1", secondaryId: "l1" });
    assert.equal(notificationWebPath(requested), "/marketplace/listings/l1");
    assert.equal(notificationWebPath(notificationDestinationIntent("saved_listing_updated", { vehicle_id: "v1" })), "/vehicle/v1?tab=marketplace");
    assert.equal(notificationWebPath(notificationDestinationIntent("saved_listing_updated", {})), "/dashboard/listings");
  });

  test("saved-search matches open the marketplace with the saved search applied (plan 25.1)", () => {
    const intent = notificationDestinationIntent("saved_search_match", { saved_search_id: "s1", listing_id: "l1", count: 3 });
    assert.deepEqual(intent, { kind: "marketplace_search", id: "s1", secondaryId: "l1" });
    assert.equal(notificationWebPath(intent), "/marketplace?saved=s1");
    assert.equal(notificationWebPath(notificationDestinationIntent("saved_search_match", {})), "/marketplace");
  });

  test("group invitations, requests, and decisions open the group (plan 13.3)", () => {
    for (const type of ["group_invitation", "group_join_request", "group_join_decision", "group_role_changed"]) {
      assert.deepEqual(notificationDestinationIntent(type, { group_slug: "e30-owners", group_id: "g1" }), {
        kind: "group", id: "e30-owners", secondaryId: "g1",
      });
      assert.equal(notificationWebPath(notificationDestinationIntent(type, { group_slug: "e30-owners" })), "/community/groups/e30-owners");
    }
    // A removed post is only reachable from the author's own list.
    assert.equal(notificationWebPath(notificationDestinationIntent("group_post_removed", { group_slug: "x" })), "/dashboard/posts?tab=review");
  });

  test("malformed payloads degrade to a safe destination, never a crash", () => {
    assert.equal(notificationDestinationIntent("post_comment", null).id, null);
    assert.equal(notificationWebPath(notificationDestinationIntent("post_comment", null)), "/community");
    assert.equal(notificationWebPath(notificationDestinationIntent("post_comment", { post_id: "p1" })), "/community/posts/p1");
    assert.equal(notificationDestinationIntent("message_received", { conversation_id: 42 }).id, null);
    assert.equal(notificationDestinationIntent("something_new", {}).kind, "none");
  });

  test("safety and account categories are locked; the rest are optional", () => {
    const locked = NOTIFICATION_CATEGORIES.filter((c) => NOTIFICATION_CATEGORY_LABELS[c].locked);
    assert.deepEqual(locked, ["safety", "account"]);
  });
});
