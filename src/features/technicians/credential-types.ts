import type { Database } from "@/types/database";
import { t as uiText } from "./../../lib/i18n/index.ts";


export const CREDENTIAL_TYPE_LABELS = {
  ase: uiText("ui.ase_credential_264cc0b0fe"),
  ase_master: uiText("ui.ase_master_credential_43ab3d3a5b"),
  oem_training: uiText("ui.oem_training_credential_c166a76bd7"),
  state_license: uiText("ui.state_license_d58451b11e"),
  business_registration: uiText("ui.business_registration_b3d04a09c3"),
  other: uiText("ui.other_professional_credential_73a614e425"),
} as const;

export const VERIFICATION_METHOD_LABELS = {
  issuer_registry: uiText("ui.issuer_registry_checked_d61fe3d084"),
  document_review: uiText("ui.credential_document_reviewed_86ff851e84"),
  issuer_confirmation: uiText("ui.issuer_confirmation_received_74355610e6"),
  government_registry: uiText("ui.government_registry_checked_c4dcb3218f"),
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
  return CREDENTIAL_TYPE_LABELS[type as CredentialType] ?? uiText("ui.professional_credential_338ca776de");
}

export function verificationMethodLabel(method: string | null) {
  if (!method) return uiText("ui.reviewed_evidence_1076c88a60");
  return VERIFICATION_METHOD_LABELS[method as VerificationMethod] ?? uiText("ui.reviewed_evidence_1076c88a60");
}
