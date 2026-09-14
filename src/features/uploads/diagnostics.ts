// Structured upload logging for the deployment log stream. Follows the same
// discipline as operations/telemetry: outcome metadata only — never file
// names, object keys, user identifiers, or URLs.

export type UploadLogEvent = {
  source: "client" | "server";
  entity: string;
  stage: "preparing" | "uploading" | "processing" | "done" | "failed" | "presign" | "direct" | "attach";
  outcome: "failed" | "fallback" | "refused";
  status?: number;
  contentType?: string;
  sizeBytes?: number;
  durationMs?: number;
  browser?: string;
  online?: boolean;
  message?: string;
  reason?: string;
};

export function sizeBucket(bytes: number | undefined): string {
  if (bytes === undefined) return "unknown";
  if (bytes < 500_000) return "<0.5MB";
  if (bytes < 1_500_000) return "0.5–1.5MB";
  if (bytes < 4_500_000) return "1.5–4.5MB";
  if (bytes < 10_000_000) return "4.5–10MB";
  return ">10MB";
}

export function logUploadEvent(event: UploadLogEvent) {
  console.error("upload event", {
    event: `upload_${event.outcome}`,
    source: event.source,
    entity: event.entity,
    stage: event.stage,
    status: event.status,
    contentType: event.contentType,
    size: sizeBucket(event.sizeBytes),
    durationMs: event.durationMs,
    browser: event.browser,
    online: event.online,
    reason: event.reason,
    message: event.message,
    at: new Date().toISOString(),
  });
}

/** Browser family from a User-Agent header, for server-side refusals. */
export function browserFamily(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const platform = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : /Macintosh/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : "other";
  const engine = /CriOS|Chrome\//.test(ua) ? "chrome" : /FxiOS|Firefox\//.test(ua) ? "firefox" : /Safari\//.test(ua) ? "safari" : "other";
  return `${platform}/${engine}`;
}
