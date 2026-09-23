import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createReportMeasurer } from "@/lib/pdf/inspection-report/render";
import type { InspectionReportV2 } from "@/features/ppi/inspection-report";
import {
  applyReviewEdits,
  reviewIssues,
  type ReviewEdits,
  type ReviewIssue,
} from "@/features/ppi/report-review";
import type { StandardizedContent } from "@/types/api";
import { renderReportV2Pdf } from "./report-v2";

// ============================================================================
// Admin review of held two-page reports (see features/ppi/report-review.ts).
//
// A report is held when its text could not fit after approved consolidation
// (report_v2.status = needs_review), or when the final render still overflowed
// and the output job stopped with a layout_review error. Either way no PDF
// artifact exists yet for that output version, so releasing it with edited
// summary text publishes nothing that a partner already received.
// ============================================================================

export type HoldKind = "needs_review" | "render_failed";

export interface HeldReport {
  outputId: string;
  outputVersion: number;
  submissionId: string;
  requestId: string | null;
  vehicleLabel: string;
  vin: string | null;
  scope: string | null;
  generatedAt: string;
  hold: HoldKind;
  report: InspectionReportV2;
  content: StandardizedContent;
  job: { id: string; status: string; lockExpiresAt: string | null; error: string | null } | null;
}

interface JobError {
  category?: string;
  message?: string;
}

type VehicleRow = { year: number | null; make: string | null; model: string | null; trim: string | null; vin: string | null } | null;

function vehicleLabel(vehicle: VehicleRow): string {
  const label = [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ");
  return label || "Vehicle";
}

const OUTPUT_SELECT = `
  id, version, generated_at, ppi_submission_id, document_url, structured_content,
  ppi_submission:ppi_submissions(
    id, ppi_request_id,
    request:ppi_requests(id, inspection_scope, vehicle:vehicles(year, make, model, trim, vin))
  )
`;

type OutputRow = {
  id: string;
  version: number;
  generated_at: string;
  ppi_submission_id: string;
  document_url: string | null;
  structured_content: unknown;
  ppi_submission: {
    id: string;
    ppi_request_id: string;
    request: { id: string; inspection_scope: string | null; vehicle: VehicleRow } | null;
  } | null;
};

function holdOf(row: OutputRow, job: HeldReport["job"], jobCategory: string | undefined): HoldKind | null {
  const report = (row.structured_content as StandardizedContent | null)?.report_v2;
  if (!report || row.document_url) return null;
  if (report.status === "needs_review") return "needs_review";
  if (job?.status === "failed" && jobCategory === "layout_review") return "render_failed";
  return null;
}

async function jobFor(submissionId: string, outputVersion: number) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("output_generation_jobs")
    .select("id, status, lock_expires_at, last_error")
    .eq("ppi_submission_id", submissionId)
    .eq("output_version", outputVersion)
    .maybeSingle();
  if (!data) return { job: null, category: undefined };
  const error = (data.last_error ?? null) as JobError | null;
  return {
    job: { id: data.id, status: data.status, lockExpiresAt: data.lock_expires_at, error: error?.message ?? null },
    category: error?.category,
  };
}

function toHeld(row: OutputRow, job: HeldReport["job"], hold: HoldKind): HeldReport {
  const content = row.structured_content as StandardizedContent;
  const request = row.ppi_submission?.request ?? null;
  return {
    outputId: row.id,
    outputVersion: row.version,
    submissionId: row.ppi_submission_id,
    requestId: row.ppi_submission?.ppi_request_id ?? null,
    vehicleLabel: vehicleLabel(request?.vehicle ?? null),
    vin: request?.vehicle?.vin ?? null,
    scope: request?.inspection_scope ?? null,
    generatedAt: row.generated_at,
    hold,
    report: content.report_v2!,
    content,
    job,
  };
}

/**
 * Identifies the held state an editor started from. A release made from an
 * older state (someone else released it, and it was held again) is refused.
 */
export function reviewToken(held: HeldReport): string {
  return [held.hold, held.report.status, held.report.review_resolution?.resolved_at ?? "none"].join(":");
}

/** One held report, or null when the output is not (or no longer) held. */
export async function loadHeldReport(outputId: string): Promise<HeldReport | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("standardized_outputs").select(OUTPUT_SELECT).eq("id", outputId).maybeSingle();
  if (!data) return null;
  const row = data as unknown as OutputRow;
  const { job, category } = await jobFor(row.ppi_submission_id, row.version);
  const hold = holdOf(row, job, category);
  return hold ? toHeld(row, job, hold) : null;
}

export interface ReleasedReport {
  outputId: string;
  outputVersion: number;
  vehicleLabel: string;
  resolution: NonNullable<InspectionReportV2["review_resolution"]>;
  documentStored: boolean;
  job: HeldReport["job"];
}

/** A report an admin already released, for the review page's after state. */
export async function loadReleasedReport(outputId: string): Promise<ReleasedReport | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("standardized_outputs").select(OUTPUT_SELECT).eq("id", outputId).maybeSingle();
  if (!data) return null;
  const row = data as unknown as OutputRow;
  const resolution = (row.structured_content as StandardizedContent | null)?.report_v2?.review_resolution;
  if (!resolution) return null;
  const { job } = await jobFor(row.ppi_submission_id, row.version);
  return {
    outputId: row.id,
    outputVersion: row.version,
    vehicleLabel: vehicleLabel(row.ppi_submission?.request?.vehicle ?? null),
    resolution,
    documentStored: Boolean(row.document_url),
    job,
  };
}

/** Every held report, oldest first so nothing waits indefinitely. */
export async function listHeldReports(): Promise<HeldReport[]> {
  const admin = createAdminClient();
  const [{ data: flagged }, { data: failedJobs }] = await Promise.all([
    admin
      .from("standardized_outputs")
      .select(OUTPUT_SELECT)
      .is("document_url", null)
      .filter("structured_content->report_v2->>status", "eq", "needs_review")
      .order("generated_at", { ascending: true })
      .limit(100),
    admin
      .from("output_generation_jobs")
      .select("ppi_submission_id, output_version")
      .eq("status", "failed")
      .filter("last_error->>category", "eq", "layout_review")
      .limit(100),
  ]);

  const rows = new Map<string, OutputRow>();
  for (const row of (flagged ?? []) as unknown as OutputRow[]) rows.set(row.id, row);
  for (const failed of failedJobs ?? []) {
    const { data } = await admin
      .from("standardized_outputs")
      .select(OUTPUT_SELECT)
      .eq("ppi_submission_id", failed.ppi_submission_id)
      .eq("version", failed.output_version)
      .is("document_url", null)
      .maybeSingle();
    if (data) rows.set((data as unknown as OutputRow).id, data as unknown as OutputRow);
  }

  const held: HeldReport[] = [];
  for (const row of rows.values()) {
    const { job, category } = await jobFor(row.ppi_submission_id, row.version);
    const hold = holdOf(row, job, category);
    if (hold) held.push(toHeld(row, job, hold));
  }
  return held.sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
}

export interface ReviewEvaluation {
  issues: ReviewIssue[];
  /** Region → whether its text fits the layout budget. */
  fits: Record<string, boolean>;
  candidate: InspectionReportV2;
  pdf: Buffer | null;
  renderError: string | null;
}

/**
 * The same checks release applies: faithfulness rules, per-region fit, and a
 * full render of both pages (which is what the output job will do next).
 */
export async function evaluateReviewEdits(held: HeldReport, edits: ReviewEdits): Promise<ReviewEvaluation> {
  const issues = reviewIssues(held.report, edits);
  const measurer = await createReportMeasurer();
  const fits: Record<string, boolean> = {
    priority_actions: measurer.priorityFits(edits.priority_actions.replace(/\s+/g, " ").trim()),
    scope_and_evidence: measurer.scopeFits(edits.scope_and_evidence.replace(/\s+/g, " ").trim()),
  };
  for (const block of edits.overview) {
    fits[`overview.${block.category}`] = measurer.categoryFits({
      observation: block.observation.replace(/\s+/g, " ").trim(),
      action: block.next_step.replace(/\s+/g, " ").trim(),
    });
  }
  const candidate = applyReviewEdits(held.report, edits, new Date().toISOString());

  let pdf: Buffer | null = null;
  let renderError: string | null = null;
  if (issues.length === 0 && Object.values(fits).every(Boolean)) {
    try {
      pdf = await renderReportV2Pdf(candidate, {
        submissionId: held.submissionId,
        outputVersion: held.outputVersion,
        requestId: held.requestId,
      });
    } catch (error) {
      renderError = error instanceof Error ? error.message : String(error);
    }
  }
  return { issues, fits, candidate, pdf, renderError };
}

/**
 * Stores the released report only if nobody released or changed it in the
 * meantime: the row must still have no PDF and the same status and
 * resolution marker that was reviewed.
 */
export async function storeReleasedReport(held: HeldReport, candidate: InspectionReportV2): Promise<boolean> {
  const admin = createAdminClient();
  let query = admin
    .from("standardized_outputs")
    .update({ structured_content: { ...held.content, report_v2: candidate } as never })
    .eq("id", held.outputId)
    .is("document_url", null)
    .filter("structured_content->report_v2->>status", "eq", held.report.status)
    .filter("structured_content->report_v2->>generated_at", "eq", held.report.generated_at);
  query = held.report.review_resolution
    ? query.filter("structured_content->report_v2->review_resolution->>resolved_at", "eq", held.report.review_resolution.resolved_at)
    : query.filter("structured_content->report_v2->review_resolution", "is", null);
  const { data, error } = await query.select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

/**
 * Re-arms the held version's own job (not whichever version is newest), with
 * the same fields enqueue_output_generation_job resets for a manual retry.
 */
export async function rearmHeldJob(held: HeldReport, requestedBy: string): Promise<boolean> {
  if (!held.job) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from("output_generation_jobs")
    .update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      attempt_count: 0,
      locked_at: null,
      lock_expires_at: null,
      locked_by: null,
      trigger_reason: "manual_retry",
      requested_by: requestedBy,
    })
    .eq("id", held.job.id)
    .in("status", ["failed", "pending"])
    .select("id");
  return (data ?? []).length === 1;
}
