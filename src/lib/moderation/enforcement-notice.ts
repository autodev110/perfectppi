// Author-facing wording for account enforcement (plan 17.4, 18.6, 31.4).
// Pure so the privacy rules are testable: the member learns the action, the
// policy category, and the duration — never who reported, how many did, or
// the reporter's words. Copy comes from the message catalog (plan 32.2).
// Relative so the node test runner can load this module without path aliases.
import { DEFAULT_LOCALE, t, translate, type Locale, type MessageKey } from "../i18n/index.ts";

export type EnforcementActionType =
  | "warning"
  | "temporary_posting_hold"
  | "media_upload_hold"
  | "reporting_hold"
  | "suspension"
  | "ban";

export type EnforcementAction = {
  id: string;
  action_type: EnforcementActionType | string;
  reason_code: string;
  starts_at: string;
  ends_at: string | null;
};

const POLICY_CODES = new Set([
  "spam", "harassment", "hate", "violence", "sexual_content", "personal_information",
  "fraud", "illegal_content", "dangerous_vehicle_advice", "intellectual_property",
]);

export const ENFORCEMENT_ACTION_TYPES: readonly EnforcementActionType[] = [
  "warning", "temporary_posting_hold", "media_upload_hold", "reporting_hold", "suspension", "ban",
];

/** Default-locale labels for existing callers; request-aware code passes a locale to actionLabel. */
export const ENFORCEMENT_ACTION_LABELS: Record<EnforcementActionType, string> = Object.fromEntries(
  ENFORCEMENT_ACTION_TYPES.map((type) => [type, t(`enforcement.action.${type}`)]),
) as Record<EnforcementActionType, string>;

/** Actions that make the whole product unavailable (everything else limits one feature). */
export function blocksAccountAccess(actionType: string): boolean {
  return actionType === "suspension" || actionType === "ban";
}

export function policyLabel(reasonCode: string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  const code = reasonCode ?? "other";
  if (POLICY_CODES.has(code)) return translate(locale, `report.reason.${code}` as MessageKey);
  if (code === "repeat_violations") return translate(locale, "policy.repeat_violations");
  return translate(locale, "policy.community_guidelines");
}

export function actionLabel(actionType: string, locale: Locale = DEFAULT_LOCALE): string {
  return (ENFORCEMENT_ACTION_TYPES as readonly string[]).includes(actionType)
    ? translate(locale, `enforcement.action.${actionType}` as MessageKey)
    : translate(locale, "enforcement.action.unknown");
}

/** "until Sep 20, 2026", "for the next 3 days", or "indefinitely". */
export function durationLabel(
  action: Pick<EnforcementAction, "ends_at" | "action_type">,
  now: Date = new Date(),
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!action.ends_at) {
    return translate(locale, action.action_type === "ban" ? "enforcement.duration.permanently" : "enforcement.duration.until_further_notice");
  }
  const end = new Date(action.ends_at);
  const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  const date = end.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  if (days <= 0) return translate(locale, "enforcement.duration.until_reviewed");
  if (days === 1) return translate(locale, "enforcement.duration.until_tomorrow", { date });
  if (days <= 14) return translate(locale, "enforcement.duration.for_days", { days, date });
  return translate(locale, "enforcement.duration.until_date", { date });
}

export type EnforcementNotice = {
  title: string;
  body: string;
  /** What the member can still do. */
  stillAvailable: string;
  /** How to contest it. */
  nextStep: string;
};

/** The notice for the most severe active action; null when nothing is active. */
export function enforcementNotice(
  actions: EnforcementAction[],
  now: Date = new Date(),
  locale: Locale = DEFAULT_LOCALE,
): EnforcementNotice | null {
  const severity: Record<string, number> = { ban: 6, suspension: 5, temporary_posting_hold: 4, media_upload_hold: 3, reporting_hold: 2, warning: 1 };
  const active = actions
    .filter((action) => new Date(action.starts_at) <= now && (!action.ends_at || new Date(action.ends_at) > now))
    .sort((a, b) => (severity[b.action_type] ?? 0) - (severity[a.action_type] ?? 0));
  const top = active[0];
  if (!top) return null;
  const params = { policy: policyLabel(top.reason_code, locale).toLowerCase(), duration: durationLabel(top, now, locale) };
  const nextStep = translate(locale, top.action_type === "ban" ? "enforcement.next_step.ban" : "enforcement.next_step");
  const kind = top.action_type === "ban" ? "ban"
    : top.action_type === "suspension" ? "suspension"
      : top.action_type === "temporary_posting_hold" ? "posting_hold"
        : top.action_type === "media_upload_hold" ? "media_hold"
          : top.action_type === "reporting_hold" ? "reporting_hold"
            : "warning";
  return {
    title: translate(locale, `enforcement.${kind}.title` as MessageKey),
    body: translate(locale, `enforcement.${kind}.body` as MessageKey, params),
    stillAvailable: translate(locale, `enforcement.${kind}.still_available` as MessageKey),
    nextStep,
  };
}
