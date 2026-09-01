import { createHash } from "node:crypto";
import { z } from "zod";
import type { ModerationResult } from "./types";

const VERSION = "perfectppi-specialist-scan-v1";
const responseSchema = z.object({
  verdict: z.enum(["clean", "match", "review"]),
  provider: z.string().trim().min(1).max(100),
  reference: z.string().trim().min(1).max(500).optional(),
}).strict();

function heldResult(reason: string, rawResult: Record<string, unknown>): ModerationResult {
  return {
    decision: "review",
    riskLevel: "medium",
    reasonCodes: [reason],
    provider: "specialist_gateway",
    modelName: "illegal-content-hash-matching",
    modelVersion: VERSION,
    rawResult,
  };
}

/**
 * Calls the configured child-safety scanner through a small provider-neutral
 * gateway. Content is never published unless the gateway explicitly returns
 * `clean`; missing configuration, errors, and uncertain results stay private.
 */
export async function scanForKnownIllegalContent(
  bytes: Uint8Array,
  contentType: string,
): Promise<ModerationResult> {
  const endpoint = process.env.CHILD_SAFETY_SCANNER_URL;
  const token = process.env.CHILD_SAFETY_SCANNER_TOKEN;
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  if (!endpoint || !token) {
    return heldResult("specialist_scan_not_configured", { configured: false, sha256 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contentBase64: Buffer.from(bytes).toString("base64"),
        contentType,
        sha256,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Specialist scanner returned HTTP ${response.status}`);
    }

    const parsed = responseSchema.parse(await response.json());
    const rawResult = {
      verdict: parsed.verdict,
      provider: parsed.provider,
      reference: parsed.reference ?? null,
      sha256,
    };

    if (parsed.verdict === "match") {
      return {
        decision: "legal_hold",
        riskLevel: "critical",
        reasonCodes: ["known_illegal_content_match"],
        provider: parsed.provider,
        modelName: "illegal-content-hash-matching",
        modelVersion: VERSION,
        rawResult,
      };
    }
    if (parsed.verdict === "review") {
      return heldResult("specialist_scan_review", rawResult);
    }
    return {
      decision: "allow",
      riskLevel: "none",
      reasonCodes: [],
      provider: parsed.provider,
      modelName: "illegal-content-hash-matching",
      modelVersion: VERSION,
      rawResult,
    };
  } finally {
    clearTimeout(timeout);
  }
}
