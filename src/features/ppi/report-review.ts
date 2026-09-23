import { CATEGORY_TITLES, FORBIDDEN_PHRASES, type InspectionReportV2 } from "./inspection-report.ts";
import type { Category, Finding } from "./inspection-rules.ts";

// ============================================================================
// Releasing a report held as needs_review.
//
// When every urgent action cannot fit the two-page layout after approved
// consolidation, the output version is held and "an editor must produce a
// faithful concise summary before release" (05-developer-handoff.md). An
// administrator rewrites only the printed summary text: the priority box, the
// category blocks and the scope line. Facts, findings, statuses and actions
// are certified and never editable here.
//
// These rules are the mechanical floor for a faithful summary; the editor
// also attests to it. Text an editor left unchanged is the deterministic
// wording, which already keeps every urgent action.
// ============================================================================

export const REVIEW_LIMITS = {
  priority_actions: 700,
  observation: 400,
  next_step: 240,
  scope_and_evidence: 600,
} as const;

/** Shown beside the release button and stored with the audit entry. */
export const REVIEW_ATTESTATION =
  "This summary is faithful to the certified inspection: every urgent action and location is kept, and no finding, status or recommendation was added, removed or softened.";
export const REVIEW_ATTESTATION_VERSION = "report_review/1";

export interface ReviewEdits {
  priority_actions: string;
  overview: { category: Category; observation: string; next_step: string }[];
  scope_and_evidence: string;
}

export interface ReviewIssue {
  /** "priority_actions", "overview.<category>" or "scope_and_evidence". */
  region: string;
  message: string;
}

/** The report's current printed text, as the starting draft. */
export function reviewDraft(report: InspectionReportV2): ReviewEdits {
  return {
    priority_actions: report.priority_actions,
    overview: report.overview.map((block) => ({ category: block.category, observation: block.observation, next_step: block.next_step })),
    scope_and_evidence: report.scope_and_evidence,
  };
}

/** Finding references cited as [T1] or as a list such as [T1, T4, B2]. */
export function citedRefs(text: string): string[] {
  const refs: string[] = [];
  for (const group of text.matchAll(/\[([^\]]+)\]/g)) {
    const parts = group[1].split(",").map((part) => part.trim());
    if (parts.every((part) => /^[TBCN]\d{1,2}$/.test(part))) refs.push(...parts);
  }
  return refs;
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** Regions whose text differs from the stored report. */
export function editedRegions(report: InspectionReportV2, edits: ReviewEdits): string[] {
  const regions: string[] = [];
  if (clean(edits.priority_actions) !== clean(report.priority_actions)) regions.push("priority_actions");
  for (const block of report.overview) {
    const edit = edits.overview.find((entry) => entry.category === block.category);
    if (edit && (clean(edit.observation) !== clean(block.observation) || clean(edit.next_step) !== clean(block.next_step))) {
      regions.push(`overview.${block.category}`);
    }
  }
  if (clean(edits.scope_and_evidence) !== clean(report.scope_and_evidence)) regions.push("scope_and_evidence");
  return regions;
}

const activeFindings = (report: InspectionReportV2): Finding[] =>
  report.assessment.findings.filter((finding) => finding.review_state !== "rejected");

/** Every urgent finding the priority box must keep. */
export function urgentRefs(report: InspectionReportV2): string[] {
  return activeFindings(report).filter((finding) => finding.action === "urgent").map((finding) => finding.ref);
}

export function regionLabel(region: string): string {
  if (region === "priority_actions") return "Priority actions";
  if (region === "scope_and_evidence") return "Inspection scope and evidence";
  const category = region.replace(/^overview\./, "") as Category;
  const title = CATEGORY_TITLES[category] ?? category;
  return title.charAt(0) + title.slice(1).toLowerCase();
}

/**
 * Problems that block release. Only edited regions are checked for citations:
 * unchanged text is the deterministic wording.
 */
export function reviewIssues(report: InspectionReportV2, edits: ReviewEdits): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const known = new Set(activeFindings(report).map((finding) => finding.ref));
  const edited = new Set(editedRegions(report, edits));

  const categories = report.overview.map((block) => block.category);
  if (
    edits.overview.length !== categories.length ||
    edits.overview.some((entry, index) => entry.category !== categories[index])
  ) {
    return [{ region: "overview", message: "The category blocks cannot be added, removed or reordered." }];
  }

  function checkText(region: string, label: string, text: string, max: number) {
    if (!clean(text)) issues.push({ region, message: `${label} cannot be empty.` });
    if (clean(text).length > max) issues.push({ region, message: `${label} is ${clean(text).length} characters; the limit is ${max}.` });
    if (FORBIDDEN_PHRASES.test(text)) {
      issues.push({ region, message: `${label} uses wording the report may not print (AI or model labels, prices, pass/fail).` });
    }
    const unknown = citedRefs(text).filter((ref) => !known.has(ref));
    if (unknown.length) issues.push({ region, message: `${label} cites findings that do not exist: ${unknown.join(", ")}.` });
  }

  if (edited.has("priority_actions")) {
    checkText("priority_actions", "Priority actions", edits.priority_actions, REVIEW_LIMITS.priority_actions);
    const cited = new Set(citedRefs(edits.priority_actions));
    const missing = urgentRefs(report).filter((ref) => !cited.has(ref));
    if (missing.length) {
      issues.push({
        region: "priority_actions",
        message: `Priority actions must keep every urgent finding. Cite ${missing.map((ref) => `[${ref}]`).join(", ")}.`,
      });
    }
  }

  for (const block of report.overview) {
    const region = `overview.${block.category}`;
    if (!edited.has(region)) continue;
    const edit = edits.overview.find((entry) => entry.category === block.category)!;
    const label = regionLabel(region);
    checkText(region, `${label} observation`, edit.observation, REVIEW_LIMITS.observation);
    checkText(region, `${label} next step`, edit.next_step, REVIEW_LIMITS.next_step);
    const cited = new Set(citedRefs(`${edit.observation} ${edit.next_step}`));
    const missing = activeFindings(report)
      .filter((finding) => block.finding_ids.includes(finding.finding_id) && finding.action === "urgent")
      .map((finding) => finding.ref)
      .filter((ref) => !cited.has(ref));
    if (missing.length) {
      issues.push({ region, message: `${label} must cite its urgent findings: ${missing.map((ref) => `[${ref}]`).join(", ")}.` });
    }
  }

  if (edited.has("scope_and_evidence")) {
    checkText("scope_and_evidence", "Scope and evidence", edits.scope_and_evidence, REVIEW_LIMITS.scope_and_evidence);
  }

  return issues;
}

/** The released report: edited text, ready status, and the resolution record. */
export function applyReviewEdits(report: InspectionReportV2, edits: ReviewEdits, resolvedAt: string): InspectionReportV2 {
  const edited = editedRegions(report, edits);
  return {
    ...report,
    priority_actions: edited.includes("priority_actions") ? clean(edits.priority_actions) : report.priority_actions,
    overview: report.overview.map((block) => {
      if (!edited.includes(`overview.${block.category}`)) return block;
      const edit = edits.overview.find((entry) => entry.category === block.category)!;
      return { ...block, observation: clean(edit.observation), next_step: clean(edit.next_step), text_source: "editor" };
    }),
    scope_and_evidence: edited.includes("scope_and_evidence") ? clean(edits.scope_and_evidence) : report.scope_and_evidence,
    status: "ready",
    review_reasons: [],
    review_resolution: {
      resolved_at: resolvedAt,
      edited_regions: edited,
      resolved_reasons: [...(report.review_resolution?.resolved_reasons ?? []), ...report.review_reasons],
    },
  };
}
