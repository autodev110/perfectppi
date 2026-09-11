import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  COMMUNITY_RATE_LIMIT_WINDOW_MS,
  communityRateLimitMessage,
  countableCommunityPostActivity,
  evaluateCommunityRateLimit,
} from "../../src/lib/moderation/rate-limit.ts";

describe("community publishing rate limits", () => {
  const now = Date.parse("2026-09-11T12:00:00.000Z");
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  test("allows activity below the rolling limit", () => {
    assert.deepEqual(
      evaluateCommunityRateLimit([ago(1), ago(2), ago(3), ago(4)], 5, now),
      { limited: false, retryAfterSeconds: 0 },
    );
  });

  test("unfinished photo drafts do not consume post slots", () => {
    const countable = countableCommunityPostActivity([
      { id: "published-1", createdAt: ago(1), assemblyState: "finalized" },
      { id: "text-1", createdAt: ago(2), assemblyState: null },
      { id: "failed-upload-1", createdAt: ago(3), assemblyState: "assembling" },
      { id: "failed-upload-2", createdAt: ago(4), assemblyState: "assembling" },
      { id: "failed-upload-3", createdAt: ago(5), assemblyState: "assembling" },
    ]);
    assert.equal(evaluateCommunityRateLimit(countable, 5, now).limited, false);
  });

  test("returns the wait until the limiting accepted activity expires", () => {
    assert.deepEqual(
      evaluateCommunityRateLimit([ago(1), ago(2), ago(3), ago(4), ago(8)], 5, now),
      { limited: true, retryAfterSeconds: 120 },
    );
    assert.equal(
      communityRateLimitMessage("post", 120),
      "You're posting too quickly. Try again in about 2 minutes.",
    );
  });

  test("ignores expired and malformed activity", () => {
    const result = evaluateCommunityRateLimit(
      [ago(1), ago(2), ago(3), ago(4), ago(11), "not-a-date"],
      5,
      now,
    );
    assert.equal(result.limited, false);
    assert.equal(COMMUNITY_RATE_LIMIT_WINDOW_MS, 600_000);
  });
});
