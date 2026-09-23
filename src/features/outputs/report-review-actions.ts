"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/features/auth/guards";
import {
  REVIEW_ATTESTATION,
  REVIEW_ATTESTATION_VERSION,
  type ReviewEdits,
  type ReviewIssue,
} from "@/features/ppi/report-review";
import { insertAuditLog } from "./actions";
import { evaluateReviewEdits, loadHeldReport, rearmHeldJob, reviewToken, storeReleasedReport } from "./report-review";
import { runOutputWorkerTick } from "./worker";

// ============================================================================
// Admin actions for held reports: check a draft, then release it. Release runs
// every check again server-side; nothing the browser reports is trusted.
// ============================================================================

const editsSchema = z.object({
  priority_actions: z.string().max(4000),
  overview: z
    .array(z.object({ category: z.string().max(40), observation: z.string().max(4000), next_step: z.string().max(4000) }))
    .max(6),
  scope_and_evidence: z.string().max(4000),
});

export interface ReviewCheckResult {
  issues: ReviewIssue[];
  fits: Record<string, boolean>;
  renderError: string | null;
  /** Base64 of the two-page preview when every check passed. */
  previewPdf: string | null;
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const NOT_HELD = "This report is no longer held for review. Reload the page.";
const STALE = "This report changed since you opened it (someone else may have released it). Reload the page.";

function parseEdits(input: unknown): ReviewEdits | null {
  const parsed = editsSchema.safeParse(input);
  return parsed.success ? (parsed.data as ReviewEdits) : null;
}

export async function checkHeldReportEdits(
  outputId: string,
  token: string,
  input: unknown,
): Promise<ActionResult<ReviewCheckResult>> {
  await requireRole(["admin"]);
  const edits = parseEdits(input);
  if (!edits) return { ok: false, error: "The edited text could not be read." };
  const held = await loadHeldReport(outputId);
  if (!held) return { ok: false, error: NOT_HELD };
  if (reviewToken(held) !== token) return { ok: false, error: STALE };

  const evaluation = await evaluateReviewEdits(held, edits);
  return {
    ok: true,
    data: {
      issues: evaluation.issues,
      fits: evaluation.fits,
      renderError: evaluation.renderError,
      previewPdf: evaluation.pdf ? evaluation.pdf.toString("base64") : null,
    },
  };
}

export async function releaseHeldReport(
  outputId: string,
  token: string,
  input: unknown,
  attested: boolean,
): Promise<ActionResult<{ requeued: boolean }>> {
  const profile = await requireRole(["admin"]);
  if (attested !== true) return { ok: false, error: "Confirm that the summary is faithful before releasing it." };
  const edits = parseEdits(input);
  if (!edits) return { ok: false, error: "The edited text could not be read." };
  const held = await loadHeldReport(outputId);
  if (!held) return { ok: false, error: NOT_HELD };
  if (reviewToken(held) !== token) return { ok: false, error: STALE };

  if (held.job?.status === "processing" && held.job.lockExpiresAt && new Date(held.job.lockExpiresAt) > new Date()) {
    return { ok: false, error: "A generation run for this report is in progress. Try again in a minute." };
  }

  const evaluation = await evaluateReviewEdits(held, edits);
  if (evaluation.issues.length) return { ok: false, error: evaluation.issues[0].message };
  const overflowing = Object.entries(evaluation.fits).filter(([, fits]) => !fits).map(([region]) => region);
  if (overflowing.length) return { ok: false, error: `Some text still does not fit: ${overflowing.join(", ")}.` };
  if (!evaluation.pdf) {
    return { ok: false, error: `The report still does not render on two pages: ${evaluation.renderError ?? "unknown layout error"}.` };
  }

  const stored = await storeReleasedReport(held, evaluation.candidate);
  if (!stored) return { ok: false, error: "Someone else changed or released this report. Reload the page." };

  await insertAuditLog({
    actorId: profile.id,
    action: "output_review_released",
    targetType: "standardized_output",
    targetId: held.outputId,
    metadata: {
      submissionId: held.submissionId,
      outputVersion: held.outputVersion,
      hold: held.hold,
      resolvedReasons: evaluation.candidate.review_resolution?.resolved_reasons ?? [],
      editedRegions: evaluation.candidate.review_resolution?.edited_regions ?? [],
      attestation: REVIEW_ATTESTATION,
      attestationVersion: REVIEW_ATTESTATION_VERSION,
      previous: {
        priority_actions: held.report.priority_actions,
        overview: held.report.overview.map((block) => ({ category: block.category, observation: block.observation, next_step: block.next_step })),
        scope_and_evidence: held.report.scope_and_evidence,
      },
    },
  });

  // Same output version: the job now finds a ready report and stores the
  // artifacts. Until it finishes, the PDF route renders the released text.
  const requeued = await rearmHeldJob(held, profile.id);
  if (requeued) {
    after(async () => {
      try {
        await runOutputWorkerTick({ limit: 1 });
      } catch (error) {
        console.error("[report-review] worker tick after release failed", error);
      }
    });
  }

  revalidatePath("/admin/outputs");
  if (held.requestId) {
    revalidatePath(`/dashboard/ppi/${held.requestId}`);
    revalidatePath(`/tech/ppi/${held.requestId}`);
  }
  return { ok: true, data: { requeued } };
}
