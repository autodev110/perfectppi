import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export const SERVICE_DISPUTE_REASONS = [
  "quality_concern",
  "incomplete_inspection",
  "incorrect_information",
  "professional_conduct",
  "billing_or_scope",
  "other",
] as const;

export const SERVICE_DISPUTE_REASON_LABELS: Record<(typeof SERVICE_DISPUTE_REASONS)[number], string> = {
  quality_concern: "Inspection quality concern",
  incomplete_inspection: "Inspection appears incomplete",
  incorrect_information: "Report contains incorrect information",
  professional_conduct: "Professional conduct concern",
  billing_or_scope: "Billing or agreed scope concern",
  other: "Other inspection concern",
};

const openSchema = z.object({
  ppiRequestId: z.string().uuid(),
  reasonCode: z.enum(SERVICE_DISPUTE_REASONS),
  details: z.string().trim().min(20, "Describe the concern in at least 20 characters").max(2000),
});

const resolveSchema = z.object({
  disputeId: z.string().uuid(),
  status: z.enum(["resolved", "dismissed"]),
  outcome: z.enum(["customer_supported", "technician_supported", "partial_resolution", "no_finding"]),
  resolutionNote: z.string().trim().min(10).max(2000),
  restoreReview: z.boolean(),
});

export type PpiServiceDispute = Database["public"]["Tables"]["ppi_service_disputes"]["Row"];

type DisputeResult =
  | { ok: true; data: PpiServiceDispute }
  | { ok: false; code: string; message: string };

async function currentProfileId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
  return data?.id ?? null;
}

function disputeError(error: { code?: string; message?: string }): DisputeResult {
  const raw = error.message ?? "";
  if (raw.includes("dispute_window_closed")) return { ok: false, code: "window_closed", message: "The 30-day inspection dispute window has closed." };
  if (raw.includes("dispute_already_open")) return { ok: false, code: "already_open", message: "A dispute was already submitted for this inspection." };
  if (raw.includes("dispute_requires_completed")) return { ok: false, code: "not_eligible", message: "Only completed technician inspections can be disputed." };
  if (raw.includes("dispute_unavailable") || raw.includes("dispute_request_unavailable") || error.code === "42501") {
    return { ok: false, code: "forbidden", message: "This inspection dispute is unavailable." };
  }
  console.warn("inspection dispute operation failed", { code: error.code, message: raw.slice(0, 200) });
  return { ok: false, code: "failed", message: "The dispute could not be updated. Please try again." };
}

function revalidateDispute(requestId: string) {
  revalidatePath(`/dashboard/ppi/${requestId}`);
  revalidatePath(`/dashboard/ppi/${requestId}/review`);
  revalidatePath("/admin/reviews");
  revalidatePath("/tech/reviews");
}

export async function openPpiServiceDispute(input: unknown): Promise<DisputeResult> {
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.errors[0]?.message ?? "Check the dispute details." };
  const actorId = await currentProfileId();
  if (!actorId) return { ok: false, code: "not_authenticated", message: "Sign in to report an inspection concern." };
  const { data, error } = await createAdminClient().rpc("open_ppi_service_dispute", {
    p_actor_profile_id: actorId,
    p_ppi_request_id: parsed.data.ppiRequestId,
    p_reason_code: parsed.data.reasonCode,
    p_details: parsed.data.details,
  });
  if (error || !data) return disputeError(error ?? { message: "missing dispute" });
  revalidateDispute(parsed.data.ppiRequestId);
  return { ok: true, data };
}

export async function withdrawPpiServiceDispute(disputeId: string): Promise<DisputeResult> {
  const parsed = z.string().uuid().safeParse(disputeId);
  if (!parsed.success) return { ok: false, code: "invalid", message: "The dispute reference is invalid." };
  const actorId = await currentProfileId();
  if (!actorId) return { ok: false, code: "not_authenticated", message: "Sign in to update this dispute." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("ppi_service_disputes").select("ppi_request_id").eq("id", parsed.data).maybeSingle();
  const { data, error } = await admin.rpc("withdraw_ppi_service_dispute", {
    p_actor_profile_id: actorId,
    p_dispute_id: parsed.data,
  });
  if (error || !data) return disputeError(error ?? { message: "missing dispute" });
  revalidateDispute(existing?.ppi_request_id ?? data.ppi_request_id);
  return { ok: true, data };
}

export async function resolvePpiServiceDispute(input: unknown): Promise<DisputeResult> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.errors[0]?.message ?? "Check the resolution." };
  const actorId = await currentProfileId();
  if (!actorId) return { ok: false, code: "not_authenticated", message: "Sign in to resolve this dispute." };
  const { data, error } = await createAdminClient().rpc("resolve_ppi_service_dispute", {
    p_actor_profile_id: actorId,
    p_dispute_id: parsed.data.disputeId,
    p_status: parsed.data.status,
    p_outcome: parsed.data.outcome,
    p_resolution_note: parsed.data.resolutionNote,
    p_restore_review: parsed.data.restoreReview,
  });
  if (error || !data) return disputeError(error ?? { message: "missing dispute" });
  revalidateDispute(data.ppi_request_id);
  return { ok: true, data };
}

export async function openPpiServiceDisputeAction(formData: FormData) {
  "use server";
  const requestId = String(formData.get("ppi_request_id") ?? "");
  const result = await openPpiServiceDispute({
    ppiRequestId: requestId,
    reasonCode: formData.get("reason_code"),
    details: formData.get("details"),
  });
  const query = result.ok ? "dispute=opened" : `error=${encodeURIComponent(result.message)}`;
  redirect(`/dashboard/ppi/${requestId}/review?${query}`);
}

export async function withdrawPpiServiceDisputeAction(formData: FormData) {
  "use server";
  const requestId = String(formData.get("ppi_request_id") ?? "");
  const result = await withdrawPpiServiceDispute(String(formData.get("dispute_id") ?? ""));
  const query = result.ok ? "dispute=withdrawn" : `error=${encodeURIComponent(result.message)}`;
  redirect(`/dashboard/ppi/${requestId}/review?${query}`);
}

export async function resolvePpiServiceDisputeAction(formData: FormData) {
  "use server";
  const result = await resolvePpiServiceDispute({
    disputeId: formData.get("dispute_id"),
    status: formData.get("status"),
    outcome: formData.get("outcome"),
    resolutionNote: formData.get("resolution_note"),
    restoreReview: formData.get("restore_review") === "true",
  });
  redirect(`/admin/reviews?${result.ok ? "resolved=1" : `error=${encodeURIComponent(result.message)}`}`);
}

export async function getAdminPpiServiceDisputes(status: "open" | "closed" | "all" = "open") {
  let query = createAdminClient()
    .from("ppi_service_disputes")
    .select(`
      *,
      requester:profiles!ppi_service_disputes_requester_id_fkey(id, display_name, username),
      technician:technician_profiles!ppi_service_disputes_technician_profile_id_fkey(
        id, profile:profiles!technician_profiles_profile_id_fkey(id, display_name, username)
      ),
      request:ppi_requests!ppi_service_disputes_ppi_request_id_fkey(
        id, vehicle:vehicles!ppi_requests_vehicle_id_fkey(year, make, model)
      )
    `)
    .order("opened_at", { ascending: false })
    .limit(100);
  if (status === "open") query = query.eq("status", "open");
  if (status === "closed") query = query.neq("status", "open");
  const { data, error } = await query;
  if (error) {
    console.error("inspection dispute queue failed", error.message);
    return [];
  }
  return data ?? [];
}
