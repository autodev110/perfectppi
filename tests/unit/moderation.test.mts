import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { classifyModerationProviderResult } from "../../src/lib/moderation/openai.ts";
import { publicStatusForDecision, statusForDecision } from "../../src/lib/moderation/types.ts";

function providerResult(categories: Record<string, boolean>, scores: Record<string, number>) {
  return {
    flagged: Object.values(categories).some(Boolean),
    categories,
    category_scores: scores,
  };
}

describe("moderation policy", () => {
  test("allows a clean provider result", () => {
    assert.deepEqual(classifyModerationProviderResult(providerResult(
      { harassment: false, "sexual/minors": false },
      { harassment: 0.01, "sexual/minors": 0 },
    )), { decision: "allow", riskLevel: "none", reasonCodes: [] });
  });

  test("locks suspected sexual content involving minors", () => {
    const result = classifyModerationProviderResult(providerResult(
      { "sexual/minors": true },
      { "sexual/minors": 0.92 },
    ));
    assert.equal(result.decision, "legal_hold");
    assert.equal(result.riskLevel, "critical");
  });

  test("routes uncertain flags to review and severe high-confidence flags to block", () => {
    assert.equal(classifyModerationProviderResult(providerResult(
      { harassment: true }, { harassment: 0.5 },
    )).decision, "review");
    assert.equal(classifyModerationProviderResult(providerResult(
      { "violence/graphic": true }, { "violence/graphic": 0.91 },
    )).decision, "block");
  });

  test("only approved decisions become public", () => {
    assert.equal(statusForDecision("allow"), "active");
    assert.equal(statusForDecision("review"), "pending_review");
    assert.equal(publicStatusForDecision("allow"), "active");
    assert.equal(publicStatusForDecision("block"), "hidden");
  });
});
