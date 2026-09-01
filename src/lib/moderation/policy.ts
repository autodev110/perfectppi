import { moderateImageWithProvider, moderateTextWithProvider } from "./gemini";
import type { ModerationResult } from "./types";

const POLICY_VERSION = "perfectppi-moderation-v1";

function nativeTextReview(text: string): string[] {
  const reasons: string[] = [];
  const links = text.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links > 4) reasons.push("excessive_links");
  if (/(.)\1{11,}/u.test(text)) reasons.push("repeated_characters");
  if (text.length > 80 && new Set(text.toLowerCase().split(/\s+/)).size < 5) {
    reasons.push("repetitive_spam");
  }
  return reasons;
}

function providerUnavailable(error: unknown): ModerationResult {
  return {
    decision: "review",
    riskLevel: "medium",
    reasonCodes: ["classifier_unavailable"],
    provider: "native_rules",
    modelName: null,
    modelVersion: POLICY_VERSION,
    rawResult: { error: error instanceof Error ? error.message : "Unknown classifier error" },
  };
}

export async function moderateText(text: string): Promise<ModerationResult> {
  const nativeReasons = nativeTextReview(text);
  let provider: ModerationResult;
  try {
    provider = await moderateTextWithProvider(text);
  } catch (error) {
    provider = providerUnavailable(error);
  }

  if (nativeReasons.length === 0 || provider.decision !== "allow") return provider;
  return {
    decision: "review",
    riskLevel: "medium",
    reasonCodes: nativeReasons,
    provider: "native_rules",
    modelName: null,
    modelVersion: POLICY_VERSION,
    rawResult: { nativeReasons },
  };
}

export async function moderateImage(bytes: Uint8Array, contentType: string): Promise<ModerationResult> {
  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(contentType)) {
    return {
      decision: "review",
      riskLevel: "medium",
      reasonCodes: ["manual_format_review"],
      provider: "native_rules",
      modelName: null,
      modelVersion: POLICY_VERSION,
      rawResult: { contentType },
    };
  }

  try {
    return await moderateImageWithProvider(bytes, contentType);
  } catch (error) {
    return providerUnavailable(error);
  }
}

export function moderateVideo(): ModerationResult {
  return {
    decision: "review",
    riskLevel: "medium",
    reasonCodes: ["video_manual_review"],
    provider: "native_rules",
    modelName: null,
    modelVersion: POLICY_VERSION,
    rawResult: { reason: "Video frame moderation is not enabled in the MVP" },
  };
}
