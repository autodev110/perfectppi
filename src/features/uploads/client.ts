"use client";

import type { UploadEntity } from "./access";

type PresignedUpload = {
  uploadUrl?: string;
  publicUrl?: string;
  error?: string;
};

async function directUpload(file: File, entity: UploadEntity, recordId: string) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("entity", entity);
  formData.set("recordId", recordId);

  const response = await fetch("/api/upload/direct", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as PresignedUpload;
  if (!response.ok || !payload.publicUrl) {
    throw new Error(payload.error ?? "Upload failed");
  }
  return payload.publicUrl;
}

export async function uploadFile(file: File, entity: UploadEntity, recordId: string) {
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
        const uploadResponse = await fetch(payload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (uploadResponse.ok) return payload.publicUrl;
      } catch {
        // Server upload is the CORS-safe fallback.
      }
    }
  }

  return directUpload(file, entity, recordId);
}
