// Redacted inspection report for listings (plan 25.3). Client-safe and pure.
// The projection itself is built by `marketplace_inspection_report` in SQL;
// this module only parses it and derives presentation facts (age, scope
// wording, answer formatting). No pass/fail, no score.
import { z } from "zod";
// Relative so the node test runner can load it without path aliases.
import { SECTION_LABELS } from "../../features/ppi/constants.ts";

const itemSchema = z.object({
  prompt: z.string(),
  answer_type: z.enum(["text", "yes_no", "select", "number"]),
  value: z.string(),
});

const sectionSchema = z.object({
  section_type: z.string(),
  completion_state: z.enum(["not_started", "in_progress", "completed"]),
  items: z.array(itemSchema),
  withheld: z.array(z.string()),
  notes_withheld: z.boolean(),
  media_count: z.number().int().nonnegative(),
});

export const inspectionReportSchema = z.object({
  request_id: z.string().uuid(),
  scope: z.enum(["complete", "dents_tires"]),
  inspected_at: z.string(),
  performer_kind: z.enum(["self", "technician"]),
  performed_by: z.string(),
  sections: z.array(sectionSchema),
  withheld_count: z.number().int().nonnegative(),
  media_count: z.number().int().nonnegative(),
});

export type InspectionReport = z.infer<typeof inspectionReportSchema>;
export type InspectionReportSection = z.infer<typeof sectionSchema>;
export type InspectionReportItem = z.infer<typeof itemSchema>;

export function parseInspectionReport(input: unknown): InspectionReport | null {
  const parsed = inspectionReportSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Months considered old enough to warn a buyer (plan 25.3 "inspection age"). */
export const STALE_INSPECTION_MONTHS = 12;

export type InspectionAge = {
  days: number;
  months: number;
  /** "3 days ago", "1 month ago", "14 months ago". */
  label: string;
  stale: boolean;
};

export function inspectionAge(inspectedAt: string | Date, now: Date = new Date()): InspectionAge {
  const at = new Date(inspectedAt);
  const days = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86_400_000));
  const months = Math.floor(days / 30.4375);
  const label = days < 1
    ? "today"
    : days < 31
      ? `${days} day${days === 1 ? "" : "s"} ago`
      : `${months} month${months === 1 ? "" : "s"} ago`;
  return { days, months, label, stale: months >= STALE_INSPECTION_MONTHS };
}

export function inspectionScopeLabel(scope: InspectionReport["scope"]): string {
  return scope === "dents_tires" ? "Dents & Tires — limited scope" : "Complete inspection";
}

/** Plain wording so a limited or old inspection is not mistaken for a current comprehensive one. */
export function inspectionCaveat(scope: InspectionReport["scope"], age: InspectionAge): string {
  const parts: string[] = [];
  if (scope === "dents_tires") parts.push("This inspection covered dents, body damage, wheels, and tires only.");
  if (age.stale) parts.push(`It is ${age.label}; the vehicle's condition may have changed.`);
  parts.push("Findings describe the vehicle on the inspection date and are not a guarantee of its condition now.");
  return parts.join(" ");
}

export function sectionLabel(sectionType: string): string {
  return (SECTION_LABELS as Record<string, string>)[sectionType] ?? sectionType.replaceAll("_", " ");
}

export function formatAnswer(item: InspectionReportItem): string {
  if (item.answer_type === "yes_no") {
    const normalized = item.value.trim().toLowerCase();
    if (["yes", "true", "1"].includes(normalized)) return "Yes";
    if (["no", "false", "0"].includes(normalized)) return "No";
    return item.value;
  }
  if (item.answer_type === "number") {
    const numeric = Number(item.value);
    return Number.isFinite(numeric) ? numeric.toLocaleString() : item.value;
  }
  return item.value;
}
