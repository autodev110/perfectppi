import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyModerationProviderResult,
  moderateTextWithProvider,
} from "../../src/lib/moderation/gemini.ts";
import type { GeminiModerationProviderResult } from "../../src/lib/moderation/gemini.ts";
import { publicStatusForDecision, statusForDecision } from "../../src/lib/moderation/types.ts";

function providerResult(categories: GeminiModerationProviderResult["categories"]): GeminiModerationProviderResult {
  return { categories };
}

describe("moderation policy", () => {
  test("allows a clean provider result", () => {
    assert.deepEqual(classifyModerationProviderResult(providerResult([])), {
      decision: "allow", riskLevel: "none", reasonCodes: [],
    });
  });

  test("locks suspected sexual content involving minors", () => {
    const result = classifyModerationProviderResult(providerResult([
      { category: "child_sexual_abuse", confidence: "medium" },
    ]));
    assert.equal(result.decision, "legal_hold");
    assert.equal(result.riskLevel, "critical");
  });

  test("holds sexually flagged images for restricted age review", () => {
    const result = classifyModerationProviderResult(providerResult([
      { category: "sexual_content", confidence: "medium" },
    ]), "image");
    assert.equal(result.decision, "legal_hold");
    assert.deepEqual(result.reasonCodes, ["sexual_image_age_unknown"]);
  });

  test("routes uncertain flags to review and severe high-confidence flags to block", () => {
    assert.equal(classifyModerationProviderResult(providerResult([
      { category: "harassment", confidence: "medium" },
    ])).decision, "review");
    assert.equal(classifyModerationProviderResult(providerResult([
      { category: "graphic_violence", confidence: "high" },
    ])).decision, "block");
  });

  test("deduplicates categories and keeps the strongest confidence", () => {
    const result = classifyModerationProviderResult(providerResult([
      { category: "fraud_or_scam", confidence: "low" },
      { category: "fraud_or_scam", confidence: "high" },
    ]));
    assert.equal(result.decision, "block");
    assert.deepEqual(result.reasonCodes, ["fraud_or_scam"]);
  });

  test("locks non-consensual intimate content for restricted review", () => {
    const result = classifyModerationProviderResult(providerResult([
      { category: "non_consensual_intimate_content", confidence: "low" },
    ]));
    assert.equal(result.decision, "legal_hold");
    assert.equal(result.riskLevel, "critical");
  });

  test("only approved decisions become public", () => {
    assert.equal(statusForDecision("allow"), "active");
    assert.equal(statusForDecision("review"), "pending_review");
    assert.equal(publicStatusForDecision("allow"), "active");
    assert.equal(publicStatusForDecision("block"), "hidden");
  });

  test("fails closed when Gemini is not configured", async () => {
    const perfectPpiKey = process.env.GEMINI_PERFECTPPI;
    const fallbackKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_PERFECTPPI;
    delete process.env.GEMINI_API_KEY;

    try {
      const result = await moderateTextWithProvider("ordinary vehicle discussion");
      assert.equal(result.decision, "review");
      assert.deepEqual(result.reasonCodes, ["classifier_unavailable"]);
    } finally {
      if (perfectPpiKey) process.env.GEMINI_PERFECTPPI = perfectPpiKey;
      if (fallbackKey) process.env.GEMINI_API_KEY = fallbackKey;
    }
  });
});
