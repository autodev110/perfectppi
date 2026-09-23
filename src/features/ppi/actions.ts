"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getSectionOrder,
  VEHICLE_BASICS_ODOMETER_PROMPT,
  VEHICLE_BASICS_VIN_PROMPT,
  canonicalInspectionPrompt,
  isValidTransition,
} from "./constants";
import { catalogQuestions, type CatalogVersion } from "./inspection-catalog";
import {
  isStructuredAnswerType,
  parseObservation,
  requirementError,
  structuredPhotoRequired,
  validateObservation,
  type PerformerMode,
} from "./inspection-schema";
import {
  certifiedSubmitErrorMessage,
  databaseErrorCode,
  type SubmitCertificationInput,
} from "./certification";
import { seedCatalogVersion } from "./client-capability";
import type { AnswerType, InspectionScope, PpiRequestStatus, SectionType } from "@/types/enums";
import type { Database, Json } from "@/types/database";
import { syncPartnerLifecycle } from "@/features/partner/events";
import { isOwnedPrivateUploadReference, uploadedUrlSchema } from "@/features/uploads/url";
import { deleteStoredObjectOrQueue } from "@/features/uploads/cleanup";
import { inspectionAnswerValidationError } from "./answer-validation";
import { hasActiveCertifiedCredential } from "@/features/technicians/credentials";

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
  inspection_scope: z.enum(["complete", "dents_tires"]).default("complete"),
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
    inspection_scope,
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
      .select("id, profile_id")
      .eq("id", assigned_tech_profile_id)
      .single();

    if (!techProfile) return { error: "Technician not found" };

    assignedTechId = techProfile.profile_id;
    ppiType = (await hasActiveCertifiedCredential(techProfile.id))
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
      inspection_scope,
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
    .select("id, requester_id, assigned_tech_id, performer_type, inspection_scope")
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

  // Catalog 2 (typed observations + certification) for every client that can
  // render it; older native builds keep the original question set.
  const catalogVersion: CatalogVersion = await seedCatalogVersion();

  // Create the new submission
  const { data: submission, error: subError } = await supabase
    .from("ppi_submissions")
    .insert({
      ppi_request_id: requestId,
      performer_id: performerId,
      version: nextVersion,
      is_current: true,
      status: "draft",
      catalog_version: catalogVersion,
    })
    .select()
    .single();

  if (subError || !submission) {
    return { error: subError?.message ?? "Failed to create submission" };
  }

  // Seed sections
  const scope = (request.inspection_scope ?? "complete") as InspectionScope;
  const sectionInserts = getSectionOrder(scope).map((sectionType, index) => ({
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

  // Seed answers for each section. Every row carries its stable semantic key so
  // validation, rules and coverage never depend on prompt wording.
  const allAnswerInserts: {
    ppi_section_id: string;
    prompt: string;
    question_key: string;
    answer_type: AnswerType;
    options: string[] | null;
    is_required: boolean;
    requires_photo: boolean;
    photo_prompt: string | null;
    sort_order: number;
  }[] = [];

  for (const section of sections) {
    const questions = catalogQuestions(scope, section.section_type as SectionType, catalogVersion);
    questions.forEach((question, idx) => {
      allAnswerInserts.push({
        ppi_section_id: section.id,
        prompt: question.prompt,
        question_key: question.questionKey,
        answer_type: question.answerType,
        options: question.options ?? null,
        is_required: question.isRequired,
        requires_photo: question.requiresPhoto ?? false,
        photo_prompt: question.photoPrompt ?? null,
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

  await prefillKnownVehicleData(requestId, submission.id);

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
    .select("id, profile_id")
    .eq("id", techProfileId)
    .single();

  if (!techProfile) return { error: "Technician not found" };

  const ppiType = (await hasActiveCertifiedCredential(techProfile.id))
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

  await syncPartnerLifecycle(requestId, "accepted", {
    submissionId: submissionResult.submissionId,
  });

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

  await syncPartnerLifecycle(requestId, "in_progress", { submissionId });

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
      value: z.string().optional().default(""),
      /** Typed observation for catalog-2 structured answers; null clears it. */
      observation: z.unknown().optional(),
      deferred: z.boolean().optional(),
    })
  ).max(200),
});

export interface SaveAnswerInput {
  answerId: string;
  value?: string;
  observation?: unknown;
  deferred?: boolean;
}

export async function saveAnswers(submissionId: string, answers: SaveAnswerInput[]) {
  const parsed = saveAnswersSchema.safeParse({ submissionId, answers });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();

  // Every answer must belong to this submission; a stray id from another
  // inspection is refused instead of silently written through RLS.
  const answerIds = [...new Set(parsed.data.answers.map((answer) => answer.answerId))];
  if (answerIds.length === 0) return { success: true, invalid: [] as { answerId: string; error: string }[] };
  const { data: rows, error: rowsError } = await supabase
    .from("ppi_answers")
    .select("id, question_key, answer_type, section:ppi_sections!inner(ppi_submission_id)")
    .in("id", answerIds);
  if (rowsError) return { error: rowsError.message };
  const rowById = new Map(
    (rows ?? [])
      .filter((row) => (row.section as { ppi_submission_id: string } | null)?.ppi_submission_id === parsed.data.submissionId)
      .map((row) => [row.id, row]),
  );
  if (rowById.size !== answerIds.length) {
    return { error: "One or more answers do not belong to this inspection" };
  }

  const invalid: { answerId: string; error: string }[] = [];
  const now = new Date();

  // A value adopted from a photo reading must reference a reading of a photo
  // in this same inspection; otherwise it is an ordinary manual entry.
  const extractionIds = [...new Set(parsed.data.answers
    .map((answer) => (answer.observation as { source?: string; extraction_id?: string } | null | undefined))
    .filter((observation) => observation?.source === "confirmed_extraction" && observation.extraction_id)
    .map((observation) => observation!.extraction_id!))];
  const knownExtractions = new Set<string>();
  if (extractionIds.length) {
    const { data: extractions } = await supabase
      .from("ppi_media_extractions")
      .select("id, media:ppi_media!inner(section:ppi_sections!inner(ppi_submission_id))")
      .in("id", extractionIds);
    for (const extraction of extractions ?? []) {
      const media = extraction.media as { section: { ppi_submission_id: string } | null } | null;
      if (media?.section?.ppi_submission_id === parsed.data.submissionId) knownExtractions.add(extraction.id);
    }
  }

  const updates = parsed.data.answers.map(({ answerId, value, observation, deferred }) => {
    const row = rowById.get(answerId)!;
    const update: Database["public"]["Tables"]["ppi_answers"]["Update"] = {};

    if (isStructuredAnswerType(row.answer_type)) {
      if (observation === undefined) {
        // Only a deferral toggle; a structured answer never takes a raw string.
      } else if (observation === null) {
        update.observation = null;
      } else {
        const validation = validateObservation(row.question_key ?? "", observation, { inspectionDate: now });
        if (!validation.ok) {
          invalid.push({ answerId, error: validation.error });
          return null;
        }
        if (
          validation.observation.source === "confirmed_extraction"
          && !knownExtractions.has(validation.observation.extraction_id ?? "")
        ) {
          invalid.push({ answerId, error: "That photo reading is not part of this inspection." });
          return null;
        }
        update.observation = validation.observation as unknown as Json;
      }
      if (deferred === true) {
        update.deferred_at = now.toISOString();
      } else if (deferred === false || (observation !== undefined && observation !== null)) {
        update.deferred_at = null;
      }
    } else {
      if (observation !== undefined && observation !== null) {
        invalid.push({ answerId, error: "This question does not take a structured answer." });
        return null;
      }
      update.answer_value = value;
      if (deferred === true) {
        update.deferred_at = now.toISOString();
      } else if (deferred === false || value.trim() !== "") {
        update.deferred_at = null;
      }
    }

    if (Object.keys(update).length === 0) return null;
    return supabase.from("ppi_answers").update(update).eq("id", answerId);
  });

  const results = await Promise.all(updates.filter((update) => update !== null));
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return {
      error: databaseErrorCode(failed.error.message) === "submission_finalized"
        ? "This inspection was already submitted and can no longer be edited."
        : failed.error.message,
    };
  }
  if (invalid.length > 0) {
    return { error: invalid[0].error, invalid };
  }

  return { success: true, invalid };
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

export async function submitPpi(submissionId: string, certification: SubmitCertificationInput | null) {
  if (!z.string().uuid().safeParse(submissionId).success) return { error: "Invalid inspection" };
  if (!certification?.accepted) {
    return { error: certifiedSubmitErrorMessage("certification_required"), code: "certification_required" };
  }

  const supabase = await createClient();

  const { data: submission } = await supabase
    .from("ppi_submissions")
    .select("id, revision, request:ppi_requests!ppi_submissions_ppi_request_id_fkey(performer_type)")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return { error: "Submission not found" };
  const performerMode: PerformerMode =
    (submission.request as { performer_type?: string } | null)?.performer_type === "self" ? "self" : "technician";

  // Load all answers for this submission to validate required fields
  const { data: sections } = await supabase
    .from("ppi_sections")
    .select(
      "id, answers:ppi_answers(id, prompt, question_key, answer_type, options, is_required, requires_photo, answer_value, observation), media:ppi_media(ppi_answer_id, media_type)",
    )
    .eq("ppi_submission_id", submissionId);

  if (!sections) return { error: "Submission not found" };

  // Check required answers. The database repeats every check below inside the
  // certified transaction; these exist to return the exact question ids.
  const missing: string[] = [];
  for (const section of sections) {
    for (const answer of section.answers ?? []) {
      if (isStructuredAnswerType(answer.answer_type)) {
        if (requirementError(answer.question_key ?? "", parseObservation(answer.observation), {
          required: answer.is_required,
          performerMode,
        })) {
          missing.push(answer.id);
        }
        continue;
      }
      const options = Array.isArray(answer.options)
        ? answer.options.filter((option): option is string => typeof option === "string")
        : null;
      if (inspectionAnswerValidationError({
        prompt: answer.prompt,
        answerType: answer.answer_type,
        value: answer.answer_value,
        required: answer.is_required,
        options,
      })) {
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

  // Photo requirements: fixed per-question rules plus evidence the typed
  // answers imply (a tread reading, declared damage, the placard).
  const missingPhotos: string[] = [];
  for (const section of sections) {
    const photographedAnswerIds = new Set(
      (section.media ?? [])
        .filter((media) => media.media_type === "image")
        .map((media) => media.ppi_answer_id)
        .filter((id): id is string => Boolean(id)),
    );
    for (const answer of section.answers ?? []) {
      const needsPhoto = answer.requires_photo
        || structuredPhotoRequired(answer.question_key ?? "", parseObservation(answer.observation));
      if (!needsPhoto) continue;
      if (photographedAnswerIds.has(answer.id)) continue;
      missingPhotos.push(answer.id);
    }
  }

  if (missingPhotos.length > 0) {
    return {
      error: `${missingPhotos.length} question(s) still need a photo`,
      missingAnswerIds: missingPhotos,
    };
  }

  const { data: result, error: submitError } = await supabase.rpc("submit_ppi_certified", {
    p_submission_id: submissionId,
    p_expected_revision: certification.expectedRevision,
    p_text_version: certification.textVersion,
    p_accepted: certification.accepted,
    p_locale: certification.locale ?? "en-US",
  });
  if (submitError || !result) {
    const code = databaseErrorCode(submitError?.message);
    return { error: certifiedSubmitErrorMessage(code), code };
  }
  const requestId = (result as { request_id?: string }).request_id;
  if (!requestId) return { error: "Failed to submit" };

  if (!(result as { replayed?: boolean }).replayed) {
    await syncPartnerLifecycle(requestId, "submitted", { submissionId });
  }

  revalidatePath(`/dashboard/ppi/${requestId}`);
  revalidatePath("/dashboard/ppi");
  revalidatePath("/tech/ppi");

  return {
    success: true,
    requestId,
    certification: result as { certification_id: string; facts_hash: string; revision: number; certified_at: string },
  };
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
    .select("id, requester_id, performer_type, inspection_scope")
    .eq("id", requestId)
    .single();

  if (!request) return { error: "Request not found" };

  // Get the current submission with all sections and answers
  const { data: currentSub } = await supabase
    .from("ppi_submissions")
    .select(
      `
      id, version, performer_id, catalog_version,
      sections:ppi_sections(
        id, section_type, notes, sort_order,
        answers:ppi_answers(id, prompt, question_key, answer_type, answer_value, observation, options, is_required, requires_photo, photo_prompt, sort_order, deferred_at),
        media:ppi_media(id, ppi_answer_id, url, media_type, caption, captured_at, metadata)
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
      // A revision keeps the question set it was answered with; certification
      // is never copied and must be given again for the new revision.
      catalog_version: currentSub.catalog_version,
    })
    .select()
    .single();

  if (newSubError || !newSub) {
    return { error: newSubError?.message ?? "Failed to create new version" };
  }

  // Deep-copy sections, answers, and media
  for (const section of currentSub.sections ?? []) {
    const canonicalSectionIndex = getSectionOrder(
      (request.inspection_scope ?? "complete") as InspectionScope,
    ).indexOf(section.section_type as SectionType);
    const { data: newSection } = await supabase
      .from("ppi_sections")
      .insert({
        ppi_submission_id: newSub.id,
        section_type: section.section_type,
        completion_state: "not_started",
        notes: section.notes,
        sort_order:
          canonicalSectionIndex >= 0 ? canonicalSectionIndex + 1 : section.sort_order,
      })
      .select()
      .single();

    if (!newSection) continue;

    // Copy answers. The new rows get new ids, so keep an old→new map: media
    // rows point at an answer, and a revision that drops that pointer turns
    // every per-question photo into a loose section-level one.
    const answerIdRemap = new Map<string, string>();

    if (section.answers?.length) {
      const orderedAnswers = [...section.answers].sort(
        (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order,
      );
      const answerInserts = orderedAnswers.map(
        (a: {
          prompt: string;
          question_key: string | null;
          answer_type: AnswerType;
          answer_value: string | null;
          observation: Json | null;
          deferred_at: string | null;
          options: Json | null;
          is_required: boolean;
          requires_photo: boolean;
          photo_prompt: string | null;
          sort_order: number;
        }) => ({
          ppi_section_id: newSection.id,
          prompt: canonicalInspectionPrompt(a.prompt),
          question_key: a.question_key,
          answer_type: a.answer_type,
          // Structured rows derive answer_value from the observation in the DB.
          answer_value: isStructuredAnswerType(a.answer_type) ? null : a.answer_value,
          observation: a.observation,
          deferred_at: a.deferred_at,
          options: a.options as Json,
          is_required: a.is_required,
          requires_photo: a.requires_photo,
          photo_prompt: a.photo_prompt,
          sort_order: a.sort_order,
        })
      );
      const { data: insertedAnswers } = await supabase
        .from("ppi_answers")
        .insert(answerInserts)
        .select("id, sort_order");

      // Insert order is not guaranteed on the way back, so pair the two sides
      // on sort_order, which is unique within a section and copied verbatim.
      const newIdBySortOrder = new Map(
        (insertedAnswers ?? []).map((a) => [a.sort_order, a.id]),
      );
      for (const old of orderedAnswers as { id: string; sort_order: number }[]) {
        const newId = newIdBySortOrder.get(old.sort_order);
        if (newId) answerIdRemap.set(old.id, newId);
      }
    }

    // Copy media references
    if (section.media?.length) {
      const mediaInserts = section.media.map(
        (m: {
          ppi_answer_id: string | null;
          url: string;
          media_type: string;
          caption: string | null;
          captured_at: string | null;
          metadata: Json | null;
        }) => ({
          ppi_section_id: newSection.id,
          ppi_answer_id: m.ppi_answer_id
            ? answerIdRemap.get(m.ppi_answer_id) ?? null
            : null,
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

  const { data: currentObdSnapshots } = await supabase
    .from("obd_snapshots")
    .select(
      "captured_by, vin, adapter_name, mil_on, stored_dtc_count, stored_dtcs, pending_dtcs, supported_pids, monitor_status, live_readings, raw_payload, raw_transcript, started_at, completed_at",
    )
    .eq("ppi_submission_id", currentSub.id)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (currentObdSnapshots?.length) {
    const snapshot = currentObdSnapshots[0];
    await supabase.from("obd_snapshots").insert({
      ppi_submission_id: newSub.id,
      captured_by: snapshot.captured_by,
      vin: snapshot.vin,
      adapter_name: snapshot.adapter_name,
      mil_on: snapshot.mil_on,
      stored_dtc_count: snapshot.stored_dtc_count,
      stored_dtcs: snapshot.stored_dtcs,
      pending_dtcs: snapshot.pending_dtcs,
      supported_pids: snapshot.supported_pids,
      monitor_status: snapshot.monitor_status as Json | null,
      live_readings: snapshot.live_readings as Json,
      raw_payload: snapshot.raw_payload as Json,
      raw_transcript: snapshot.raw_transcript as Json,
      started_at: snapshot.started_at,
      completed_at: snapshot.completed_at,
      is_current: true,
    });
  }

  // Update request status back to in_progress
  await supabase
    .from("ppi_requests")
    .update({ status: "in_progress" })
    .eq("id", requestId);

  // The partner integration tracks the new version, so its manifest and
  // delivery state follow the resubmission rather than the abandoned one.
  await syncPartnerLifecycle(requestId, "in_progress", { submissionId: newSub.id });

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
  url: uploadedUrlSchema,
  media_type: z.enum(["image", "video"]),
  caption: z.string().optional(),
  captured_at: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function attachMedia(submissionId: string, data: unknown) {
  const parsedSubmissionId = z.string().uuid().safeParse(submissionId);
  if (!parsedSubmissionId.success) return { error: "Invalid inspection" };

  const parsed = attachMediaSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const ctx = await getAuthProfile();
  if (!ctx) return { error: "Not authenticated" };
  const { supabase } = ctx;
  const { data: section } = await supabase
    .from("ppi_sections")
    .select("ppi_submission_id")
    .eq("id", parsed.data.ppi_section_id)
    .eq("ppi_submission_id", parsedSubmissionId.data)
    .maybeSingle();
  if (!section) return { error: "Inspection section not found" };

  if (parsed.data.ppi_answer_id) {
    const { data: answer } = await supabase
      .from("ppi_answers")
      .select("id")
      .eq("id", parsed.data.ppi_answer_id)
      .eq("ppi_section_id", parsed.data.ppi_section_id)
      .maybeSingle();
    if (!answer) return { error: "Inspection answer does not belong to this section" };
  }

  if (!isOwnedPrivateUploadReference(
    parsed.data.url,
    "ppi_media",
    ctx.id,
    section.ppi_submission_id,
  )) return { error: "Inspection upload is invalid" };

  // Upload and attachment are separate requests. If the attachment committed
  // but its response was lost, return that row when the retained client retries
  // instead of inserting a duplicate inspection photo.
  const { data: existing, error: existingError } = await supabase
    .from("ppi_media")
    .select("*")
    .eq("url", parsed.data.url)
    .limit(1)
    .maybeSingle();
  if (existingError) return { error: existingError.message };
  if (existing) {
    const sameAttachment = existing.ppi_section_id === parsed.data.ppi_section_id
      && existing.ppi_answer_id === (parsed.data.ppi_answer_id ?? null)
      && existing.media_type === parsed.data.media_type;
    if (!sameAttachment) return { error: "This upload is already attached elsewhere" };
    return { data: existing };
  }

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

/**
 * Removes an inspection photo. Authorization rides on the user-scoped client:
 * the ppi_media DELETE policy already restricts this to the inspection's own
 * technician/requester, so a stray id from another submission deletes nothing.
 */
export async function deletePpiMedia(mediaId: string) {
  if (!z.string().uuid().safeParse(mediaId).success) {
    return { error: "Invalid photo" };
  }

  const supabase = await createClient();

  const { data: media, error: lookupError } = await supabase
    .from("ppi_media")
    .select("id, url")
    .eq("id", mediaId)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (!media) return { error: "Photo not found or not yours to delete" };

  const { data: deleted, error } = await supabase
    .from("ppi_media")
    .delete()
    .eq("id", mediaId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!deleted) return { error: "Photo not found or not yours to delete" };

  await deleteStoredObjectOrQueue(media.url, "inspection_media_deleted");

  return { data: { id: deleted.id } };
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

  await syncPartnerLifecycle(requestId, newStatus);

  revalidatePath(`/dashboard/ppi/${requestId}`);
  revalidatePath(`/tech/ppi/${requestId}`);
  revalidatePath("/dashboard/ppi");
  revalidatePath("/tech/ppi");

  return { success: true };
}


// ============================================================================
// prefillKnownVehicleData
//
// A partner inspection arrives with the VIN and odometer already recorded in
// the immutable snapshot DealerSpace sent, so asking the technician to key them
// in again is redundant work that can only introduce a disagreement with the
// record DealerSpace will later import.
//
// Deliberately narrow:
//
//   * Only the DealerSpace snapshot is used as a source. The OBD scan is NOT,
//     for two different reasons — see below.
//   * Values are prefilled, never locked. A genuine correction (the snapshot is
//     stale, the odometer was misread) is still one edit away.
//   * The odometer photo requirement is untouched: the number is a convenience,
//     the photo is the evidence.
//   * Only empty answers are written, so this can never clobber work in
//     progress on a resubmission.
//
// Why not prefill from OBD:
//
//   VIN — a VIN read from the ECU that disagrees with the paperwork is a
//   finding (wrong car, cloned plate, swapped ECU), not a better value. Writing
//   it into the answer would erase the very discrepancy the report is meant to
//   surface. The OBD VIN stays in obd_snapshots, and the report generator is
//   already instructed to flag a mismatch as a major identity finding.
//
//   Odometer — OBD-II has no reliable standard odometer PID. The distance
//   values that do exist (0x21 distance with MIL on, 0x31 distance since codes
//   cleared) are not the odometer and are frequently near zero on a car whose
//   codes were recently cleared. Prefilling from them would look authoritative
//   and be wrong.
// ============================================================================

async function prefillKnownVehicleData(requestId: string, submissionId: string) {
  try {
    const supabase = await createClient();

    const [{ data: ref }, { data: request }] = await Promise.all([
      // DealerSpace's immutable intake snapshot remains authoritative for
      // partner-created inspections.
      supabase
        .from("external_inspection_refs")
        .select("vehicle_snapshot")
        .eq("ppi_request_id", requestId)
        .maybeSingle(),
      // Consumer and technician inspections use the vehicle selected during
      // intake, which already contains the confirmed VIN and mileage.
      supabase
        .from("ppi_requests")
        .select("vehicle:vehicles!ppi_requests_vehicle_id_fkey(vin, mileage)")
        .eq("id", requestId)
        .maybeSingle(),
    ]);

    const snapshot = ref?.vehicle_snapshot as
      | { vin?: string | null; mileage?: number | null }
      | null;
    const selectedVehicle = request?.vehicle as
      | { vin: string | null; mileage: number | null }
      | null;
    const vin = snapshot?.vin ?? selectedVehicle?.vin;
    const mileage = snapshot?.mileage ?? selectedVehicle?.mileage;

    const prefills: { prompt: string; value: string }[] = [];
    if (vin) prefills.push({ prompt: VEHICLE_BASICS_VIN_PROMPT, value: vin });
    if (typeof mileage === "number") {
      prefills.push({ prompt: VEHICLE_BASICS_ODOMETER_PROMPT, value: String(mileage) });
    }
    if (prefills.length === 0) return;

    const { data: sections } = await supabase
      .from("ppi_sections")
      .select("id")
      .eq("ppi_submission_id", submissionId)
      .eq("section_type", "vehicle_basics");

    const sectionId = sections?.[0]?.id;
    if (!sectionId) return;

    for (const prefill of prefills) {
      await supabase
        .from("ppi_answers")
        .update({ answer_value: prefill.value, deferred_at: null })
        .eq("ppi_section_id", sectionId)
        .eq("prompt", prefill.prompt)
        .is("answer_value", null);
    }
  } catch (error) {
    // Convenience only. A prefill failure must never stop an inspection from
    // being created — the technician can still enter both values by hand.
    console.error("ppi: vehicle data prefill failed", error);
  }
}
