import type { Database } from "@/types/database";

export const CREDENTIAL_TYPE_LABELS = {
  ase: "ASE credential",
  ase_master: "ASE Master credential",
  oem_training: "OEM training credential",
  state_license: "State license",
  business_registration: "Business registration",
  other: "Other professional credential",
} as const;

export const VERIFICATION_METHOD_LABELS = {
  issuer_registry: "Issuer registry checked",
  document_review: "Credential document reviewed",
  issuer_confirmation: "Issuer confirmation received",
  government_registry: "Government registry checked",
} as const;

export type CredentialType = keyof typeof CREDENTIAL_TYPE_LABELS;
export type VerificationMethod = keyof typeof VERIFICATION_METHOD_LABELS;
export type TechnicianCredential = Database["public"]["Tables"]["technician_credentials"]["Row"];
export type TechnicianCredentialSummary = Omit<
  TechnicianCredential,
  "evidence_reference" | "submitted_by" | "reviewed_by" | "revoked_by" | "created_at" | "updated_at"
>;

export type PublicTechnicianCredential = Pick<
  TechnicianCredential,
  | "id"
  | "credential_type"
  | "credential_name"
  | "issuer"
  | "scope"
  | "issued_on"
  | "expires_on"
  | "reviewed_at"
  | "verification_method"
>;

export function credentialTypeLabel(type: string) {
  return CREDENTIAL_TYPE_LABELS[type as CredentialType] ?? "Professional credential";
}

export function verificationMethodLabel(method: string | null) {
  if (!method) return "Reviewed evidence";
  return VERIFICATION_METHOD_LABELS[method as VerificationMethod] ?? "Reviewed evidence";
}
