import { createHash } from "node:crypto";

/** Paired funnel events share an opaque entity reference, never a raw ID. */
export function productEventDedupeHash(eventName: string, dedupeId?: string): string | null {
  if (!dedupeId) return null;
  const namespace = ["group_detail_viewed", "group_joined"].includes(eventName)
    ? "group-funnel"
    : ["media_upload_reserved", "media_upload_attached"].includes(eventName)
      ? "upload-funnel"
      : eventName;
  return createHash("sha256").update(`${namespace}:${dedupeId}`).digest("hex");
}
