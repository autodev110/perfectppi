import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { listingManageActions, isListingPublic, LISTING_ACTION_STATUS, listingLifecycleMessage } =
  await import("../../src/lib/marketplace/listing-status.ts");

describe("listing lifecycle (plan 25.2)", () => {
  test("pending stays public; everything else is hidden", () => {
    assert.equal(isListingPublic("active"), true);
    assert.equal(isListingPublic("pending"), true);
    for (const status of ["paused", "sold", "archived", "removed"] as const) assert.equal(isListingPublic(status), false);
  });

  test("owner actions follow the state machine; removed is terminal", () => {
    assert.deepEqual(listingManageActions("active"), ["mark_pending", "pause", "mark_sold", "remove"]);
    assert.deepEqual(listingManageActions("pending"), ["resume", "pause", "mark_sold", "remove"]);
    assert.deepEqual(listingManageActions("sold"), ["resume", "remove"]);
    assert.deepEqual(listingManageActions("archived"), listingManageActions("paused"));
    assert.deepEqual(listingManageActions("removed"), []);
    assert.equal(LISTING_ACTION_STATUS.resume, "active");
    assert.equal(LISTING_ACTION_STATUS.mark_pending, "pending");
  });

  test("lifecycle codes map to plain explanations", () => {
    assert.match(listingLifecycleMessage("listing_removed"), /removed/);
    assert.match(listingLifecycleMessage("listing_sold"), /relisted/);
    assert.match(listingLifecycleMessage("something_else"), /try again/);
  });
});
