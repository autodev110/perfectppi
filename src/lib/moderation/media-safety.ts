import type { ModerationResult } from "./types";
import { moderateImage, moderateVideo } from "./policy";

export function hasExpectedMediaSignature(bytes: Uint8Array, contentType: string): boolean {
  if (bytes.byteLength < 12) return false;
  if (contentType === "image/jpeg" || contentType === "image/jpg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  if (["image/heic", "image/heif", "video/mp4", "video/quicktime"].includes(contentType)) {
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  }
  return false;
}

export function blockedMediaResult(
  reason: string,
  decision: "block" | "review" | "legal_hold" = "block",
): ModerationResult {
  return {
    decision,
    riskLevel: decision === "legal_hold" ? "critical" : decision === "block" ? "high" : "medium",
    reasonCodes: [reason],
    provider: "native_rules",
    modelName: null,
    modelVersion: "perfectppi-moderation-v1",
    rawResult: { reason },
  };
}

export async function moderateMediaBytes(
  bytes: Uint8Array,
  contentType: string,
  mediaType: "image" | "video",
): Promise<ModerationResult> {
  if (!hasExpectedMediaSignature(bytes, contentType)) return blockedMediaResult("invalid_media_signature");
  return mediaType === "video"
    ? moderateVideo(bytes, contentType)
    : moderateImage(bytes, contentType);
}

export { extensionForContentType } from "./content-types";
