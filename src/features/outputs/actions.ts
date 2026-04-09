"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { generateStandardizedOutput } from "@/lib/ai/standardized-generator";
import { generateVscCoverage } from "@/lib/ai/vsc-generator";
import type { Json } from "@/types/database";
import type { SectionType } from "@/types/enums";
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
// triggerOutputGeneration — two-stage pipeline
// ============================================================================

export async function triggerOutputGeneration(
  submissionId: string,
  options?: { actorId?: string }
) {
  const admin = createAdminClient();

  // Load submission with nested sections/answers
  const { data: submission, error: subError } = await admin
    .from("ppi_submissions")
    .select(
      `
      id, ppi_request_id, performer_id, version, status, submitted_at,
      sections:ppi_sections(
        id, section_type, notes, sort_order,
        answers:ppi_answers(prompt, answer_value, answer_type, sort_order)
      )
    `
    )
    .eq("id", submissionId)
    .single();

  if (subError || !submission) {
    return { error: subError?.message ?? "Submission not found" };
  }

  if (submission.status !== "submitted") {
    return { error: `Submission status is "${submission.status}", expected "submitted"` };
  }

  // Load the parent request + vehicle
  const { data: request } = await admin
    .from("ppi_requests")
    .select(
      `
      id, ppi_type, performer_type, requester_id,
      vehicle:vehicles(year, make, model, trim, vin, mileage)
    `
    )
    .eq("id", submission.ppi_request_id)
    .single();

  if (!request) {
    return { error: "Parent request not found" };
  }

  // Load performer profile
  const { data: performer } = await admin
    .from("profiles")
    .select("display_name, role")
    .eq("id", submission.performer_id)
    .single();

  const vehicle = request.vehicle as {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  } | null;

  // Sort sections and answers by sort_order
  const sortedSections = [...(submission.sections ?? [])]
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    .map((s) => ({
      section_type: s.section_type as SectionType,
      notes: s.notes,
      answers: [...(s.answers ?? [])]
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
        .map((a) => ({
          prompt: a.prompt,
          answer_value: a.answer_value,
          answer_type: a.answer_type,
        })),
    }));

  // Determine next version numbers
  const { data: existingStd } = await admin
    .from("standardized_outputs")
    .select("version")
    .eq("ppi_submission_id", submissionId)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion =
    existingStd && existingStd.length > 0 ? existingStd[0].version + 1 : 1;

  // --- Stage 1: Standardized Output ---
  let standardizedContent;
  try {
    standardizedContent = await generateStandardizedOutput({
      vehicle: vehicle ?? { year: null, make: null, model: null, trim: null, vin: null, mileage: null },
      request: { ppi_type: request.ppi_type, performer_type: request.performer_type },
      submission: { submitted_at: submission.submitted_at, version: submission.version },
      performer: {
        display_name: performer?.display_name ?? null,
        role: performer?.role ?? "consumer",
      },
      sections: sortedSections,
    });
  } catch (err) {
    return { error: `Stage 1 generation failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const { data: stdOutput, error: stdError } = await admin
    .from("standardized_outputs")
    .insert({
      ppi_submission_id: submissionId,
      version: nextVersion,
      structured_content: standardizedContent as unknown as Json,
      document_url: null,
    })
    .select()
    .single();

  if (stdError || !stdOutput) {
    return { error: stdError?.message ?? "Failed to insert standardized output" };
  }

  // --- Stage 2: VSC Coverage ---
  let coverageData;
  try {
    coverageData = await generateVscCoverage(standardizedContent);
  } catch (err) {
    return { error: `Stage 2 generation failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const { data: vscOutput, error: vscError } = await admin
    .from("vsc_outputs")
    .insert({
      ppi_submission_id: submissionId,
      standardized_output_id: stdOutput.id,
      version: nextVersion,
      coverage_data: coverageData as unknown as Json,
      document_url: null,
    })
    .select()
    .single();

  if (vscError || !vscOutput) {
    return { error: vscError?.message ?? "Failed to insert VSC output" };
  }

  // --- Audit log ---
  await insertAuditLog({
    actorId: options?.actorId ?? submission.performer_id,
    action: "output_regenerated",
    targetType: "ppi_submission",
    targetId: submissionId,
    metadata: {
      version: nextVersion,
      standardized_output_id: stdOutput.id,
      vsc_output_id: vscOutput.id,
    },
  });

  // Revalidate the detail page
  revalidatePath(`/dashboard/ppi/${request.id}`);
  revalidatePath(`/tech/ppi/${request.id}`);

  return {
    data: {
      standardizedOutputId: stdOutput.id,
      vscOutputId: vscOutput.id,
    },
  };
}

// ============================================================================
// regenerateOutputs — authenticated wrapper
// ============================================================================

export async function regenerateOutputs(submissionId: string) {
  const ctx = await getAuthProfile();
  if (!ctx) return { error: "Not authenticated" };

  const { data: accessibleSubmission, error: accessError } = await ctx.supabase
    .from("ppi_submissions")
    .select("id")
    .eq("id", submissionId)
    .maybeSingle();

  if (accessError || !accessibleSubmission) {
    return { error: "Not authorized to access this submission" };
  }

  return triggerOutputGeneration(submissionId, { actorId: ctx.id });
}
