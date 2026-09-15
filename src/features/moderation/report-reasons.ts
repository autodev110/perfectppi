// Stable machine reason codes for user reports (plan section 16.2). These are
// policy keys shared by the web form, the API, and the database CHECK
// constraint; localized labels live in the message catalog and are never stored.
// Relative so the node test runner can load this module without path aliases.
import { DEFAULT_LOCALE, translate, type Locale } from "../../lib/i18n/index.ts";

export const REPORT_REASON_CODES = [
  "spam",
  "harassment",
  "hate",
  "violence",
  "sexual_content",
  "personal_information",
  "fraud",
  "illegal_content",
  "dangerous_vehicle_advice",
  "intellectual_property",
  "other",
] as const;

export type ReportReasonCode = (typeof REPORT_REASON_CODES)[number];

// Labels come from the message catalog so a new language never touches the
// codes (plan 32.2). The constant is the default-locale view for existing
// callers; request-aware code should use reportReasonLabels(locale).
export function reportReasonLabels(locale: Locale = DEFAULT_LOCALE): Record<ReportReasonCode, string> {
  return Object.fromEntries(
    REPORT_REASON_CODES.map((code) => [code, translate(locale, `report.reason.${code}`)]),
  ) as Record<ReportReasonCode, string>;
}

export const REPORT_REASON_LABELS: Record<ReportReasonCode, string> = reportReasonLabels();

/** Reasons whose report is rejected without a written explanation. */
export const REPORT_REASONS_REQUIRING_DETAILS: ReadonlySet<ReportReasonCode> = new Set([
  "other",
  "intellectual_property",
]);

export const REPORT_DETAILS_MIN_LENGTH = 10;
export const REPORT_DETAILS_MAX_LENGTH = 500;

export function reportReasonRequiresDetails(code: ReportReasonCode) {
  return REPORT_REASONS_REQUIRING_DETAILS.has(code);
}
