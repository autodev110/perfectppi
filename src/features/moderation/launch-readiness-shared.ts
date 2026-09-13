import type { ModerationCapability } from "./capability-codes";

export const LAUNCH_REQUIRED_MODERATION_CAPABILITIES = [
  "queue_read",
  "reporter_identity_read",
  "content_decide",
  "account_enforce",
  "evidence_export",
  "legal_hold_review",
] as const satisfies readonly ModerationCapability[];

export type LaunchReadinessStatus = "ready" | "warning" | "blocked" | "manual";

export type LaunchReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  status: LaunchReadinessStatus;
  href?: string;
};

export type LaunchReadinessInput = {
  flagSource: "database" | "safe_defaults";
  flags: {
    communityPhotoUploads: boolean;
    communityVideoUploads: boolean;
    reportAutoHide: boolean;
    specialistImageSafeguard: boolean;
  };
  scannerConfigured: boolean;
  workerCredentialsConfigured: boolean;
  moderationAlertWebhookConfigured: boolean;
  mediaStorage: {
    available: boolean;
    legacyPublicObjects: number;
    unverifiedRetirements: number;
  };
  moderationOperations: {
    available: boolean;
    casesOpen: number;
    casesOverdue: number;
    urgentUnacknowledged: number;
    casesOver24hShare: number;
    outboxDeadLettered: number;
    outboxOldestPendingMinutes: number;
  };
  visibilityIntegrity: {
    available: boolean;
    activeRestrictedPosts: number;
    activeRestrictedComments: number;
    openCaseVisibleContent: number;
    totalViolations: number;
  };
  moderatorCoverage: {
    available: boolean;
    counts: Partial<Record<ModerationCapability, number>>;
  };
  communityRetentionPolicyConfigured: boolean | null;
  storageCleanup: {
    available: boolean;
    pendingOrFailed: number;
    failed: number;
    oldestPendingMinutes: number;
  };
  workerHealth: {
    available: boolean;
    issues: string[];
  };
};

export type LaunchReadinessEvaluation = {
  automated: LaunchReadinessCheck[];
  manual: LaunchReadinessCheck[];
  blockedCount: number;
  warningCount: number;
  readyCount: number;
};

function blocked(id: string, label: string, detail: string, href?: string): LaunchReadinessCheck {
  return { id, label, detail, status: "blocked", href };
}

function ready(id: string, label: string, detail: string, href?: string): LaunchReadinessCheck {
  return { id, label, detail, status: "ready", href };
}

function warning(id: string, label: string, detail: string, href?: string): LaunchReadinessCheck {
  return { id, label, detail, status: "warning", href };
}

export function evaluateSocialLaunchReadiness(input: LaunchReadinessInput): LaunchReadinessEvaluation {
  const automated: LaunchReadinessCheck[] = [];

  automated.push(input.flagSource === "database"
    ? ready("flag-source", "Feature-flag source", "Server-authoritative flags loaded from the database.", "/admin/flags")
    : blocked("flag-source", "Feature-flag source", "The flag table could not be read. Safe defaults are active and the beta must remain closed.", "/admin/flags"));

  automated.push(!input.flags.communityVideoUploads
    ? ready("video-off", "Community video", "New Community video uploads are disabled for this release.", "/admin/flags")
    : blocked("video-off", "Community video", "Community video uploads are enabled even though video is deferred for this release.", "/admin/flags"));

  automated.push(input.flags.reportAutoHide
    ? ready("report-auto-hide", "Report auto-hide", "The first valid report hides the exact content globally pending review.", "/admin/flags")
    : blocked("report-auto-hide", "Report auto-hide", "The required first-report global hide control is disabled.", "/admin/flags"));

  if (!input.flags.communityPhotoUploads) {
    automated.push(ready("photo-safety", "Photo safety", "Community photo uploads are disabled, so no new public photos can bypass safeguards.", "/admin/flags"));
  } else if (!input.flags.specialistImageSafeguard) {
    automated.push(blocked("photo-safety", "Photo safety", "Photo uploads are enabled while the specialist image safeguard is disabled.", "/admin/flags"));
  } else if (!input.scannerConfigured) {
    automated.push(blocked("photo-safety", "Photo safety", "Photo uploads are enabled, but the specialist scanner URL or token is missing. New photos will remain private and pending review.", "/admin/moderation?tab=media"));
  } else {
    automated.push(ready("photo-safety", "Photo safety", "The specialist safeguard and scanner credentials are configured.", "/admin/moderation?tab=media"));
  }

  if (!input.mediaStorage.available) {
    automated.push(blocked("private-media", "Private Community media", "Media storage status could not be read; private delivery and legacy retirement cannot be verified.", "/admin/flags"));
  } else if (input.mediaStorage.legacyPublicObjects > 0) {
    automated.push(blocked("private-media", "Private Community media", `${input.mediaStorage.legacyPublicObjects} Community object(s) still have a permanent public URL.`, "/admin/flags"));
  } else if (input.mediaStorage.unverifiedRetirements > 0) {
    automated.push(blocked("private-media", "Private Community media", `${input.mediaStorage.unverifiedRetirements} retired public URL(s) still require external denial verification.`, "/admin/flags"));
  } else {
    automated.push(ready("private-media", "Private Community media", "No permanent public Community objects or unverified retirements were reported.", "/admin/flags"));
  }

  if (!input.moderatorCoverage.available) {
    automated.push(blocked("moderator-coverage", "Moderator capability coverage", "Active moderation grants could not be verified.", "/admin/moderation/access"));
  } else {
    const missing = LAUNCH_REQUIRED_MODERATION_CAPABILITIES.filter((capability) => (input.moderatorCoverage.counts[capability] ?? 0) < 1);
    automated.push(missing.length === 0
      ? ready("moderator-coverage", "Moderator capability coverage", "Every restricted moderation capability has at least one active, eligible holder.", "/admin/moderation/access")
      : blocked("moderator-coverage", "Moderator capability coverage", `No active eligible holder for: ${missing.join(", ")}.`, "/admin/moderation/access"));
  }

  if (!input.moderationOperations.available) {
    automated.push(blocked("moderation-health", "Moderation queue health", "Queue and notification-outbox health could not be read.", "/admin/moderation"));
  } else {
    const operations = input.moderationOperations;
    const unhealthy = operations.casesOverdue > 0
      || operations.urgentUnacknowledged > 0
      || operations.outboxDeadLettered > 0
      || operations.casesOpen > 25
      || operations.casesOver24hShare > 20
      || operations.outboxOldestPendingMinutes > 15;
    automated.push(unhealthy
      ? blocked("moderation-health", "Moderation queue health", `${operations.casesOverdue} overdue, ${operations.urgentUnacknowledged} urgent unacknowledged, ${operations.outboxDeadLettered} dead-lettered; oldest pending notification ${operations.outboxOldestPendingMinutes} minute(s).`, "/admin/moderation")
      : ready("moderation-health", "Moderation queue health", `${operations.casesOpen} open case(s); no SLA or notification-outbox guardrail is exceeded.`, "/admin/moderation"));
  }

  if (!input.visibilityIntegrity.available) {
    automated.push(blocked("visibility-integrity", "Hidden-content integrity", "Visibility integrity could not be verified; the social beta must remain closed.", "/admin/moderation"));
  } else if (input.visibilityIntegrity.totalViolations > 0) {
    automated.push(blocked(
      "visibility-integrity",
      "Hidden-content integrity",
      `${input.visibilityIntegrity.totalViolations} visibility invariant violation(s): ${input.visibilityIntegrity.activeRestrictedPosts} post state mismatch(es), ${input.visibilityIntegrity.activeRestrictedComments} comment state mismatch(es), ${input.visibilityIntegrity.openCaseVisibleContent} visible open-case item(s).`,
      "/admin/moderation",
    ));
  } else {
    automated.push(ready("visibility-integrity", "Hidden-content integrity", "No restrictive-state or visible open-case inconsistencies were detected.", "/admin/moderation"));
  }

  automated.push(input.communityRetentionPolicyConfigured === null
    ? blocked("retention-policy", "Community evidence retention", "The approved Community retention policy could not be verified.", "/admin/moderation/retention")
    : input.communityRetentionPolicyConfigured
      ? ready("retention-policy", "Community evidence retention", "An approved community_safety retention period is recorded.", "/admin/moderation/retention")
      : blocked("retention-policy", "Community evidence retention", "No approved community_safety retention period is recorded.", "/admin/moderation/retention"));

  automated.push(input.workerCredentialsConfigured
    ? ready("worker-auth", "Background workers", "CRON_SECRET is configured for scheduled queue, cleanup, and retention jobs.")
    : blocked("worker-auth", "Background workers", "CRON_SECRET is missing, so scheduled workers will refuse Vercel Cron requests."));

  automated.push(!input.workerHealth.available
    ? blocked("worker-heartbeats", "Worker heartbeats", "Worker-run history could not be read, so scheduled execution cannot be verified.")
    : input.workerHealth.issues.length > 0
      ? blocked("worker-heartbeats", "Worker heartbeats", input.workerHealth.issues.join(" "))
      : ready("worker-heartbeats", "Worker heartbeats", "Moderation, cleanup, media-retirement, and retention workers show recent healthy activity."));

  if (!input.storageCleanup.available) {
    automated.push(blocked("storage-cleanup", "Storage cleanup queue", "Storage cleanup health could not be read."));
  } else if (input.storageCleanup.failed > 0 || input.storageCleanup.oldestPendingMinutes > 60) {
    automated.push(blocked("storage-cleanup", "Storage cleanup queue", `${input.storageCleanup.failed} failed job(s); oldest pending cleanup ${input.storageCleanup.oldestPendingMinutes} minute(s).`));
  } else if (input.storageCleanup.pendingOrFailed > 0) {
    automated.push(warning("storage-cleanup", "Storage cleanup queue", `${input.storageCleanup.pendingOrFailed} recent cleanup job(s) are waiting for the next worker run.`));
  } else {
    automated.push(ready("storage-cleanup", "Storage cleanup queue", "No pending or failed storage cleanup jobs."));
  }

  automated.push(input.moderationAlertWebhookConfigured
    ? ready("alert-destination", "Moderation alert destination", "A secure moderation alert webhook is configured.")
    : warning("alert-destination", "Moderation alert destination", "No valid HTTPS MODERATION_ALERT_WEBHOOK_URL is configured. Confirm an equivalent monitored alert path before launch."));

  const manual: LaunchReadinessCheck[] = [
    { id: "product-signoff", label: "Product and engineering sign-off", detail: "Approve the phased scope, state model, enabled flags, ownership, and release decision.", status: "manual" },
    { id: "trust-safety", label: "Trust & Safety operations", detail: "Confirm the named owner, moderator roster, escalation contacts, coverage schedule, and response targets.", status: "manual" },
    { id: "legal-policy", label: "Counsel and policy approval", detail: "Approve the age approach, moderation retention, copyright, emergency/law-enforcement, and required reporting workflows.", status: "manual", href: "/support" },
    { id: "disclosure-store", label: "Disclosures and App Store support", detail: "Confirm Privacy, Terms, Community Guidelines, AI disclosure, the support URL, and the monitored contact match production.", status: "manual", href: "/community-guidelines" },
    { id: "device-acceptance", label: "Manual client acceptance", detail: "Run current/older iOS, web, two-device, offline/retry, VoiceOver, Dynamic Type, keyboard, and stale-cache scenarios.", status: "manual" },
    { id: "rollback-drill", label: "Rollback and kill-switch drill", detail: "Practice disabling publication, photo upload, groups, and events, then verify old/custom clients cannot bypass the server controls.", status: "manual", href: "/admin/flags" },
  ];

  return {
    automated,
    manual,
    blockedCount: automated.filter((check) => check.status === "blocked").length,
    warningCount: automated.filter((check) => check.status === "warning").length,
    readyCount: automated.filter((check) => check.status === "ready").length,
  };
}
