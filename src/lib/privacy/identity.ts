import { createHash, createHmac } from "node:crypto";

export function privacySubjectReference(authUserId: string): string {
  const salt = process.env.LEGAL_EVIDENCE_SALT;
  return salt
    ? createHmac("sha256", salt).update(authUserId).digest("hex")
    : createHash("sha256").update(authUserId).digest("hex");
}

export function privacyRequestSource(request: Request): "web" | "ios" {
  return request.headers.has("authorization") ? "ios" : "web";
}

export function privacyRecordExpiry(from = new Date()): string {
  const expires = new Date(from);
  expires.setUTCFullYear(expires.getUTCFullYear() + 2);
  return expires.toISOString();
}
