import { z } from "zod";

/**
 * Upload and attach are separate requests. Accept only URLs/references issued
 * by PerfectPPI so clients cannot attach third-party tracking or hotlink URLs.
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

export function isManagedPrivateUploadReference(value: string): boolean {
  return /^r2-private:\/\/\/(?:ppi_media|vehicle_media|media_package|message_attachment)\/[0-9a-f-]+\/[0-9a-f-]+\/[a-zA-Z0-9._-]+$/.test(value);
}

export function isVehicleQuarantineReference(value: string): boolean {
  return /^r2-private:\/\/\/quarantine\/vehicle_media\/[0-9a-f-]+\/[0-9a-f-]+\/[a-zA-Z0-9._-]+$/.test(value);
}

export const uploadedUrlSchema = z
  .string()
  .refine(
    (value) => isManagedUploadUrl(value) || isManagedPrivateUploadReference(value),
    "Media must be uploaded through PerfectPPI",
  );

export const vehicleUploadReferenceSchema = z
  .string()
  .refine(
    (value) => isVehicleQuarantineReference(value),
    "Vehicle media must be uploaded to PerfectPPI quarantine storage",
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
