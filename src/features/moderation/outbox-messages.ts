// Pure message builders for moderation notifications (plan 17.4, 22.1, 22.2).
// Kept free of imports so the privacy rules can be unit-tested:
//   * the author never learns who reported, why in the reporter's words, or
//     how many reports there were;
//   * the reporter never learns the outcome, other reports, or enforcement;
//   * push payloads carry no policy category, report reason, reporter
//     identity, or content text — the in-app record holds the detail.

export const REPORT_REASON_LABELS_FOR_AUTHOR: Record<string, string> = {
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
  other: "Community Guidelines",
};

export type NotificationDraft = {
  title: string;
  body: string;
  data: Record<string, unknown>;
  push: { title: string; body: string; data: Record<string, unknown> } | null;
};

function entityNoun(entityType: string) {
  return entityType === "community_comment" ? "comment" : "post";
}

export function authorRestoredMessage(input: {
  outboxId: string;
  caseId: string;
  entityType: string;
  entityId: string;
}): NotificationDraft {
  const noun = entityNoun(input.entityType);
  return {
    title: `Your ${noun} is visible again`,
    body: `Our team reviewed a report on your ${noun} and found no violation. It has been restored to its original audience.`,
    data: { kind: "author_restored", outboxId: input.outboxId, caseId: input.caseId, entityType: input.entityType, entityId: input.entityId },
    push: {
      title: `Your ${noun} is visible again`,
      body: "A moderation review is complete.",
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
}): NotificationDraft {
  const noun = entityNoun(input.entityType);
  const policy = REPORT_REASON_LABELS_FOR_AUTHOR[input.policyCategory ?? "other"] ?? "Community Guidelines";
  return {
    title: `Your ${noun} was removed from the Community`,
    body: `Our team removed your ${noun} for: ${policy}. You can appeal this decision from My Posts.`,
    data: {
      kind: "author_removed", outboxId: input.outboxId, caseId: input.caseId, entityType: input.entityType,
      entityId: input.entityId, policyCategory: input.policyCategory, decidedAt: input.decidedAt, appealable: true,
    },
    push: {
      title: `A moderation decision was made on your ${noun}`,
      body: "Open PerfectPPI to see the details and your options.",
      data: { kind: "moderation_decision", entityType: input.entityType, entityId: input.entityId },
    },
  };
}

export function reportReceivedMessage(input: { outboxId: string; caseId: string; hidden: boolean }): NotificationDraft {
  return {
    title: "Report received",
    body: input.hidden
      ? "Thank you. The content is hidden while the PerfectPPI team reviews it."
      : "Thank you. Your report has been recorded and will be reviewed.",
    data: { kind: "report_received", outboxId: input.outboxId, caseId: input.caseId },
    push: null,
  };
}

export function reporterReviewCompleteMessage(input: { outboxId: string; caseId: string }): NotificationDraft {
  return {
    title: "Our review is complete",
    body: "The PerfectPPI team has finished reviewing the content you reported. Thank you for helping keep the Community safe.",
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
      title = `Urgent: case ${short} needs immediate review`;
      body = input.reason === "legal_hold"
        ? "A case was escalated under legal hold and requires a designated reviewer."
        : `Priority ${input.priority ?? "urgent"} case awaiting review.`;
      break;
    case "sla_alert":
      title = input.stage === "overdue"
        ? `Overdue: case ${short} passed its review target`
        : input.stage === "urgent_unacknowledged"
          ? `Unacknowledged urgent case ${short}`
          : `Case ${short} is due soon`;
      body = input.slaDueAt ? `Review target: ${input.slaDueAt}.` : "Review target approaching.";
      break;
    case "queue_backlog":
      title = input.sustained ? "Moderation backlog sustained for 2+ hours" : "Moderation backlog above guardrail";
      body = `${input.openCases ?? 0} open cases, ${input.casesOver24h ?? 0} older than 24 hours. Pause beta expansion per plan 20.3 if this continues.`;
      break;
    default:
      title = input.reason === "appeal" ? `Appeal opened on case ${short}` : `New case ${short} in the queue`;
      body = `Priority ${input.priority ?? "normal"}.`;
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
