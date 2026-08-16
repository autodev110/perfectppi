"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { enqueueOutputGeneration, runOutputWorkerTick } from "./worker";
import type { Json } from "@/types/database";
import type { AuditAction } from "@/types/enums";

// ============================================================================
// Helpers
// ============================================================================

async function getAuthProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  return profile ? { ...profile, supabase } : null;
}

// ============================================================================
// insertAuditLog — helper for audit trail entries
// ============================================================================

export async function insertAuditLog(params: {
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();

  const { error } = await admin.from("audit_logs").insert({
    actor_id: params.actorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    metadata: (params.metadata ?? {}) as Json,
  });

  if (error) {
    console.error("Failed to insert audit log:", error.message);
  }
}

// ============================================================================
// Output generation entry points
//
// Generation itself lives in features/outputs/pipeline.ts and is driven by the
// output_generation_jobs queue. Everything here only enqueues: no caller waits
// on Gemini or on an R2 upload inside a request.
// ============================================================================

/**
 * Resume a stalled or failed generation. The *same* output version is retried,
 * so artifacts already stored are reused rather than duplicated under a new
 * version number.
 */
export async function retryOutputGeneration(submissionId: string) {
  const ctx = await getAuthProfile();
  if (!ctx) return { error: "Not authenticated" };

  const authorized = await canAccessSubmission(ctx, submissionId);
  if (!authorized) return { error: "Not authorized to access this submission" };

  const job = await enqueueOutputGeneration({
    submissionId,
    trigger: "manual_retry",
    requestedBy: ctx.id,
  });
  if ("error" in job) return { error: job.error };

  void runOutputWorkerTick({ limit: 1 }).catch((error) =>
    console.error("outputs: manual retry tick failed", error),
  );

  return { data: { jobId: job.jobId, outputVersion: job.outputVersion } };
}

/**
 * Deliberately produce a *new* immutable output version. Previous versions and
 * their artifacts stay exactly as they were, so a partner that already imported
 * version 1 keeps a valid record of what it received.
 */
export async function regenerateOutputs(submissionId: string) {
  const ctx = await getAuthProfile();
  if (!ctx) return { error: "Not authenticated" };

  const authorized = await canAccessSubmission(ctx, submissionId);
  if (!authorized) return { error: "Not authorized to access this submission" };

  const job = await enqueueOutputGeneration({
    submissionId,
    trigger: "manual_regeneration",
    requestedBy: ctx.id,
    forceNewVersion: true,
  });
  if ("error" in job) return { error: job.error };

  await insertAuditLog({
    actorId: ctx.id,
    action: "output_regenerated",
    targetType: "ppi_submission",
    targetId: submissionId,
    metadata: { jobId: job.jobId, outputVersion: job.outputVersion },
  });

  void runOutputWorkerTick({ limit: 1 }).catch((error) =>
    console.error("outputs: regeneration tick failed", error),
  );

  const { data: submission } = await ctx.supabase
    .from("ppi_submissions")
    .select("ppi_request_id")
    .eq("id", submissionId)
    .maybeSingle();

  if (submission) {
    revalidatePath(`/dashboard/ppi/${submission.ppi_request_id}`);
    revalidatePath(`/tech/ppi/${submission.ppi_request_id}`);
  }

  return { data: { jobId: job.jobId, outputVersion: job.outputVersion } };
}

/**
 * Authorization rides on the user-scoped client: the submission RLS policies
 * already encode performer, requester, organization-manager and admin access,
 * so a submission the caller cannot read simply comes back empty.
 */
async function canAccessSubmission(
  ctx: NonNullable<Awaited<ReturnType<typeof getAuthProfile>>>,
  submissionId: string,
): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("ppi_submissions")
    .select("id")
    .eq("id", submissionId)
    .maybeSingle();

  return Boolean(data);
}
