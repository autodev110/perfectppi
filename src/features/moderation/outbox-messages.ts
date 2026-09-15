// Pure message builders for moderation notifications (plan 17.4, 22.1, 22.2).
// Kept free of imports so the privacy rules can be unit-tested:
//   * the author never learns who reported, why in the reporter's words, or
//     how many reports there were;
//   * the reporter never learns the outcome, other reports, or enforcement;
//   * push payloads carry no policy category, report reason, reporter
//     identity, or content text — the in-app record holds the detail.
// Copy comes from the message catalog (plan 32.2). Relative import so the
// node test runner can load this module without path aliases.
import { t, translate, DEFAULT_LOCALE, type Locale, type MessageKey } from "../../lib/i18n/index.ts";

const POLICY_CODES = new Set([
  "spam", "harassment", "hate", "violence", "sexual_content", "personal_information",
  "fraud", "illegal_content", "dangerous_vehicle_advice", "intellectual_property",
]);

/** The policy wording an author sees; unknown codes read as the general guidelines. */
export function policyLabelForAuthor(policyCategory: string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  const code = policyCategory ?? "other";
  return POLICY_CODES.has(code)
    ? translate(locale, `report.reason.${code}` as MessageKey)
    : translate(locale, "policy.community_guidelines");
}

export type NotificationDraft = {
  title: string;
  body: string;
  data: Record<string, unknown>;
  push: { title: string; body: string; data: Record<string, unknown> } | null;
};

const ENTITY_TYPES = new Set(["community_post", "community_comment", "profile", "group", "listing", "review", "message", "media"]);

function entityNoun(entityType: string, locale: Locale) {
  return translate(locale, (ENTITY_TYPES.has(entityType) ? `entity.${entityType}` : "entity.unknown") as MessageKey);
}

// Appeals exist only for Community posts (open_moderation_appeal); every other
// removal points the author at support instead of a path that does not exist.
function appealable(entityType: string) {
  return entityType === "community_post";
}

function removedScope(entityType: string, locale: Locale) {
  return translate(locale, entityType === "listing" ? "scope.marketplace" : entityType === "message" ? "scope.conversation" : "scope.community");
}

export function authorRestoredMessage(input: {
  outboxId: string;
  caseId: string;
  entityType: string;
  entityId: string;
  locale?: Locale;
}): NotificationDraft {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const noun = entityNoun(input.entityType, locale);
  return {
    title: translate(locale, "notice.author_restored.title", { noun }),
    body: translate(locale, "notice.author_restored.body", { noun }),
    data: { kind: "author_restored", outboxId: input.outboxId, caseId: input.caseId, entityType: input.entityType, entityId: input.entityId },
    push: {
      title: translate(locale, "notice.author_restored.title", { noun }),
      body: translate(locale, "notice.author_restored.push_body"),
      data: { kind: "moderation_decision", entityType: input.entityType, entityId: input.entityId },
    },
  };
}

export function authorRemovedMessage(input: {
  outboxId: string;
  caseId: string;
  entityType: string;
  entityId: string;
  policyCategory: string | null;
  decidedAt: string;
  locale?: Locale;
}): NotificationDraft {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const noun = entityNoun(input.entityType, locale);
  const canAppeal = appealable(input.entityType);
  return {
    title: translate(locale, "notice.author_removed.title", { noun, scope: removedScope(input.entityType, locale) }),
    body: translate(locale, "notice.author_removed.body", {
      noun,
      policy: policyLabelForAuthor(input.policyCategory, locale),
      next_step: translate(locale, canAppeal ? "notice.author_removed.appeal" : "notice.author_removed.support"),
    }),
    data: {
      kind: "author_removed", outboxId: input.outboxId, caseId: input.caseId, entityType: input.entityType,
      entityId: input.entityId, policyCategory: input.policyCategory, decidedAt: input.decidedAt, appealable: canAppeal,
    },
    push: {
      title: translate(locale, "notice.author_removed.push_title", { noun }),
      body: translate(locale, "notice.author_removed.push_body"),
      data: { kind: "moderation_decision", entityType: input.entityType, entityId: input.entityId },
    },
  };
}

export function reportReceivedMessage(input: { outboxId: string; caseId: string; hidden: boolean; locale?: Locale }): NotificationDraft {
  const locale = input.locale ?? DEFAULT_LOCALE;
  return {
    title: translate(locale, "notice.report_received.title"),
    body: translate(locale, input.hidden ? "notice.report_received.hidden" : "notice.report_received.recorded"),
    data: { kind: "report_received", outboxId: input.outboxId, caseId: input.caseId },
    push: null,
  };
}

export function reporterReviewCompleteMessage(input: { outboxId: string; caseId: string; locale?: Locale }): NotificationDraft {
  const locale = input.locale ?? DEFAULT_LOCALE;
  return {
    title: translate(locale, "notice.reporter_review_complete.title"),
    body: translate(locale, "notice.reporter_review_complete.body"),
    data: { kind: "reporter_review_complete", outboxId: input.outboxId, caseId: input.caseId },
    push: null,
  };
}

export function moderatorAlertMessage(input: {
  outboxId: string;
  eventType: "case_opened" | "case_escalated" | "sla_alert" | "queue_backlog";
  caseId: string;
  priority?: string | null;
  stage?: string | null;
  slaDueAt?: string | null;
  openCases?: number | null;
  casesOver24h?: number | null;
  sustained?: boolean | null;
  reason?: string | null;
}): NotificationDraft {
  const short = input.caseId.slice(0, 8);
  let title: string;
  let body: string;
  switch (input.eventType) {
    case "case_escalated":
      title = t("notice.moderator.escalated.title", { case: short });
      body = input.reason === "legal_hold"
        ? t("notice.moderator.escalated.legal_hold")
        : t("notice.moderator.escalated.priority", { priority: input.priority ?? "urgent" });
      break;
    case "sla_alert":
      title = input.stage === "overdue"
        ? t("notice.moderator.sla.overdue", { case: short })
        : input.stage === "urgent_unacknowledged"
          ? t("notice.moderator.sla.urgent_unacknowledged", { case: short })
          : t("notice.moderator.sla.due_soon", { case: short });
      body = input.slaDueAt ? t("notice.moderator.sla.target", { due: input.slaDueAt }) : t("notice.moderator.sla.approaching");
      break;
    case "queue_backlog":
      title = t(input.sustained ? "notice.moderator.backlog.sustained" : "notice.moderator.backlog.title");
      body = t("notice.moderator.backlog.body", { open: input.openCases ?? 0, stale: input.casesOver24h ?? 0 });
      break;
    default:
      title = input.reason === "appeal" ? t("notice.moderator.appeal_opened", { case: short }) : t("notice.moderator.new_case", { case: short });
      body = t("notice.moderator.priority", { priority: input.priority ?? "normal" });
  }
  return {
    title,
    body,
    data: {
      kind: input.eventType, outboxId: input.outboxId, caseId: input.caseId, priority: input.priority ?? null,
      stage: input.stage ?? null,
    },
    push: { title, body, data: { kind: "moderation_case", caseId: input.caseId } },
  };
}

/** Webhook body for protected operational channels: identifiers only. */
export function operationalWebhookBody(input: {
  eventType: string;
  caseId: string;
  priority?: string | null;
  stage?: string | null;
  slaDueAt?: string | null;
  openCases?: number | null;
  casesOver24h?: number | null;
  sustained?: boolean | null;
  caseUrl: string;
}) {
  const text = [
    `[PerfectPPI moderation] ${input.eventType}`,
    input.stage ? `stage=${input.stage}` : null,
    input.priority ? `priority=${input.priority}` : null,
    input.slaDueAt ? `due=${input.slaDueAt}` : null,
    input.openCases != null ? `open=${input.openCases}` : null,
    input.casesOver24h != null ? `over24h=${input.casesOver24h}` : null,
    input.sustained ? "sustained=true" : null,
    input.caseUrl,
  ].filter(Boolean).join(" ");
  return { text, eventType: input.eventType, caseId: input.caseId, priority: input.priority ?? null, stage: input.stage ?? null };
}

/** Counts-only visibility alert. It deliberately contains no content or IDs. */
export function visibilityIntegrityWebhookBody(input: {
  available: boolean;
  activeRestrictedPosts: number;
  activeRestrictedComments: number;
  openCaseVisibleContent: number;
  totalViolations: number;
}) {
  const eventType = input.available
    ? "moderation_visibility_integrity_violation"
    : "moderation_visibility_integrity_unavailable";
  const text = input.available
    ? `[PerfectPPI moderation] ${eventType} total=${input.totalViolations} posts=${input.activeRestrictedPosts} comments=${input.activeRestrictedComments} openCases=${input.openCaseVisibleContent}`
    : `[PerfectPPI moderation] ${eventType}`;
  return {
    text,
    eventType,
    totalViolations: input.totalViolations,
    activeRestrictedPosts: input.activeRestrictedPosts,
    activeRestrictedComments: input.activeRestrictedComments,
    openCaseVisibleContent: input.openCaseVisibleContent,
  };
}
