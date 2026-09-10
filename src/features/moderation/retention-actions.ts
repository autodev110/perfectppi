"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Retention policy administration (plan 19.3). The RPCs gate themselves on
// the admin role plus legal_hold_review; the action only shapes input.

const PAGE = "/admin/moderation/retention";

function done(notice: string): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?notice=${encodeURIComponent(notice)}`);
}

const policySchema = z.object({
  basis: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/, "Basis must be a lowercase code"),
  retentionDays: z.coerce.number().int().min(1).max(3650),
  approvalReference: z.string().trim().min(10, "Cite the approval (ticket, memo, or counsel reference)").max(500),
});

export async function setRetentionPolicy(formData: FormData): Promise<void> {
  const parsed = policySchema.safeParse({
    basis: formData.get("basis"),
    retentionDays: formData.get("retention_days"),
    approvalReference: formData.get("approval_reference"),
  });
  if (!parsed.success) done(parsed.error.errors[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_moderation_retention_policy", {
    p_basis: parsed.data.basis,
    p_retention_days: parsed.data.retentionDays,
    p_approval_reference: parsed.data.approvalReference,
  });
  done(error
    ? (error.message.includes("legal_hold_review") ? "Recording a retention period requires the legal_hold_review capability." : "The policy could not be saved.")
    : `Retention period recorded for ${parsed.data.basis}: ${parsed.data.retentionDays} days. Closed cases on that basis now carry an expiry.`);
}

const clearSchema = z.object({
  basis: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
});

export async function clearRetentionPolicy(formData: FormData): Promise<void> {
  const parsed = clearSchema.safeParse({ basis: formData.get("basis"), reason: formData.get("reason") });
  if (!parsed.success) done(parsed.error.errors[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_moderation_retention_policy", {
    p_basis: parsed.data.basis,
    p_reason: parsed.data.reason,
  });
  done(error
    ? (error.message.includes("legal_hold_review") ? "Clearing a retention period requires the legal_hold_review capability." : "The policy could not be cleared.")
    : `Retention period cleared for ${parsed.data.basis}. Unpurged cases on that basis are no longer eligible.`);
}
