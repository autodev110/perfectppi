"use client";

import type { UploadEntity } from "./access";

/** Called with 0..1 as bytes go out, so callers can render a real progress bar. */
export type UploadProgress = (fraction: number) => void;

type PresignedUpload = {
  uploadUrl?: string;
  publicUrl?: string;
  error?: string;
};

/**
 * `fetch` gives no upload progress, and a 50MB video otherwise leaves the
 * composer looking frozen — so the body-carrying requests go through XHR.
 */
function sendWithProgress(options: {
  method: string;
  url: string;
  body: XMLHttpRequestBodyInit;
  headers?: Record<string, string>;
  onProgress?: UploadProgress;
}): Promise<{ ok: boolean; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method, options.url);
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      xhr.setRequestHeader(name, value);
    }
    if (options.onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
      });
    }
    xhr.addEventListener("load", () =>
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, text: xhr.responseText }),
    );
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.send(options.body);
  });
}

async function directUpload(
  file: File,
  entity: UploadEntity,
  recordId: string,
  onProgress?: UploadProgress,
) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("entity", entity);
  formData.set("recordId", recordId);

  const response = await sendWithProgress({
    method: "POST",
    url: "/api/upload/direct",
    body: formData,
    onProgress,
  });

  let payload: PresignedUpload = {};
  try {
    payload = JSON.parse(response.text) as PresignedUpload;
  } catch {
    // Fall through to the generic error below.
  }

  if (!response.ok || !payload.publicUrl) {
    throw new Error(payload.error ?? "Upload failed");
  }
  onProgress?.(1);
  return payload.publicUrl;
}

export async function uploadFile(
  file: File,
  entity: UploadEntity,
  recordId: string,
  onProgress?: UploadProgress,
) {
  const presignResponse = await fetch("/api/upload/presigned-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      entity,
      recordId,
    }),
  });

  if (presignResponse.ok) {
    const payload = (await presignResponse.json()) as PresignedUpload;
    if (payload.uploadUrl && payload.publicUrl) {
      try {
        const uploadResponse = await sendWithProgress({
          method: "PUT",
          url: payload.uploadUrl,
          body: file,
          headers: { "Content-Type": file.type },
          onProgress,
        });
        if (uploadResponse.ok) {
          onProgress?.(1);
          return payload.publicUrl;
        }
      } catch {
        // Server upload is the CORS-safe fallback.
      }
      // The retry starts from zero bytes — don't leave a stale bar behind.
      onProgress?.(0);
    }
  }

  return directUpload(file, entity, recordId, onProgress);
}
