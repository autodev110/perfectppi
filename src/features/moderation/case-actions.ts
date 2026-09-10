"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { REPORT_REASON_CODES } from "@/features/moderation/report-reasons";
import { MODERATION_CAPABILITIES } from "@/features/moderation/capabilities";

// Case actions call the SQL functions through the caller's own session so the
// database re-checks capabilities, claims, and decision_version itself; the
// server action only shapes input and maps outcomes (plan 18.4 / 20.2).

const CASE_ERRORS: Record<string, string> = {
  case_version_conflict: "Another moderator changed this case first. The page has been reloaded with the latest state.",
  case_claimed_by_other: "This case is claimed by another moderator. You can view it, but not decide it until their claim expires.",
  case_already_closed: "This case is already closed.",
};

function mapCaseError(message: string) {
  for (const [key, copy] of Object.entries(CASE_ERRORS)) {
    if (message.includes(key)) return copy;
  }
  if (message.includes("moderation capability required")) {
    return "You do not hold the capability required for this action.";
  }
  if (message.includes("policy category")) return "Removal requires a policy category.";
  if (message.includes("rationale")) return "Add a rationale of at least 10 characters.";
  return "The action could not be completed.";
}

function caseUrl(caseId: string, notice?: string) {
  const url = new URL(`/admin/moderation/cases/${caseId}`, "http://localhost");
  if (notice) url.searchParams.set("notice", notice);
  return `${url.pathname}${url.search}`;
}

function revalidateCase(caseId: string) {
  revalidatePath("/admin/moderation");
  revalidatePath(`/admin/moderation/cases/${caseId}`);
  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
}

const caseIdSchema = z.string().uuid();

export async function claimModerationCase(formData: FormData): Promise<void> {
  const caseId = caseIdSchema.parse(formData.get("case_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_moderation_case", { p_case_id: caseId });
  revalidateCase(caseId);
  redirect(caseUrl(caseId, error ? mapCaseError(error.message) : undefined));
}

export async function releaseModerationCase(formData: FormData): Promise<void> {
  const caseId = caseIdSchema.parse(formData.get("case_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("release_moderation_case", { p_case_id: caseId });
  revalidateCase(caseId);
  redirect(caseUrl(caseId, error ? mapCaseError(error.message) : undefined));
}

const noteSchema = z.object({
  caseId: caseIdSchema,
  note: z.string().trim().min(1).max(2000),
});

export async function addModerationCaseNote(formData: FormData): Promise<void> {
  const parsed = noteSchema.safeParse({ caseId: formData.get("case_id"), note: formData.get("note") });
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_moderation_case_note", {
    p_case_id: parsed.data.caseId,
    p_note: parsed.data.note,
  });
  revalidateCase(parsed.data.caseId);
  redirect(caseUrl(parsed.data.caseId, error ? mapCaseError(error.message) : undefined));
}

const decisionSchema = z.object({
  caseId: caseIdSchema,
  expectedVersion: z.coerce.number().int().positive(),
  decision: z.enum(["restore", "remove", "escalate"]),
  policyCategory: z.enum(REPORT_REASON_CODES).optional(),
  rationale: z.string().trim().max(2000).optional(),
  enforcement: z.enum(["none", "warning", "posting_hold", "media_hold", "reporting_hold", "suspension", "ban"]).default("none"),
  enforcementDays: z.coerce.number().int().min(1).max(365).default(7),
}).superRefine((value, ctx) => {
  if (value.decision === "remove" && !value.policyCategory) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["policyCategory"], message: "Removal requires a policy category." });
  }
  if (value.decision !== "restore" && (value.rationale ?? "").length < 10) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rationale"], message: "Add a rationale of at least 10 characters." });
  }
  if (value.enforcement !== "none" && value.decision !== "remove") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["enforcement"],
      message: "Account enforcement requires a removal decision.",
    });
  }
});

export async function decideModerationCase(formData: FormData): Promise<void> {
  const caseId = caseIdSchema.parse(formData.get("case_id"));
  const parsed = decisionSchema.safeParse({
    caseId,
    expectedVersion: formData.get("decision_version"),
    decision: formData.get("decision"),
    policyCategory: String(formData.get("policy_category") ?? "") || undefined,
    rationale: String(formData.get("rationale") ?? "") || undefined,
    enforcement: formData.get("enforcement") ?? "none",
    enforcementDays: formData.get("enforcement_days") ?? 7,
  });
  if (!parsed.success) {
    redirect(caseUrl(caseId, parsed.error.errors[0].message));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_moderation_case", {
    p_case_id: parsed.data.caseId,
    p_expected_version: parsed.data.expectedVersion,
    p_decision: parsed.data.decision,
    p_policy_category: parsed.data.policyCategory ?? null,
    p_rationale: parsed.data.rationale ?? null,
    p_enforcement: parsed.data.enforcement,
    p_enforcement_days: parsed.data.enforcementDays,
  });
  revalidateCase(caseId);
  revalidatePath("/admin/community");
  redirect(caseUrl(caseId, error ? mapCaseError(error.message) : `Decision recorded: ${parsed.data.decision}.`));
}

const grantSchema = z.object({
  profileId: z.string().uuid(),
  capability: z.enum(MODERATION_CAPABILITIES),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
});

export async function grantModerationCapability(formData: FormData): Promise<void> {
  const parsed = grantSchema.safeParse({
    profileId: formData.get("profile_id"),
    capability: formData.get("capability"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirect(`/admin/moderation/access?notice=${encodeURIComponent(parsed.error.errors[0].message)}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_moderation_capability", {
    p_profile_id: parsed.data.profileId,
    p_capability: parsed.data.capability,
    p_reason: parsed.data.reason,
  });
  revalidatePath("/admin/moderation/access");
  redirect(`/admin/moderation/access?notice=${encodeURIComponent(error ? mapCaseError(error.message) : "Capability granted.")}`);
}

export async function revokeModerationCapability(formData: FormData): Promise<void> {
  const parsed = grantSchema.safeParse({
    profileId: formData.get("profile_id"),
    capability: formData.get("capability"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirect(`/admin/moderation/access?notice=${encodeURIComponent(parsed.error.errors[0].message)}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_moderation_capability", {
    p_profile_id: parsed.data.profileId,
    p_capability: parsed.data.capability,
    p_reason: parsed.data.reason,
  });
  revalidatePath("/admin/moderation/access");
  redirect(`/admin/moderation/access?notice=${encodeURIComponent(error ? mapCaseError(error.message) : "Capability revoked.")}`);
}
