import {
  composePriorityActionVariants,
  overviewTextVariants,
  type InspectionReportV2,
} from "../../../features/ppi/inspection-report.ts";
import { createReportMeasurer } from "./render.ts";

// ============================================================================
// Fits the report's text to the two-page layout using approved consolidation
// only: shorter deterministic wordings that keep every urgent reference, and
// dropping non-essential scope sentences. What still cannot fit is returned as
// overflow so the output is held for review rather than printed clipped.
// ============================================================================

export type ReportMeasurer = Awaited<ReturnType<typeof createReportMeasurer>>;

export async function fitReportToLayout(
  report: InspectionReportV2,
  measurer?: ReportMeasurer,
): Promise<{ report: InspectionReportV2; overflow: string[] }> {
  const measure = measurer ?? (await createReportMeasurer());
  const overflow: string[] = [];

  let priority = report.priority_actions;
  if (!measure.priorityFits(priority)) {
    const fitting = composePriorityActionVariants(report.assessment.findings).find((variant) => measure.priorityFits(variant));
    if (fitting) priority = fitting;
    else overflow.push("priority_actions");
  }

  const overview = report.overview.map((block) => {
    if (measure.categoryFits({ observation: block.observation, action: block.next_step })) return block;
    for (const variant of overviewTextVariants(block, report.assessment.findings)) {
      if (measure.categoryFits({ observation: variant.observation, action: variant.next_step })) {
        return { ...block, observation: variant.observation, next_step: variant.next_step, text_source: "deterministic" };
      }
    }
    overflow.push(`overview.${block.category}`);
    return block;
  });

  let scope = report.scope_and_evidence;
  if (!measure.scopeFits(scope)) {
    const sentences = scope.split(/(?<=\.)\s+/);
    // Keep the first (who inspected) and drop from the end until it fits.
    while (sentences.length > 1 && !measure.scopeFits(sentences.join(" "))) sentences.splice(sentences.length - 1, 1);
    scope = sentences.join(" ");
    if (!measure.scopeFits(scope)) overflow.push("scope_and_evidence");
  }

  const fitted: InspectionReportV2 = {
    ...report,
    priority_actions: priority,
    overview,
    scope_and_evidence: scope,
    status: overflow.length ? "needs_review" : report.status,
    review_reasons: overflow.length
      ? [...report.review_reasons, ...overflow.map((region) => `layout_overflow:${region}`)]
      : report.review_reasons,
  };
  return { report: fitted, overflow };
}
