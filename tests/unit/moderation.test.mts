import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyModerationProviderResult,
  moderateTextWithProvider,
} from "../../src/lib/moderation/gemini.ts";
import { scanForKnownIllegalContent } from "../../src/lib/moderation/child-safety.ts";
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

  test("manual media approval requires a clean specialist scan", async () => {
    const actions = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../../src/features/moderation/actions.ts", import.meta.url), "utf8"));
    assert.ok(actions.includes("hasCleanSpecialistScan(item.raw_result)"));
    assert.ok(actions.includes("Media cannot be approved until the specialist safety scan passes"));
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

  test("fails closed when the specialist media scanner is not configured", async () => {
    const endpoint = process.env.CHILD_SAFETY_SCANNER_URL;
    const token = process.env.CHILD_SAFETY_SCANNER_TOKEN;
    delete process.env.CHILD_SAFETY_SCANNER_URL;
    delete process.env.CHILD_SAFETY_SCANNER_TOKEN;

    try {
      const result = await scanForKnownIllegalContent(new Uint8Array([1, 2, 3]), "image/jpeg");
      assert.equal(result.decision, "review");
      assert.deepEqual(result.reasonCodes, ["specialist_scan_not_configured"]);
    } finally {
      if (endpoint) process.env.CHILD_SAFETY_SCANNER_URL = endpoint;
      if (token) process.env.CHILD_SAFETY_SCANNER_TOKEN = token;
    }
  });

  test("never sends media or credentials to an insecure specialist scanner", async () => {
    const endpoint = process.env.CHILD_SAFETY_SCANNER_URL;
    const token = process.env.CHILD_SAFETY_SCANNER_TOKEN;
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    process.env.CHILD_SAFETY_SCANNER_URL = "http://scanner.example.test/scan";
    process.env.CHILD_SAFETY_SCANNER_TOKEN = "test-token";
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch must not be called");
    };

    try {
      await assert.rejects(
        scanForKnownIllegalContent(new Uint8Array([1, 2, 3]), "image/jpeg"),
        /must use HTTPS/,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
      if (endpoint) process.env.CHILD_SAFETY_SCANNER_URL = endpoint;
      else delete process.env.CHILD_SAFETY_SCANNER_URL;
      if (token) process.env.CHILD_SAFETY_SCANNER_TOKEN = token;
      else delete process.env.CHILD_SAFETY_SCANNER_TOKEN;
    }
  });

  test("places a specialist hash match on legal hold", async () => {
    const endpoint = process.env.CHILD_SAFETY_SCANNER_URL;
    const token = process.env.CHILD_SAFETY_SCANNER_TOKEN;
    const originalFetch = globalThis.fetch;
    process.env.CHILD_SAFETY_SCANNER_URL = "https://scanner.example.test/scan";
    process.env.CHILD_SAFETY_SCANNER_TOKEN = "test-token";
    globalThis.fetch = async () => new Response(JSON.stringify({
      verdict: "match",
      provider: "specialist-test",
      reference: "case-123",
    }), { status: 200, headers: { "Content-Type": "application/json" } });

    try {
      const result = await scanForKnownIllegalContent(new Uint8Array([1, 2, 3]), "image/jpeg");
      assert.equal(result.decision, "legal_hold");
      assert.equal(result.riskLevel, "critical");
      assert.deepEqual(result.reasonCodes, ["known_illegal_content_match"]);
    } finally {
      globalThis.fetch = originalFetch;
      if (endpoint) process.env.CHILD_SAFETY_SCANNER_URL = endpoint;
      else delete process.env.CHILD_SAFETY_SCANNER_URL;
      if (token) process.env.CHILD_SAFETY_SCANNER_TOKEN = token;
      else delete process.env.CHILD_SAFETY_SCANNER_TOKEN;
    }
  });

  test("preserves a clean specialist result when image classification fails", async () => {
    const policy = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../../src/lib/moderation/policy.ts", import.meta.url), "utf8"));
    const fallbackStart = policy.indexOf("const unavailable = providerUnavailable(error)");
    assert.notEqual(fallbackStart, -1);
    assert.ok(policy.slice(fallbackStart).includes("specialistScan: specialist.rawResult"));
  });
});
