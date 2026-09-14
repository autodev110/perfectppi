// Author-facing wording for account enforcement (plan 17.4, 18.6, 31.4).
// Pure so the privacy rules are testable: the member learns the action, the
// policy category, and the duration — never who reported, how many did, or
// the reporter's words.

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

const POLICY_LABELS: Record<string, string> = {
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
  repeat_violations: "Repeated Community Guidelines violations",
  other: "Community Guidelines",
};

export const ENFORCEMENT_ACTION_LABELS: Record<EnforcementActionType, string> = {
  warning: "Warning",
  temporary_posting_hold: "Posting paused",
  media_upload_hold: "Photo uploads paused",
  reporting_hold: "Reporting paused",
  suspension: "Account suspended",
  ban: "Account permanently closed",
};

/** Actions that make the whole product unavailable (everything else limits one feature). */
export function blocksAccountAccess(actionType: string): boolean {
  return actionType === "suspension" || actionType === "ban";
}

export function policyLabel(reasonCode: string | null | undefined): string {
  return POLICY_LABELS[reasonCode ?? "other"] ?? POLICY_LABELS.other;
}

export function actionLabel(actionType: string): string {
  return (ENFORCEMENT_ACTION_LABELS as Record<string, string>)[actionType] ?? "Account restriction";
}

/** "until Sep 20, 2026", "for the next 3 days", or "indefinitely". */
export function durationLabel(action: Pick<EnforcementAction, "ends_at" | "action_type">, now: Date = new Date()): string {
  if (!action.ends_at) return action.action_type === "ban" ? "permanently" : "until further notice";
  const end = new Date(action.ends_at);
  const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  const date = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (days <= 0) return "until it is reviewed";
  if (days === 1) return `until tomorrow (${date})`;
  if (days <= 14) return `for ${days} more days (until ${date})`;
  return `until ${date}`;
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
export function enforcementNotice(actions: EnforcementAction[], now: Date = new Date()): EnforcementNotice | null {
  const severity: Record<string, number> = { ban: 6, suspension: 5, temporary_posting_hold: 4, media_upload_hold: 3, reporting_hold: 2, warning: 1 };
  const active = actions
    .filter((action) => new Date(action.starts_at) <= now && (!action.ends_at || new Date(action.ends_at) > now))
    .sort((a, b) => (severity[b.action_type] ?? 0) - (severity[a.action_type] ?? 0));
  const top = active[0];
  if (!top) return null;
  const policy = policyLabel(top.reason_code);
  const duration = durationLabel(top, now);
  const nextStep = top.action_type === "ban"
    ? "If you believe this decision is wrong, contact support and ask for a review. Include the email on your account."
    : "If you believe this decision is wrong, contact support and ask for a review.";
  switch (top.action_type) {
    case "ban":
      return {
        title: "Your account has been permanently closed",
        body: `A review found content or behavior that violates our policy on ${policy.toLowerCase()}. Product access is closed ${duration}.`,
        stillAvailable: "You can still read our policies, contact support, and exercise your privacy rights, including requesting your data.",
        nextStep,
      };
    case "suspension":
      return {
        title: "Your account is suspended",
        body: `A review found content or behavior that violates our policy on ${policy.toLowerCase()}. Product access is paused ${duration}.`,
        stillAvailable: "You can still read our policies, contact support, and exercise your privacy rights. Your vehicles, posts, and messages are kept.",
        nextStep,
      };
    case "temporary_posting_hold":
      return {
        title: "Posting is paused",
        body: `Because of a decision about ${policy.toLowerCase()}, you can't publish posts or comments ${duration}.`,
        stillAvailable: "You can still browse, read, message friends, and manage your Garage.",
        nextStep,
      };
    case "media_upload_hold":
      return {
        title: "Photo uploads are paused",
        body: `Because of a decision about ${policy.toLowerCase()}, you can't upload photos to Community ${duration}.`,
        stillAvailable: "Text posts, comments, messages, and your Garage still work.",
        nextStep,
      };
    case "reporting_hold":
      return {
        title: "Reporting is paused",
        body: `Repeated reports that did not identify a violation have paused your ability to report content ${duration}.`,
        stillAvailable: "Everything else works normally. Blocking and muting are always available.",
        nextStep,
      };
    default:
      return {
        title: "A warning is on your account",
        body: `A review found content that goes against our policy on ${policy.toLowerCase()}. Further violations can lead to restrictions.`,
        stillAvailable: "Nothing is restricted right now.",
        nextStep,
      };
  }
}
