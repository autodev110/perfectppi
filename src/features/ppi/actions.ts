"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  SECTION_ORDER,
  SECTION_QUESTION_TEMPLATES,
  isValidTransition,
} from "./constants";
import type { PpiRequestStatus, SectionType } from "@/types/enums";
import type { Json } from "@/types/database";

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
// createPpiRequest
// Intake wizard output → creates ppi_request + (for self-PPI) seeds submission
// ============================================================================

const createRequestSchema = z.object({
  vehicle_id: z.string().uuid("Invalid vehicle"),
  vin: z.string().trim().min(1, "VIN is required").max(17, "VIN must be 17 characters or less"),
  mileage: z.coerce.number().min(0, "Mileage must be 0 or greater"),
  whose_car: z.enum(["own", "other"]),
  requester_role: z.enum(["buying", "selling", "documenting"]),
  performer_type: z.enum(["self", "technician"]),
  assigned_tech_profile_id: z.string().uuid().optional(),
});

export async function createPpiRequest(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = createRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const ctx = await getAuthProfile();
  if (!ctx) return { error: "Not authenticated" };
  const { id: profileId, supabase } = ctx;

  const {
    vehicle_id,
    vin,
    mileage,
    whose_car,
    requester_role,
    performer_type,
    assigned_tech_profile_id,
  } =
    parsed.data;

  const normalizedVin = vin.trim().toUpperCase();

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id, owner_id")
    .eq("id", vehicle_id)
    .single();

  if (vehicleError || !vehicle || vehicle.owner_id !== profileId) {
    return { error: "Vehicle not found" };
  }

  const { error: vehicleUpdateError } = await supabase
    .from("vehicles")
    .update({
      vin: normalizedVin,
      mileage,
    })
    .eq("id", vehicle_id)
    .eq("owner_id", profileId);

  if (vehicleUpdateError) {
    return { error: vehicleUpdateError.message };
  }

  // Determine ppi_type and initial status
  let ppiType: "personal" | "general_tech" | "certified_tech" = "personal";
  let initialStatus: PpiRequestStatus = "draft";
  let assignedTechId: string | null = null;

  if (performer_type === "technician" && assigned_tech_profile_id) {
    // Look up the tech's profile id from technician_profiles
    const { data: techProfile } = await supabase
      .from("technician_profiles")
      .select("id, certification_level, profile_id")
      .eq("id", assigned_tech_profile_id)
      .single();

    if (!techProfile) return { error: "Technician not found" };

    assignedTechId = techProfile.profile_id;
    ppiType =
      techProfile.certification_level === "master" ||
      techProfile.certification_level === "oem_qualified"
        ? "certified_tech"
        : "general_tech";
    initialStatus = "assigned";
  } else if (performer_type === "technician") {
    initialStatus = "pending_assignment";
  }

  // Insert ppi_request
  const { data: request, error: reqError } = await supabase
    .from("ppi_requests")
    .insert({
      vehicle_id,
      requester_id: profileId,
      assigned_tech_id: assignedTechId,
      whose_car,
      requester_role,
      performer_type,
      ppi_type: ppiType,
      status: initialStatus,
    })
    .select()
    .single();

  if (reqError || !request) return { error: reqError?.message ?? "Failed to create request" };

  // For self-PPI, immediately create the submission + seed sections/answers
  if (performer_type === "self") {
    const submissionResult = await createSubmission(request.id, profileId);
    if ("error" in submissionResult) return { error: submissionResult.error };

    revalidatePath("/dashboard/ppi");
    return { data: { requestId: request.id, submissionId: submissionResult.submissionId } };
  }

  revalidatePath("/dashboard/ppi");
  return { data: { requestId: request.id, submissionId: null } };
}

// ============================================================================
// createSubmission
// Creates a versioned submission + seeds all sections and answers
// ============================================================================

export async function createSubmission(
  requestId: string,
  performerId: string
): Promise<{ submissionId: string } | { error: string }> {
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("ppi_requests")
    .select("id, requester_id, assigned_tech_id, performer_type")
    .eq("id", requestId)
    .single();

  if (!request) return { error: "Request not found" };

  const canPerformSelfInspection =
    request.performer_type === "self" && request.requester_id === performerId;
  const canPerformTechInspection =
    request.performer_type === "technician" && request.assigned_tech_id === performerId;

  if (!canPerformSelfInspection && !canPerformTechInspection) {
    return { error: "You are not allowed to create a submission for this request" };
  }

  // Find the current highest version for this request
  const { data: existing } = await supabase
    .from("ppi_submissions")
    .select("version")
    .eq("ppi_request_id", requestId)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1;

  // Mark any existing current submission as not current
  if (existing && existing.length > 0) {
    await supabase
      .from("ppi_submissions")
      .update({ is_current: false })
      .eq("ppi_request_id", requestId)
      .eq("is_current", true);
  }

  // Create the new submission
  const { data: submission, error: subError } = await supabase
    .from("ppi_submissions")
    .insert({
      ppi_request_id: requestId,
      performer_id: performerId,
      version: nextVersion,
      is_current: true,
      status: "draft",
    })
    .select()
    .single();

  if (subError || !submission) {
    return { error: subError?.message ?? "Failed to create submission" };
  }

  // Seed sections
  const sectionInserts = SECTION_ORDER.map((sectionType, index) => ({
    ppi_submission_id: submission.id,
    section_type: sectionType,
    completion_state: "not_started" as const,
    sort_order: index + 1,
  }));

  const { data: sections, error: secError } = await supabase
    .from("ppi_sections")
    .insert(sectionInserts)
    .select();

  if (secError || !sections) {
    return { error: secError?.message ?? "Failed to seed sections" };
  }

  // Seed answers for each section
  const allAnswerInserts: {
    ppi_section_id: string;
    prompt: string;
    answer_type: "text" | "yes_no" | "select" | "number";
    options: string[] | null;
    is_required: boolean;
    sort_order: number;
  }[] = [];

  for (const section of sections) {
    const templates =
      SECTION_QUESTION_TEMPLATES[section.section_type as SectionType] ?? [];
    templates.forEach((template, idx) => {
      allAnswerInserts.push({
        ppi_section_id: section.id,
        prompt: template.prompt,
        answer_type: template.answerType,
        options: template.options ?? null,
        is_required: template.isRequired,
        sort_order: idx + 1,
      });
    });
  }

  if (allAnswerInserts.length > 0) {
    const { error: ansError } = await supabase
      .from("ppi_answers")
      .insert(allAnswerInserts);

    if (ansError) return { error: ansError.message };
  }

  return { submissionId: submission.id };
}

// ============================================================================
// assignTech
// ============================================================================

export async function assignTech(requestId: string, techProfileId: string) {
  const supabase = await createClient();

  // Get the tech's profiles.id from technician_profiles.id
  const { data: techProfile } = await supabase
    .from("technician_profiles")
    .select("profile_id, certification_level")
    .eq("id", techProfileId)
    .single();

  if (!techProfile) return { error: "Technician not found" };

  const ppiType =
    techProfile.certification_level === "master" ||
    techProfile.certification_level === "oem_qualified"
      ? "certified_tech"
      : "general_tech";

  const { error } = await supabase
    .from("ppi_requests")
    .update({
      assigned_tech_id: techProfile.profile_id,
      ppi_type: ppiType,
      status: "assigned",
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/ppi/${requestId}`);
  revalidatePath("/dashboard/ppi");
  return { success: true };
}

// ============================================================================
// acceptRequest (technician accepts an assigned inspection)
// ============================================================================

export async function acceptRequest(requestId: string) {
  const ctx = await getAuthProfile();
  if (!ctx) return { error: "Not authenticated" };
  const { id: profileId, supabase } = ctx;

  // Verify this request is assigned to the current tech
  const { data: request } = await supabase
    .from("ppi_requests")
    .select("id, status, assigned_tech_id")
    .eq("id", requestId)
    .single();

  if (!request) return { error: "Request not found" };
  if (request.assigned_tech_id !== profileId) return { error: "Not assigned to you" };
  if (!isValidTransition(request.status as PpiRequestStatus, "accepted")) {
    return { error: `Cannot accept from status: ${request.status}` };
  }

  // Update status
  const { error } = await supabase
    .from("ppi_requests")
    .update({ status: "accepted" })
    .eq("id", requestId);

  if (error) return { error: error.message };

  // Create the tech's submission
  const submissionResult = await createSubmission(requestId, profileId);
  if ("error" in submissionResult) return { error: submissionResult.error };

  revalidatePath("/tech/ppi");
  revalidatePath(`/tech/ppi/${requestId}`);
  return { data: { submissionId: submissionResult.submissionId } };
}

// ============================================================================
// startInspection
// ============================================================================

export async function startInspection(requestId: string, submissionId: string) {
  const ctx = await getAuthProfile();
  if (!ctx) return { error: "Not authenticated" };
  const { id: profileId, supabase } = ctx;

  const { data: submission } = await supabase
    .from("ppi_submissions")
    .select("id, ppi_request_id, performer_id, status")
    .eq("id", submissionId)
    .single();

  if (!submission) return { error: "Submission not found" };
  if (submission.ppi_request_id !== requestId) {
    return { error: "Submission does not belong to this request" };
  }
  if (submission.performer_id !== profileId) {
    return { error: "You are not allowed to start this inspection" };
  }

  const { data: request } = await supabase
    .from("ppi_requests")
    .select("status")
    .eq("id", requestId)
    .single();

  if (!request) return { error: "Request not found" };
  if (
    request.status !== "in_progress" &&
    !isValidTransition(request.status as PpiRequestStatus, "in_progress")
  ) {
    return { error: `Cannot start inspection from status: ${request.status}` };
  }

  if (request.status !== "in_progress") {
    const { error: reqError } = await supabase
      .from("ppi_requests")
      .update({ status: "in_progress" })
      .eq("id", requestId);

    if (reqError) return { error: reqError.message };
  }

  if (submission.status !== "in_progress") {
    const { error: subError } = await supabase
      .from("ppi_submissions")
      .update({ status: "in_progress" })
      .eq("id", submissionId);

    if (subError) return { error: subError.message };
  }

  return { success: true };
}

// ============================================================================
// saveAnswers — batch upsert answer values (called during inspection)
// ============================================================================

const saveAnswersSchema = z.object({
  submissionId: z.string().uuid(),
  answers: z.array(
    z.object({
      answerId: z.string().uuid(),
      value: z.string(),
    })
  ),
});

export async function saveAnswers(
  submissionId: string,
  answers: { answerId: string; value: string }[]
) {
  const parsed = saveAnswersSchema.safeParse({ submissionId, answers });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();

  // Update each answer individually (no batch upsert without conflict target on id)
  const updates = answers.map(({ answerId, value }) =>
    supabase
      .from("ppi_answers")
      .update({ answer_value: value })
      .eq("id", answerId)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  return { success: true };
}

// ============================================================================
// saveSectionNotes
// ============================================================================

export async function saveSectionNotes(sectionId: string, notes: string | null) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("ppi_sections")
    .update({ notes })
    .eq("id", sectionId);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================================
// markSectionComplete
// ============================================================================

export async function markSectionComplete(sectionId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("ppi_sections")
    .update({ completion_state: "completed" })
    .eq("id", sectionId);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================================
// updateSectionState — set in_progress when user starts answering
// ============================================================================

export async function updateSectionState(
  sectionId: string,
  state: "not_started" | "in_progress" | "completed"
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ppi_sections")
    .update({ completion_state: state })
    .eq("id", sectionId);

  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================================
// submitPpi — validate required answers, finalize submission
// ============================================================================

export async function submitPpi(submissionId: string) {
  const supabase = await createClient();

  // Load all answers for this submission to validate required fields
  const { data: sections } = await supabase
    .from("ppi_sections")
    .select("id, answers:ppi_answers(id, is_required, answer_value)")
    .eq("ppi_submission_id", submissionId);

  if (!sections) return { error: "Submission not found" };

  // Check required answers
  const missing: string[] = [];
  for (const section of sections) {
    for (const answer of section.answers ?? []) {
      if (answer.is_required && !answer.answer_value) {
        missing.push(answer.id);
      }
    }
  }

  if (missing.length > 0) {
    return {
      error: `${missing.length} required answer(s) are incomplete`,
      missingAnswerIds: missing,
    };
  }

  const now = new Date().toISOString();

  // Update submission
  const { data: sub, error: subError } = await supabase
    .from("ppi_submissions")
    .update({ status: "submitted", submitted_at: now })
    .eq("id", submissionId)
    .select("ppi_request_id")
    .single();

  if (subError || !sub) return { error: subError?.message ?? "Failed to submit" };

  // Update request status
  const { error: reqError } = await supabase
    .from("ppi_requests")
    .update({ status: "submitted" })
    .eq("id", sub.ppi_request_id);

  if (reqError) return { error: reqError.message };

  revalidatePath(`/dashboard/ppi/${sub.ppi_request_id}`);
  revalidatePath("/dashboard/ppi");
  revalidatePath("/tech/ppi");

  return { success: true, requestId: sub.ppi_request_id };
}

// ============================================================================
// resubmitPpi — deep-copy current submission to new version
// ============================================================================

export async function resubmitPpi(requestId: string) {
  const ctx = await getAuthProfile();
  if (!ctx) return { error: "Not authenticated" };
  const { id: profileId, supabase } = ctx;

  const { data: request } = await supabase
    .from("ppi_requests")
    .select("id, requester_id, performer_type")
    .eq("id", requestId)
    .single();

  if (!request) return { error: "Request not found" };

  // Get the current submission with all sections and answers
  const { data: currentSub } = await supabase
    .from("ppi_submissions")
    .select(
      `
      id, version, performer_id,
      sections:ppi_sections(
        id, section_type, notes, sort_order,
        answers:ppi_answers(id, prompt, answer_type, answer_value, options, is_required, sort_order),
        media:ppi_media(id, url, media_type, caption, captured_at, metadata)
      )
    `
    )
    .eq("ppi_request_id", requestId)
    .eq("is_current", true)
    .single();

  if (!currentSub) return { error: "No current submission found" };

  const isCurrentPerformer = currentSub.performer_id === profileId;
  const isSelfInspectionRequester =
    request.performer_type === "self" && request.requester_id === profileId;

  if (!isCurrentPerformer && !isSelfInspectionRequester) {
    return { error: "Only the inspection performer can edit this submission" };
  }

  // Mark the current submission as not current
  await supabase
    .from("ppi_submissions")
    .update({ is_current: false })
    .eq("id", currentSub.id);

  // Create a new submission
  const { data: newSub, error: newSubError } = await supabase
    .from("ppi_submissions")
    .insert({
      ppi_request_id: requestId,
      performer_id: currentSub.performer_id,
      version: currentSub.version + 1,
      is_current: true,
      status: "in_progress",
    })
    .select()
    .single();

  if (newSubError || !newSub) {
    return { error: newSubError?.message ?? "Failed to create new version" };
  }

  // Deep-copy sections, answers, and media
  for (const section of currentSub.sections ?? []) {
    const { data: newSection } = await supabase
      .from("ppi_sections")
      .insert({
        ppi_submission_id: newSub.id,
        section_type: section.section_type,
        completion_state: "not_started",
        notes: section.notes,
        sort_order: section.sort_order,
      })
      .select()
      .single();

    if (!newSection) continue;

    // Copy answers
    if (section.answers?.length) {
      const answerInserts = section.answers.map(
        (a: {
          prompt: string;
          answer_type: "text" | "yes_no" | "select" | "number";
          answer_value: string | null;
          options: Json | null;
          is_required: boolean;
          sort_order: number;
        }) => ({
          ppi_section_id: newSection.id,
          prompt: a.prompt,
          answer_type: a.answer_type,
          answer_value: a.answer_value,
          options: a.options as Json,
          is_required: a.is_required,
          sort_order: a.sort_order,
        })
      );
      await supabase.from("ppi_answers").insert(answerInserts);
    }

    // Copy media references
    if (section.media?.length) {
      const mediaInserts = section.media.map(
        (m: {
          url: string;
          media_type: string;
          caption: string | null;
          captured_at: string | null;
          metadata: Json | null;
        }) => ({
          ppi_section_id: newSection.id,
          url: m.url,
          media_type: m.media_type,
          caption: m.caption,
          captured_at: m.captured_at,
          metadata: m.metadata as Json,
        })
      );
      await supabase.from("ppi_media").insert(mediaInserts);
    }
  }

  // Update request status back to in_progress
  await supabase
    .from("ppi_requests")
    .update({ status: "in_progress" })
    .eq("id", requestId);

  // Audit log for resubmission
  const { insertAuditLog } = await import("@/features/outputs/actions");
  await insertAuditLog({
    actorId: profileId,
    action: "submission_resubmitted",
    targetType: "ppi_submission",
    targetId: newSub.id,
    metadata: {
      previousSubmissionId: currentSub.id,
      version: currentSub.version + 1,
    },
  });

  revalidatePath(`/dashboard/ppi/${requestId}`);
  revalidatePath("/dashboard/ppi");

  return { data: { submissionId: newSub.id } };
}

// ============================================================================
// attachMedia — insert a media record after successful R2 upload
// ============================================================================

const attachMediaSchema = z.object({
  ppi_section_id: z.string().uuid(),
  ppi_answer_id: z.string().uuid().optional(),
  url: z.string().url(),
  media_type: z.enum(["image", "video"]),
  caption: z.string().optional(),
  captured_at: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function attachMedia(data: {
  ppi_section_id: string;
  ppi_answer_id?: string;
  url: string;
  media_type: "image" | "video";
  caption?: string;
  captured_at?: string;
  metadata?: Record<string, unknown>;
}) {
  const parsed = attachMediaSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();

  const { data: media, error } = await supabase
    .from("ppi_media")
    .insert({
      ppi_section_id: parsed.data.ppi_section_id,
      ppi_answer_id: parsed.data.ppi_answer_id ?? null,
      url: parsed.data.url,
      media_type: parsed.data.media_type,
      caption: parsed.data.caption ?? null,
      captured_at: parsed.data.captured_at ?? null,
      metadata: (parsed.data.metadata ?? null) as Json | null,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data: media };
}

// ============================================================================
// updateRequestStatus — state-machine-guarded status transitions
// ============================================================================

export async function updateRequestStatus(
  requestId: string,
  newStatus: PpiRequestStatus
) {
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("ppi_requests")
    .select("status")
    .eq("id", requestId)
    .single();

  if (!request) return { error: "Request not found" };

  if (!isValidTransition(request.status as PpiRequestStatus, newStatus)) {
    return { error: `Invalid transition: ${request.status} → ${newStatus}` };
  }

  const { error } = await supabase
    .from("ppi_requests")
    .update({ status: newStatus })
    .eq("id", requestId);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/ppi/${requestId}`);
  revalidatePath(`/tech/ppi/${requestId}`);
  revalidatePath("/dashboard/ppi");
  revalidatePath("/tech/ppi");

  return { success: true };
}
