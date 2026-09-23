import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getObjectFromStoredUrl,
  isPrivateR2Configured,
  isStoredObjectConfigured,
  privateStorageReference,
  uploadPrivateObject,
} from "@/lib/storage/r2";
import { SECTION_LABELS } from "@/features/ppi/constants";
import { evaluateInspection } from "@/features/ppi/inspection-rules";
import { buildInspectionReport, type InspectionReportV2 } from "@/features/ppi/inspection-report";
import {
  DEFECT_LABELS,
  REASON_LABELS,
  isStructuredAnswerType,
  observationSummary,
  parseObservation,
  type ExceptionReasonCode,
} from "@/features/ppi/inspection-schema";
import { APPENDIX_TEMPLATE_VERSION, renderEvidenceAppendixPdf, type AppendixViewModel } from "@/lib/pdf/inspection-report/appendix";
import { formatReportDate, reportReference } from "@/lib/pdf/inspection-report/view-model";
import type { StatusName } from "@/lib/pdf/inspection-report/canvas";
import { HISTORICAL_CERTIFICATION_NOTE } from "@/features/ppi/certification";
import { matchesCertifiedContent, shortHash } from "@/features/ppi/media-content";
import type { Json } from "@/types/database";
import type { StandardizedContent } from "@/types/api";
import type { InspectionScope, SectionType } from "@/types/enums";
import { REPORT_TIME_ZONE, buildFactsForReport, type CertifiedSnapshot } from "./report-v2";

// ============================================================================
// Optional photo evidence appendix exports (05-developer-handoff.md §10).
//
// A separate PDF per output version with every finding and every uploaded
// photo of the frozen inspection. It is requested explicitly, generated
// lazily, and has its own status and retries; it never changes the main PDF
// or the four partner artifacts, and it is never exposed to share, partner or
// marketplace routes.
// ============================================================================

export const APPENDIX_LOCALE = "en-US";
const LEASE_SECONDS = 600;
const IMAGE_FETCH_CONCURRENCY = 4;

export type AppendixStatus = "not_requested" | "queued" | "running" | "ready" | "incomplete" | "retryable_failure" | "failed";

export interface AppendixStatusView {
  status: AppendixStatus;
  export_id: string | null;
  photo_count_expected: number | null;
  photo_count_rendered: number | null;
  missing_count: number;
  page_count: number | null;
  error: string | null;
  updated_at: string | null;
}

type ExportRow = {
  id: string;
  status: string;
  photo_count_expected: number | null;
  photo_count_rendered: number | null;
  missing_media: Json;
  page_count: number | null;
  last_error: Json | null;
  updated_at: string;
};

export function statusView(row: ExportRow | null): AppendixStatusView {
  if (!row) {
    return { status: "not_requested", export_id: null, photo_count_expected: null, photo_count_rendered: null, missing_count: 0, page_count: null, error: null, updated_at: null };
  }
  const missing = Array.isArray(row.missing_media) ? row.missing_media.length : 0;
  const error = row.last_error && typeof row.last_error === "object" && !Array.isArray(row.last_error)
    ? String((row.last_error as { message?: string }).message ?? "")
    : null;
  return {
    status: row.status as AppendixStatus,
    export_id: row.id,
    photo_count_expected: row.photo_count_expected,
    photo_count_rendered: row.photo_count_rendered,
    missing_count: missing,
    page_count: row.page_count,
    error: error || null,
    updated_at: row.updated_at,
  };
}

/**
 * Idempotent request for one output version's appendix. The caller has
 * already authorized the requester against the output.
 */
export async function requestEvidenceAppendix(params: {
  outputId: string;
  requesterId: string;
  retry?: boolean;
}): Promise<{ row: ExportRow; created: boolean }> {
  const admin = createAdminClient();
  const { data: output } = await admin
    .from("standardized_outputs")
    .select("id, ppi_submission_id, version")
    .eq("id", params.outputId)
    .single();
  if (!output) throw new Error("Report not found");

  const { data: certification } = await admin
    .from("ppi_submission_certifications")
    .select("facts_hash, media_manifest_hash")
    .eq("ppi_submission_id", output.ppi_submission_id)
    .maybeSingle();

  const key = {
    ppi_submission_id: output.ppi_submission_id,
    output_version: output.version,
    export_type: "evidence_appendix",
    template_version: APPENDIX_TEMPLATE_VERSION,
    locale: APPENDIX_LOCALE,
  };
  const { data: existing } = await admin
    .from("inspection_output_exports")
    .select("*")
    .match(key)
    .maybeSingle();

  if (existing) {
    const retryable = ["failed", "incomplete", "retryable_failure"].includes(existing.status);
    if (params.retry && retryable) {
      const { data: reset } = await admin
        .from("inspection_output_exports")
        .update({ status: "queued", next_attempt_at: new Date().toISOString(), attempt_count: 0, last_error: null })
        .eq("id", existing.id)
        .in("status", ["failed", "incomplete", "retryable_failure"])
        .select("*")
        .single();
      return { row: (reset ?? existing) as ExportRow, created: false };
    }
    return { row: existing as ExportRow, created: false };
  }

  const { data: inserted, error } = await admin
    .from("inspection_output_exports")
    .insert({
      ...key,
      standardized_output_id: output.id,
      facts_hash: certification?.facts_hash ?? null,
      media_manifest_hash: certification?.media_manifest_hash ?? null,
      requested_by: params.requesterId,
    })
    .select("*")
    .single();
  if (error || !inserted) {
    // A concurrent request created it first.
    const { data: raced } = await admin.from("inspection_output_exports").select("*").match(key).single();
    if (!raced) throw new Error(error?.message ?? "Could not request the appendix");
    return { row: raced as ExportRow, created: false };
  }
  return { row: inserted as ExportRow, created: true };
}

interface ManifestEntry {
  id: string;
  section_id: string;
  answer_id: string | null;
  storage_reference: string;
  media_type: string;
  caption: string | null;
  captured_at: string | null;
  uploaded_at: string | null;
  sha256?: string | null;
  byte_size?: number | null;
}

async function prepareImage(entry: ManifestEntry): Promise<{ jpeg: Uint8Array; width: number; height: number } | { error: string }> {
  if (!isStoredObjectConfigured(entry.storage_reference)) return { error: "Stored photo location is not available." };
  try {
    const { bytes } = await getObjectFromStoredUrl(entry.storage_reference, { maxBytes: 40 * 1024 * 1024 });
    // Print only the certified bytes: a changed object is shown as unavailable
    // rather than silently substituted.
    if (matchesCertifiedContent(bytes, entry) === "mismatch") {
      return { error: "The stored photo does not match the certified copy (content hash differs)." };
    }
    // Upright from EXIF, bounded for print, re-encoded as JPEG so every upload
    // format (HEIC, PNG, WebP) embeds the same way. The original stays in storage.
    const { data, info } = await sharp(Buffer.from(bytes), { failOn: "none" })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: new Uint8Array(data), width: info.width, height: info.height };
  } catch (error) {
    return { error: error instanceof Error && /exceeds/.test(error.message) ? "The photo is larger than the export limit." : "The photo could not be retrieved or decoded." };
  }
}

function observationDetail(questionKey: string | null, observation: unknown, fallback: string | null): string {
  const doc = parseObservation(observation);
  if (!doc || !questionKey) return fallback?.trim() || "Not answered";
  const parts = [observationSummary(questionKey, doc)];
  if (doc.state !== "observed" && doc.reason?.explanation) parts.push(`Reason detail: ${doc.reason.explanation}`);
  const value = (doc.value ?? {}) as Record<string, unknown>;
  const defects = (value.defects as { type: string; note?: string | null; certainty?: string; location?: string; severity?: string }[] | undefined) ?? [];
  for (const defect of defects) {
    const bits = [DEFECT_LABELS[defect.type] ?? defect.type, defect.location, defect.severity, defect.certainty === "suspected" ? "suspected" : null]
      .filter(Boolean)
      .join(", ");
    parts.push(defect.note ? `${bits} — inspector note: “${defect.note}”` : bits);
  }
  const positions = value.positions as Record<string, string> | undefined;
  if (positions) parts.push(`Readings: ${Object.entries(positions).map(([position, reading]) => `${position} ${reading}`).join(", ")} (${value.unit === "mm" ? "mm" : "/32 in"})`);
  if (value.method) parts.push(`Method: ${String(value.method).replace(/_/g, " ")}`);
  if (value.pressure_loss) parts.push(`Pressure loss: ${String(value.pressure_loss).replace(/_/g, " ")}`);
  if (value.raw) parts.push(`Sidewall text as entered: ${value.raw}`);
  if (value.documented_alternative) parts.push(`Documented alternative: ${value.documented_alternative}`);
  if (doc.evidence_exception) {
    parts.push(`Photo not taken: ${REASON_LABELS[doc.evidence_exception.code as ExceptionReasonCode] ?? doc.evidence_exception.code}${doc.evidence_exception.explanation ? ` (${doc.evidence_exception.explanation})` : ""}`);
  }
  if (doc.source === "confirmed_extraction") parts.push("Values confirmed by the inspector from a photo reading");
  return parts.filter(Boolean).join(" · ");
}

function actionStatus(action: string): StatusName {
  return action === "urgent" ? "urgent" : action === "service_recommended" ? "service" : action === "monitor" ? "monitor" : "checked";
}

export async function processEvidenceAppendixExport(exportId: string, workerId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: job } = await admin.from("inspection_output_exports").select("*").eq("id", exportId).single();
  if (!job) return;

  const fail = async (message: string, retryable: boolean) => {
    const exhausted = !retryable || job.attempt_count >= job.max_attempts;
    await admin
      .from("inspection_output_exports")
      .update({
        status: exhausted ? "failed" : "retryable_failure",
        next_attempt_at: new Date(Date.now() + Math.min(30 * 60_000, 60_000 * 2 ** job.attempt_count)).toISOString(),
        last_error: { message, at: new Date().toISOString(), attempt: job.attempt_count },
        locked_by: null,
        lock_expires_at: null,
      })
      .eq("id", exportId)
      .eq("locked_by", workerId);
  };

  try {
    if (!isPrivateR2Configured()) {
      await fail("Private storage is not configured.", false);
      return;
    }
    const { data: output } = await admin
      .from("standardized_outputs")
      .select("id, structured_content, version, ppi_submission_id")
      .eq("id", job.standardized_output_id)
      .single();
    if (!output) {
      await fail("Report not found.", false);
      return;
    }
    const { data: submission } = await admin
      .from("ppi_submissions")
      .select(`
        id, version, submitted_at, catalog_version, revision, ppi_request_id,
        request:ppi_requests!ppi_submissions_ppi_request_id_fkey(id, inspection_scope, performer_type, requester_id, requesting_organization_id,
          vehicle:vehicles(year, make, model, trim, vin, mileage)),
        performer:profiles!ppi_submissions_performer_id_fkey(display_name),
        sections:ppi_sections(id, section_type, notes, sort_order,
          answers:ppi_answers(id, prompt, question_key, answer_type, answer_value, observation, is_required, sort_order),
          media:ppi_media(id, ppi_answer_id, url, media_type, caption, captured_at, uploaded_at))
      `)
      .eq("id", output.ppi_submission_id)
      .single();
    if (!submission) {
      await fail("Inspection not found.", false);
      return;
    }
    const request = submission.request as unknown as {
      id: string;
      inspection_scope: InspectionScope | null;
      performer_type: string;
      requester_id: string | null;
      requesting_organization_id: string | null;
      vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null; vin: string | null; mileage: number | null } | null;
    };
    const { data: certificationRow } = await admin
      .from("ppi_submission_certifications")
      .select("facts_hash, certified_at, certification_text, text_version, performer_mode, facts_snapshot, media_manifest")
      .eq("ppi_submission_id", submission.id)
      .maybeSingle();
    const certification = certificationRow as unknown as CertifiedSnapshot | null;

    const sections = [...(submission.sections ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const sectionById = new Map(sections.map((section) => [section.id, section]));
    const liveAnswers = sections.flatMap((section) => (section.answers ?? []).map((answer) => ({ ...answer, section_id: section.id })));

    // The frozen manifest defines exactly which uploads belong to this version.
    const manifest: ManifestEntry[] = certification?.media_manifest ?? sections.flatMap((section) =>
      [...(section.media ?? [])]
        .sort((a, b) => (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? "") || a.id.localeCompare(b.id))
        .map((media) => ({
          id: media.id,
          section_id: section.id,
          answer_id: media.ppi_answer_id,
          storage_reference: media.url,
          media_type: media.media_type,
          caption: media.caption,
          captured_at: media.captured_at,
          uploaded_at: media.uploaded_at,
        })),
    );
    const snapshotAnswers = certification?.facts_snapshot.answers ?? liveAnswers.map((answer) => ({ ...answer }));
    const answerById = new Map(snapshotAnswers.map((answer) => [answer.id, answer]));
    const snapshotSections = certification?.facts_snapshot.sections ?? sections.map((section) => ({ id: section.id, section_type: section.section_type, notes: section.notes, sort_order: section.sort_order }));
    const sectionTypeById = new Map(snapshotSections.map((section) => [section.id, section.section_type]));

    // Report: the one stored with this output version, or a deterministic
    // assembly for outputs created before the redesign.
    const content = output.structured_content as unknown as StandardizedContent;
    let report: InspectionReportV2 | undefined = content.report_v2;
    if (!report) {
      const facts = buildFactsForReport({
        scope: request.inspection_scope ?? "complete",
        catalogVersion: submission.catalog_version ?? 1,
        performerMode: request.performer_type === "self" ? "self" : "technician",
        inspectorName: (submission.performer as { display_name?: string | null } | null)?.display_name ?? null,
        submission: { id: submission.id, version: submission.version, submitted_at: submission.submitted_at, revision: submission.revision },
        vehicle: { ...(request.vehicle ?? { year: null, make: null, model: null, trim: null, vin: null, mileage: null }), mileage_unit: "mi", body_class: null },
        sections: sections.map((section) => ({
          section_type: section.section_type,
          notes: section.notes,
          answers: section.answers ?? [],
          media: section.media ?? [],
        })),
        certification,
        diagnostics: null,
        generatedAt: new Date().toISOString(),
      });
      report = buildInspectionReport({
        facts,
        assessment: evaluateInspection(facts),
        factsHash: certification?.facts_hash ?? null,
        generatedAt: new Date().toISOString(),
        timeZone: REPORT_TIME_ZONE,
      });
    }

    const evidenceNumber = new Map(manifest.map((entry, index) => [entry.id, `E${String(index + 1).padStart(2, "0")}`]));
    const findingsWithRefs = [...report.assessment.findings, ...report.model_suggestions.map((suggestion, index) => ({ ...suggestion, ref: `R${index + 1}` }))];

    // Fetch and normalize images in small batches to bound memory.
    const images = new Map<string, { jpeg: Uint8Array; width: number; height: number } | { error: string }>();
    const imageEntries = manifest.filter((entry) => entry.media_type === "image");
    for (let start = 0; start < imageEntries.length; start += IMAGE_FETCH_CONCURRENCY) {
      const batch = imageEntries.slice(start, start + IMAGE_FETCH_CONCURRENCY);
      const prepared = await Promise.all(batch.map((entry) => prepareImage(entry)));
      batch.forEach((entry, index) => images.set(entry.id, prepared[index]));
      await admin
        .from("inspection_output_exports")
        .update({ lock_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(), photo_count_expected: imageEntries.length })
        .eq("id", exportId)
        .eq("locked_by", workerId);
    }

    const { data: extractions } = imageEntries.length
      ? await admin.from("ppi_media_extractions").select("ppi_media_id, target, status").in("ppi_media_id", imageEntries.map((entry) => entry.id))
      : { data: [] as { ppi_media_id: string; target: string; status: string }[] };
    const extractionByMedia = new Map<string, string[]>();
    for (const extraction of extractions ?? []) {
      const list = extractionByMedia.get(extraction.ppi_media_id) ?? [];
      list.push(`${extraction.target.replace("tire_", "").replace("_", " ")} reading ${extraction.status}`);
      extractionByMedia.set(extraction.ppi_media_id, list);
    }

    const tz = report.time_zone;
    const facts = report.facts;
    const vehicleLabel = [facts.vehicle.year, facts.vehicle.make, facts.vehicle.model, facts.vehicle.trim].filter(Boolean).join(" ") || "Vehicle not recorded";
    const sectionLabel = (sectionId: string | null | undefined) =>
      SECTION_LABELS[(sectionTypeById.get(sectionId ?? "") ?? sectionById.get(sectionId ?? "")?.section_type) as SectionType] ?? "Inspection";

    const vm: AppendixViewModel = {
      report_ref: reportReference(submission.id, output.version),
      vehicle: vehicleLabel,
      date: formatReportDate(facts.submission.submitted_at, tz),
      inspector: `${facts.inspector.name?.trim() || "Inspector"} | ${facts.inspector.mode === "self" ? "Self-inspector" : "Technician"}`,
      scope_label: facts.scope === "dents_tires" ? "Dents & Tires (tires, wheels and in-scope body panels)" : "Complete Inspection",
      certification_line: facts.certification
        ? `Certified by the inspector on ${formatReportDate(facts.certification.certified_at, tz, true)} (${facts.certification.text_version})`
        : HISTORICAL_CERTIFICATION_NOTE,
      generated_line: formatReportDate(new Date().toISOString(), tz, true),
      findings: [
        ...findingsWithRefs.map((finding) => ({
          ref: finding.ref,
          status: finding.action === "none" ? ("unknown" as StatusName) : actionStatus(finding.action),
          title: finding.title,
          text: [
            finding.observation,
            finding.significance,
            finding.next_step ? `Next step: ${finding.next_step}` : "",
            finding.certainty !== "confirmed" ? `Certainty: ${finding.certainty.replace(/_/g, " ")}.` : "",
            finding.review_state === "needs_review" ? "Flagged for review; not a confirmed finding." : "",
            finding.evidence_ids.length ? `Evidence: ${finding.evidence_ids.map((id) => evidenceNumber.get(id) ?? id).join(", ")}.` : "No photo linked.",
          ].filter(Boolean).join(" "),
        })),
        ...report.assessment.limitations.map((limitation, index) => ({
          ref: `L${index + 1}`,
          status: "unknown" as StatusName,
          title: "Limitation",
          text: limitation.text,
        })),
      ],
      answers: snapshotAnswers
        .slice()
        .sort((a, b) => {
          const sectionOrder = (id: string) => snapshotSections.find((section) => section.id === id)?.sort_order ?? 0;
          return sectionOrder(a.section_id) - sectionOrder(b.section_id) || a.sort_order - b.sort_order;
        })
        .map((answer) => ({
          section: sectionLabel(answer.section_id),
          prompt: answer.prompt,
          value: isStructuredAnswerType(answer.answer_type)
            ? observationDetail(answer.question_key, answer.observation, answer.answer_value)
            : answer.answer_value?.trim() || "Not answered",
        })),
      notes: snapshotSections
        .filter((section) => section.notes?.trim())
        .map((section) => ({ section: sectionLabel(section.id), text: section.notes ?? "" })),
      photos: imageEntries.map((entry) => {
        const answer = entry.answer_id ? answerById.get(entry.answer_id) : undefined;
        const refs = findingsWithRefs.filter((finding) => finding.evidence_ids.includes(entry.id)).map((finding) => finding.ref);
        const prepared = images.get(entry.id);
        return {
          evidence_id: evidenceNumber.get(entry.id) ?? entry.id,
          media_id: entry.id,
          title: answer?.prompt ?? `${sectionLabel(entry.section_id)} photo (not linked to a question)`,
          association: [refs.length ? refs.join(", ") : "No linked finding", answer?.question_key ?? "unlinked upload", sectionLabel(entry.section_id)].join(" | "),
          caption: entry.caption?.trim() ? `Inspector caption: ${entry.caption.trim()}` : "No caption recorded.",
          provenance: [
            entry.uploaded_at ? `Uploaded ${formatReportDate(entry.uploaded_at, tz, true)}` : null,
            entry.captured_at ? `device-reported capture time ${formatReportDate(entry.captured_at, tz, true)}` : null,
            extractionByMedia.get(entry.id)?.join(", ") ?? "Not analyzed individually",
            `Media ID ${entry.id}`,
            entry.sha256 ? `SHA-256 ${shortHash(entry.sha256)}` : null,
          ].filter(Boolean).join(" · "),
          image: prepared && "jpeg" in prepared ? prepared : null,
          unavailable_reason: prepared && "error" in prepared ? prepared.error : null,
        };
      }),
      other_media: manifest
        .filter((entry) => entry.media_type !== "image")
        .map((entry) => ({
          evidence_id: evidenceNumber.get(entry.id) ?? entry.id,
          media_id: entry.id,
          type: entry.media_type === "video" ? "Video" : entry.media_type,
          association: sectionLabel(entry.section_id),
        })),
    };

    const rendered = await renderEvidenceAppendixPdf(vm);

    // Inclusion audit: every manifest photo appears (as an image or an explicit
    // placeholder) and every finding is present.
    const accounted = new Set([...rendered.renderedPhotoIds, ...rendered.placeholderPhotoIds]);
    const unaccounted = imageEntries.filter((entry) => !accounted.has(entry.id));
    if (unaccounted.length) {
      await fail(`Inclusion audit failed: ${unaccounted.length} photo(s) missing from the render.`, true);
      return;
    }

    const sha = createHash("sha256").update(rendered.bytes).digest("hex");
    const { data: requestRow } = await admin.from("ppi_requests").select("requester_id, requesting_organization_id").eq("id", request.id).single();
    const owner = requestRow?.requesting_organization_id ?? requestRow?.requester_id ?? "unowned";
    const key = `inspection_exports/${owner}/${submission.id}/v${output.version}/evidence-appendix-${sha}.pdf`;
    await uploadPrivateObject({ key, body: rendered.bytes, contentType: "application/pdf" });

    const missing = rendered.placeholderPhotoIds.map((id) => ({
      media_id: id,
      evidence_id: evidenceNumber.get(id),
      reason: vm.photos.find((photo) => photo.media_id === id)?.unavailable_reason ?? "unavailable",
    }));
    await admin
      .from("inspection_output_exports")
      .update({
        status: missing.length ? "incomplete" : "ready",
        storage_key: privateStorageReference(key),
        sha256: sha,
        size_bytes: rendered.bytes.byteLength,
        page_count: rendered.pageCount,
        photo_count_expected: imageEntries.length,
        photo_count_rendered: rendered.renderedPhotoIds.length,
        finding_count: vm.findings.length,
        missing_media: missing as unknown as Json,
        last_error: null,
        completed_at: new Date().toISOString(),
        locked_by: null,
        lock_expires_at: null,
      })
      .eq("id", exportId)
      .eq("locked_by", workerId);
  } catch (error) {
    console.error("[evidence-appendix] export failed", error);
    await fail(error instanceof Error ? error.message.slice(0, 300) : "Export failed.", true);
  }
}

/** Claims queued exports under a lease and renders them one at a time. */
export async function runEvidenceAppendixTick(options?: { limit?: number; workerId?: string }) {
  const admin = createAdminClient();
  const workerId = options?.workerId ?? `appendix-${randomUUID().slice(0, 8)}`;
  const { data: claimed, error } = await admin.rpc("claim_inspection_output_exports", {
    p_worker_id: workerId,
    p_limit: options?.limit ?? 1,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (error) {
    console.error("appendix: claim failed", error.message);
    return { claimed: 0 };
  }
  for (const row of claimed ?? []) {
    await processEvidenceAppendixExport(row.id, workerId);
  }
  return { claimed: (claimed ?? []).length };
}
