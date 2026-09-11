import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  communityCreationTokensMatch,
  normalizeCommunityCreationToken,
} from "../../src/features/community/creation-token.ts";

describe("community media assembly creation tokens", () => {
  test("normalizes the uppercase UUID representation produced by iOS", () => {
    const iosToken = "37C40EFF-474F-47B1-ABCD-0123456789AB";
    assert.equal(
      normalizeCommunityCreationToken(iosToken),
      "37c40eff-474f-47b1-abcd-0123456789ab",
    );
  });

  test("matches PostgreSQL and iOS representations without weakening absence checks", () => {
    assert.equal(
      communityCreationTokensMatch(
        "37c40eff-474f-47b1-abcd-0123456789ab",
        "37C40EFF-474F-47B1-ABCD-0123456789AB",
      ),
      true,
    );
    assert.equal(communityCreationTokensMatch(undefined, undefined), false);
  });
});
