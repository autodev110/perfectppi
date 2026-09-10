// Stable machine reason codes for user reports (plan section 16.2). These are
// policy keys shared by the web form, the API, and the database CHECK
// constraint; localized labels live beside them but are never stored.
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

export const REPORT_REASON_LABELS: Record<ReportReasonCode, string> = {
  spam: "Spam or misleading content",
  harassment: "Harassment or bullying",
  hate: "Hate or dehumanizing content",
  violence: "Violence, threats, or encouragement of harm",
  sexual_content: "Nudity or sexual content",
  personal_information: "Personal or private information",
  fraud: "Scam, fraud, or unsafe transaction",
  illegal_content: "Illegal or dangerous activity",
  dangerous_vehicle_advice: "Dangerous vehicle or repair advice",
  intellectual_property: "Copyright or other intellectual-property issue",
  other: "Other",
};

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
