import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { enforcementNotice, durationLabel, blocksAccountAccess, policyLabel } = await import("../../src/lib/moderation/enforcement-notice.ts");

const now = new Date("2026-09-15T12:00:00Z");

describe("account enforcement notice (plan 17.4 / 18.6)", () => {
  test("explains the most severe active action with policy and duration, nothing about reporters", () => {
    const notice = enforcementNotice([
      { id: "w", action_type: "warning", reason_code: "spam", starts_at: "2026-09-01T00:00:00Z", ends_at: null },
      { id: "s", action_type: "suspension", reason_code: "harassment", starts_at: "2026-09-14T00:00:00Z", ends_at: "2026-09-20T00:00:00Z" },
    ], now);
    assert.ok(notice);
    assert.equal(notice.title, "Your account is suspended");
    assert.match(notice.body, /harassment or bullying/);
    assert.match(notice.body, /for 5 more days/);
    assert.doesNotMatch(notice.body + notice.stillAvailable + notice.nextStep, /report(ed|er)/i);
    assert.match(notice.nextStep, /contact support/);
  });

  test("expired and future actions are ignored", () => {
    assert.equal(enforcementNotice([
      { id: "old", action_type: "ban", reason_code: "hate", starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-02-01T00:00:00Z" },
      { id: "future", action_type: "suspension", reason_code: "hate", starts_at: "2026-12-01T00:00:00Z", ends_at: null },
    ], now), null);
  });

  test("durations read plainly", () => {
    assert.equal(durationLabel({ action_type: "ban", ends_at: null }, now), "permanently");
    assert.equal(durationLabel({ action_type: "suspension", ends_at: null }, now), "until further notice");
    assert.equal(durationLabel({ action_type: "suspension", ends_at: "2026-09-16T12:00:00Z" }, now), "until tomorrow (Sep 16, 2026)");
    assert.equal(durationLabel({ action_type: "suspension", ends_at: "2026-11-01T00:00:00Z" }, now), "until Nov 1, 2026");
  });

  test("only suspension and ban close the product; unknown reasons fall back to the Guidelines", () => {
    assert.equal(blocksAccountAccess("suspension"), true);
    assert.equal(blocksAccountAccess("ban"), true);
    assert.equal(blocksAccountAccess("temporary_posting_hold"), false);
    assert.equal(policyLabel("made_up"), "Community Guidelines");
  });
});
