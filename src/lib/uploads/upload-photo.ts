// One upload pipeline for photos from the browser (Renditions doc, "Mobile
// Photo Upload Reliability"): prepare on the device → presigned PUT with
// progress → server fallback with progress → typed failures the UI can act
// on. Every failure is also reported to the diagnostics endpoint so
// iPhone-Safari-only problems show up in the logs with browser, type, size,
// stage, and status — never the photo or its name.
// Relative so the node test runner can load this module without path aliases.
import { prepareImageForUpload, uploadFailureMessage } from "./prepare-image.ts";

export type UploadEntity = "ppi_media" | "vehicle_media";
export type UploadStage = "preparing" | "uploading" | "processing" | "done" | "failed";
export type UploadProgress = { stage: UploadStage; percent: number };

export class UploadError extends Error {
  readonly stage: UploadStage;
  readonly status: number | undefined;
  /** false when retrying the same file cannot succeed (too large, wrong type, no permission). */
  readonly retryable: boolean;

  constructor(message: string, stage: UploadStage, status?: number, retryable = true) {
    super(message);
    this.name = "UploadError";
    this.stage = stage;
    this.status = status;
    this.retryable = retryable;
  }
}

export const UPLOAD_HINT = "JPEG, PNG, or HEIC up to 10 MB. Large photos are resized on your device before upload.";

const NON_RETRYABLE_STATUSES = new Set([400, 403, 404, 413, 415]);

/** Whether retrying the same file after this HTTP status can succeed. */
export function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || !NON_RETRYABLE_STATUSES.has(status);
}

function browserSummary(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const platform = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : /Macintosh/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : "other";
  const engine = /CriOS|Chrome\//.test(ua) ? "chrome" : /FxiOS|Firefox\//.test(ua) ? "firefox" : /Safari\//.test(ua) ? "safari" : "other";
  return `${platform}/${engine}`;
}

/** Fire-and-forget; never throws, never blocks the user. */
export function reportUploadDiagnostic(input: {
  entity: UploadEntity;
  stage: UploadStage;
  outcome: "failed" | "fallback";
  status?: number;
  contentType: string;
  sizeBytes: number;
  durationMs: number;
  message?: string;
}) {
  if (typeof fetch !== "function") return;
  try {
    const body = JSON.stringify({
      ...input,
      browser: browserSummary(),
      online: typeof navigator === "undefined" ? undefined : navigator.onLine,
      message: input.message?.slice(0, 200),
    });
    void fetch("/api/uploads/diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Diagnostics must never affect the upload itself.
  }
}

/** PUT/POST with upload progress; resolves with status and body text. */
function send(
  method: "PUT" | "POST",
  url: string,
  body: XMLHttpRequestBodyInit,
  headers: Record<string, string>,
  onPercent: (percent: number) => void,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = timeoutMs;
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onPercent(Math.round((event.loaded / Math.max(event.total, 1)) * 100));
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new UploadError("The network connection was interrupted while uploading.", "uploading"));
    xhr.ontimeout = () => reject(new UploadError("The upload timed out. Check your connection and try again.", "uploading"));
    xhr.onabort = () => reject(new UploadError("The upload was cancelled.", "uploading", undefined, true));
    xhr.send(body);
  });
}

async function messageFor(status: number, text: string, fallback: string): Promise<string> {
  return uploadFailureMessage(new Response(text, { status: status || 500 }), fallback);
}

/**
 * Uploads one photo and returns the storage reference to attach. Throws
 * `UploadError` with the stage it failed in and whether a retry can help.
 */
export async function uploadPhoto(input: {
  file: File;
  entity: UploadEntity;
  recordId: string;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<{ publicUrl: string; file: File }> {
  const startedAt = Date.now();
  const progress = (stage: UploadStage, percent: number) => input.onProgress?.({ stage, percent });
  const fail = (error: UploadError, contentType: string, size: number): never => {
    reportUploadDiagnostic({
      entity: input.entity, stage: error.stage, outcome: "failed", status: error.status,
      contentType, sizeBytes: size, durationMs: Date.now() - startedAt, message: error.message,
    });
    throw error;
  };

  progress("preparing", 0);
  const file = await prepareImageForUpload(input.file);
  const contentType = file.type || "application/octet-stream";

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    fail(new UploadError("You appear to be offline. Reconnect and tap Retry.", "uploading"), contentType, file.size);
  }

  const uploadViaServer = async (): Promise<string> => {
    const form = new FormData();
    form.append("file", file);
    form.append("entity", input.entity);
    form.append("recordId", input.recordId);
    progress("uploading", 0);
    const result = await send("POST", "/api/upload/direct", form, {}, (percent) => progress("uploading", percent), 120_000);
    if (result.status < 200 || result.status >= 300) {
      throw new UploadError(await messageFor(result.status, result.text, "Photo upload failed."), "uploading", result.status, isRetryableStatus(result.status));
    }
    const payload = JSON.parse(result.text) as { publicUrl?: string };
    if (!payload.publicUrl) throw new UploadError("The upload service returned an unexpected response.", "uploading", result.status);
    return payload.publicUrl;
  };

  try {
    const presignRes = await fetch("/api/upload/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType, size: file.size, entity: input.entity, recordId: input.recordId }),
    });

    let publicUrl: string;
    if (presignRes.ok) {
      const presigned = (await presignRes.json()) as {
        uploadUrl?: string;
        publicUrl?: string;
        uploadHeaders?: Record<string, string>;
      };
      if (!presigned.uploadUrl || !presigned.publicUrl) {
        publicUrl = await uploadViaServer();
      } else {
        try {
          progress("uploading", 0);
          const put = await send(
            "PUT",
            presigned.uploadUrl,
            file,
            { "Content-Type": contentType, ...presigned.uploadHeaders },
            (percent) => progress("uploading", percent),
            120_000,
          );
          if (put.status >= 200 && put.status < 300) {
            publicUrl = presigned.publicUrl;
          } else {
            reportUploadDiagnostic({ entity: input.entity, stage: "uploading", outcome: "fallback", status: put.status, contentType, sizeBytes: file.size, durationMs: Date.now() - startedAt });
            publicUrl = await uploadViaServer();
          }
        } catch (error) {
          // Typical when the bucket has no CORS rule for browser PUTs; the
          // server route takes the (now small) file instead.
          if (error instanceof UploadError && error.message.includes("cancelled")) throw error;
          reportUploadDiagnostic({ entity: input.entity, stage: "uploading", outcome: "fallback", contentType, sizeBytes: file.size, durationMs: Date.now() - startedAt, message: error instanceof Error ? error.message : undefined });
          publicUrl = await uploadViaServer();
        }
      }
    } else if (NON_RETRYABLE_STATUSES.has(presignRes.status) || presignRes.status === 401 || presignRes.status === 429) {
      // The server refused this photo, this target, or this session; the
      // fallback would refuse it for the same reason, so surface that now.
      throw new UploadError(await uploadFailureMessage(presignRes), "preparing", presignRes.status, presignRes.status === 429 || presignRes.status === 401);
    } else {
      publicUrl = await uploadViaServer();
    }

    progress("done", 100);
    return { publicUrl, file };
  } catch (error) {
    const wrapped = error instanceof UploadError
      ? error
      : new UploadError(error instanceof Error && error.message ? error.message : "Photo upload failed.", "uploading");
    return fail(wrapped, contentType, file.size);
  }
}
