import { z } from "zod";

/**
 * Media rows store the public URL the browser/app got back from
 * `/api/upload/*`. Those endpoints authorize the target and hand back a URL
 * under `R2_PUBLIC_URL` — but the follow-up "attach this URL to the record"
 * call is a separate request, so without this check a client could skip the
 * upload entirely and point a post, listing photo, or message attachment at
 * any third-party host. That renders in an <img>/<video> for every viewer,
 * which is a tracking-pixel and hotlinking vector.
 */
function publicUploadBase(): string {
  return (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
}

export function isManagedUploadUrl(value: string, base = publicUploadBase()): boolean {
  if (!base) return false;
  // The trailing slash matters: without it `https://cdn.example.com.evil.test/x`
  // would pass a bare prefix check.
  return value.startsWith(`${base}/`) && value.length > base.length + 1;
}

export const uploadedUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => isManagedUploadUrl(value),
    "Media must be uploaded through PerfectPPI",
  );

export function isQuarantineReference(value: string): boolean {
  return value.startsWith("r2-private:///quarantine/") && value.length > 27;
}

export const communityUploadReferenceSchema = z
  .string()
  .refine(
    (value) => isQuarantineReference(value),
    "Community media must be uploaded to PerfectPPI quarantine storage",
  );
