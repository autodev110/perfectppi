import { z } from "zod";
import { generateStructuredOutput, isGeminiConfigured } from "@/lib/ai/gemini";
import { buildInspectionOverviewPrompt, OVERVIEW_PROMPT_VERSION } from "@/lib/ai/prompts/inspection-overview";
import { buildInspectionFacts, type FactsInputSection, type InspectionFactsV2 } from "@/features/ppi/inspection-facts";
import { certifiedInspectorName, sectionsFromSnapshot, type CertifiedSnapshot } from "@/features/ppi/certified-snapshot";
import { evaluateInspection, type Category } from "@/features/ppi/inspection-rules";
import { applyOverviewText, buildInspectionReport, type InspectionReportV2 } from "@/features/ppi/inspection-report";
import type { PerformerMode } from "@/features/ppi/inspection-schema";
import { fitReportToLayout } from "@/lib/pdf/inspection-report/fit";
import { createReportMeasurer, renderInspectionReportPdf } from "@/lib/pdf/inspection-report/render";
import { buildReportViewModel } from "@/lib/pdf/inspection-report/view-model";
import { loadLayoutAssets } from "@/lib/pdf/inspection-report/canvas";
import { siteConfig } from "@/config/site";
import type { InspectionScope } from "@/types/enums";
import { classifyInspectionNotes } from "./report-classification";

export type { CertifiedSnapshot };

// ============================================================================
// Builds InspectionReportV2 for one output version and renders its PDF.
//
//   frozen facts → deterministic findings → optional Jev note classification
//   → optional bounded overview prose (validated, measured) → fitted layout
//
// Deterministic results are final: models only add review suggestions and
// rewrite category prose within the rules applyOverviewText enforces.
// ============================================================================

export const REPORT_TIME_ZONE = process.env.PPI_REPORT_TIME_ZONE ?? "America/New_York";
const OVERVIEW_MODEL = process.env.PPI_REPORT_OVERVIEW_MODEL ?? "gemini-2.5-flash";

export interface ReportV2Input {
  scope: InspectionScope;
  catalogVersion: number;
  performerMode: PerformerMode;
  inspectorName: string | null;
  submission: { id: string; version: number; submitted_at: string | null; revision: number | null };
  vehicle: InspectionFactsV2["vehicle"];
  sections: FactsInputSection[];
  certification: CertifiedSnapshot | null;
  diagnostics: InspectionFactsV2["diagnostics"];
  generatedAt: string;
}

export function buildFactsForReport(input: ReportV2Input): InspectionFactsV2 {
  const snapshot = input.certification;
  const frozenVehicle = snapshot?.facts_snapshot.vehicle;
  return buildInspectionFacts({
    scope: input.scope,
    catalogVersion: input.catalogVersion,
    performerMode: input.performerMode,
    // Identity comes from the certified snapshot, not today's profile.
    inspectorName: certifiedInspectorName(snapshot) ?? (input.inspectorName?.trim() || null),
    submission: input.submission,
    vehicle: frozenVehicle
      ? { ...input.vehicle, ...frozenVehicle, mileage_unit: "mi" }
      : input.vehicle,
    certification: snapshot
      ? {
          certified_at: snapshot.certified_at,
          text: snapshot.certification_text,
          text_version: snapshot.text_version,
          facts_hash: snapshot.facts_hash,
        }
      : null,
    sections: snapshot ? sectionsFromSnapshot(snapshot) : input.sections,
    diagnostics: input.scope === "complete" ? input.diagnostics : null,
  });
}

const overviewSchema = z.object({
  blocks: z.array(z.object({
    category: z.string(),
    observation: z.string().max(400),
    next_step: z.string().max(240),
  })).max(6),
});

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export async function buildReportV2(input: ReportV2Input): Promise<InspectionReportV2> {
  const facts = buildFactsForReport(input);
  const inspectionDate = facts.submission.submitted_at ? new Date(facts.submission.submitted_at) : new Date(input.generatedAt);
  const assessment = evaluateInspection(facts, { inspectionDate });

  const classification = await classifyInspectionNotes(facts);
  let report = buildInspectionReport({
    facts,
    assessment,
    factsHash: input.certification?.facts_hash ?? null,
    generatedAt: input.generatedAt,
    timeZone: REPORT_TIME_ZONE,
    modelSuggestions: classification.mode === "on" ? classification.suggestions : [],
    classification: { model: classification.model, mode: classification.mode },
  });
  report = {
    ...report,
    provenance: {
      ...report.provenance,
      classification_model: classification.model,
      classification_mode: classification.mode,
    },
    classification_log: {
      prompt_version: classification.prompt_version,
      duration_ms: classification.duration_ms,
      results: classification.classifications,
      errors: classification.errors,
      shadow_suggestions: classification.mode === "shadow" ? classification.suggestions.map((suggestion) => suggestion.finding_id) : [],
    },
  };

  const measurer = await createReportMeasurer();
  const overviewEnabled = (process.env.PPI_REPORT_OVERVIEW_MODEL ?? "on").toLowerCase() !== "off" && isGeminiConfigured();
  if (overviewEnabled) {
    try {
      const proposal = await withTimeout(
        generateStructuredOutput(buildInspectionOverviewPrompt(report), overviewSchema, { model: OVERVIEW_MODEL, maxRetries: 1 }),
        45_000,
      );
      report = applyOverviewText(
        report,
        proposal.blocks.map((block) => ({ category: block.category as Category, observation: block.observation, next_step: block.next_step })),
        { model: OVERVIEW_MODEL, promptVersion: OVERVIEW_PROMPT_VERSION },
        (block) => measurer.categoryFits({ observation: block.observation, action: block.next_step }),
      );
    } catch (error) {
      // Deterministic wording already covers every accepted finding.
      console.error("[report-v2] overview prose unavailable; using deterministic text", error);
    }
  }

  const fitted = await fitReportToLayout(report, measurer);
  return fitted.report;
}

export function reportDetailUrl(requestId: string): string {
  return `${siteConfig.url.replace(/\/$/, "")}/dashboard/ppi/${requestId}`;
}

export async function renderReportV2Pdf(
  report: InspectionReportV2,
  ids: { submissionId: string; outputVersion: number; requestId?: string | null },
): Promise<Buffer> {
  const vm = buildReportViewModel(report, {
    submissionId: ids.submissionId,
    outputVersion: ids.outputVersion,
    detailUrl: ids.requestId ? reportDetailUrl(ids.requestId) : null,
    diagram: loadLayoutAssets().spec.diagram,
  });
  return renderInspectionReportPdf(vm);
}
