import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSocialProfileId } from "@/features/social/relationships";
import { requireRole } from "@/features/auth/guards";
import type { PublicTechnicianCredential } from "@/features/technicians/credential-types";

export {
  CREDENTIAL_TYPE_LABELS,
  VERIFICATION_METHOD_LABELS,
} from "@/features/technicians/credential-types";
export type {
  CredentialType,
  PublicTechnicianCredential,
  TechnicianCredential,
  TechnicianCredentialSummary,
  VerificationMethod,
} from "@/features/technicians/credential-types";

const submissionSchema = z.object({
  credential_type: z.enum(["ase", "ase_master", "oem_training", "state_license", "business_registration", "other"]),
  credential_name: z.string().trim().min(2).max(120),
  issuer: z.string().trim().min(2).max(120),
  scope: z.string().trim().min(2).max(240).nullable().optional(),
  credential_identifier_last4: z.string().trim().regex(/^[A-Za-z0-9-]{2,8}$/).nullable().optional(),
  issued_on: z.string().date().nullable().optional(),
  expires_on: z.string().date().nullable().optional(),
  evidence_reference: z.string().trim().min(4).max(500),
  supersedes_credential_id: z.string().uuid().nullable().optional(),
});

const reviewSchema = z.object({
  credential_id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  verification_method: z.enum(["issuer_registry", "document_review", "issuer_confirmation", "government_registry"]),
  reason: z.string().trim().min(10).max(500),
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function getPublicCredentialMap(technicianIds: string[]) {
  const map = new Map<string, PublicTechnicianCredential[]>();
  if (technicianIds.length === 0) return map;
  const { data, error } = await createAdminClient()
    .from("technician_credentials")
    .select("id, technician_profile_id, credential_type, credential_name, issuer, scope, issued_on, expires_on, reviewed_at, verification_method")
    .in("technician_profile_id", technicianIds)
    .eq("status", "approved")
    .or(`expires_on.is.null,expires_on.gte.${todayIso()}`)
    .order("reviewed_at", { ascending: false });
  if (error) {
    console.error("[technicians] Public credentials failed", error.message);
    return map;
  }
  for (const credential of data ?? []) {
    const current = map.get(credential.technician_profile_id) ?? [];
    current.push(credential);
    map.set(credential.technician_profile_id, current);
  }
  return map;
}

export async function getMyTechnicianCredentials() {
  const profileId = await getCurrentSocialProfileId();
  if (!profileId) return [];
  const { data: technician } = await createAdminClient()
    .from("technician_profiles")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!technician) return [];
  const { data } = await createAdminClient()
    .from("technician_credentials")
    .select("*")
    .eq("technician_profile_id", technician.id)
    .order("submitted_at", { ascending: false });
  return data ?? [];
}

export async function submitTechnicianCredential(input: unknown) {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.errors[0]?.message ?? "Check the credential details." };
  const profileId = await getCurrentSocialProfileId();
  if (!profileId) return { ok: false as const, message: "Sign in to submit a credential." };
  if (parsed.data.expires_on && parsed.data.expires_on < todayIso()) {
    return { ok: false as const, message: "An expired credential cannot be submitted." };
  }
  const { data, error } = await createAdminClient().rpc("submit_technician_credential", {
    p_actor_profile_id: profileId,
    p_credential_type: parsed.data.credential_type,
    p_credential_name: parsed.data.credential_name,
    p_issuer: parsed.data.issuer,
    p_scope: parsed.data.scope ?? "",
    p_identifier_last4: parsed.data.credential_identifier_last4 ?? "",
    p_issued_on: parsed.data.issued_on ?? null,
    p_expires_on: parsed.data.expires_on ?? null,
    p_evidence_reference: parsed.data.evidence_reference,
    p_supersedes_id: parsed.data.supersedes_credential_id ?? null,
  });
  if (error || !data) {
    if (error?.code === "23505") return { ok: false as const, message: "This credential already has an active submission." };
    if (error?.code === "54000") return { ok: false as const, message: "You have reached the credential submission limit. Try again in 24 hours." };
    console.warn("submit_technician_credential failed", { code: error?.code, message: error?.message });
    return { ok: false as const, message: "The credential could not be submitted. Please try again." };
  }
  return { ok: true as const, credential: data };
}

export async function readTechnicianCredentialEvidence(credentialId: string) {
  const admin = await requireRole(["admin"]);
  const parsed = z.string().uuid().safeParse(credentialId);
  if (!parsed.success) return { ok: false as const, message: "Invalid credential." };
  const { data, error } = await createAdminClient().rpc("read_technician_credential_evidence", {
    p_actor_profile_id: admin.id,
    p_credential_id: parsed.data,
  });
  if (error || !data) {
    console.warn("read_technician_credential_evidence failed", { code: error?.code, message: error?.message });
    return { ok: false as const, message: "The private evidence could not be loaded." };
  }
  return { ok: true as const, evidence: data };
}

export async function reviewTechnicianCredential(input: unknown) {
  const admin = await requireRole(["admin"]);
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.errors[0]?.message ?? "Check the review." };
  const { data, error } = await createAdminClient().rpc("review_technician_credential", {
    p_actor_profile_id: admin.id,
    p_credential_id: parsed.data.credential_id,
    p_decision: parsed.data.decision,
    p_verification_method: parsed.data.verification_method,
    p_reason: parsed.data.reason,
  });
  if (error || !data) {
    console.warn("review_technician_credential failed", { code: error?.code, message: error?.message });
    return { ok: false as const, message: "The credential review could not be saved." };
  }
  return { ok: true as const, credential: data };
}

export async function revokeTechnicianCredential(credentialId: string, reason: string) {
  const admin = await requireRole(["admin"]);
  const parsed = z.object({ credentialId: z.string().uuid(), reason: z.string().trim().min(10).max(500) })
    .safeParse({ credentialId, reason });
  if (!parsed.success) return { ok: false as const, message: parsed.error.errors[0]?.message ?? "A revocation reason is required." };
  const { data, error } = await createAdminClient().rpc("revoke_technician_credential", {
    p_actor_profile_id: admin.id,
    p_credential_id: parsed.data.credentialId,
    p_reason: parsed.data.reason,
  });
  if (error || !data) {
    console.warn("revoke_technician_credential failed", { code: error?.code, message: error?.message });
    return { ok: false as const, message: "The credential could not be revoked." };
  }
  return { ok: true as const, credential: data };
}

export async function hasActiveCertifiedCredential(technicianProfileId: string) {
  const { count, error } = await createAdminClient()
    .from("technician_credentials")
    .select("id", { count: "exact", head: true })
    .eq("technician_profile_id", technicianProfileId)
    .eq("status", "approved")
    .in("credential_type", ["ase_master", "oem_training"])
    .or(`expires_on.is.null,expires_on.gte.${todayIso()}`);
  if (error) {
    console.error("[technicians] Certification check failed", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}
