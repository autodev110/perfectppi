import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushToProfile } from "@/lib/push/dispatch";
import { notificationLink } from "@/features/notifications/preferences";
import type { Database, Json } from "@/types/database";
import {
  authorRemovedMessage,
  authorRestoredMessage,
  moderatorAlertMessage,
  operationalWebhookBody,
  reportReceivedMessage,
  reporterReviewCompleteMessage,
  visibilityIntegrityWebhookBody,
  type NotificationDraft,
} from "./outbox-messages";
import { getModerationVisibilityIntegrity } from "./visibility-integrity";

// Moderation outbox processor (plan 22.1 / 29.8 / 33). Claims durable jobs,
// creates in-app notification records first (so a failed push never loses
// the notice), pushes best-effort, and posts identifiers-only alerts to the
// protected operational channel. Every step is idempotent: a job replayed
// after a crash finds its notifications already written and skips them.

type OutboxRow = Database["public"]["Tables"]["moderation_outbox"]["Row"];
type NotificationType = Database["public"]["Enums"]["notification_type"];

export type OutboxReport = {
  sla: Record<string, number>;
  visibilityIntegrity: {
    available: boolean;
    totalViolations: number;
  };
  claimed: number;
  completed: number;
  failed: number;
  deadLettered: number;
  byType: Record<string, number>;
};

function field(payload: Json, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, Json | undefined>)[key];
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function numberField(payload: Json, key: string): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, Json | undefined>)[key];
  return typeof value === "number" ? value : null;
}

function boolField(payload: Json, key: string): boolean | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, Json | undefined>)[key];
  return typeof value === "boolean" ? value : null;
}

async function deliver(profileId: string, type: NotificationType, draft: NotificationDraft) {
  const admin = createAdminClient();
  // Idempotency: one notice per (recipient, outbox job).
  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", profileId)
    .contains("data", { outboxId: draft.data.outboxId })
    .limit(1)
    .maybeSingle();
  if (existing) return false;

  const { data: inserted, error } = await admin.from("notifications").insert({
    user_id: profileId,
    type,
    title: draft.title,
    body: draft.body,
    data: draft.data as Json,
  }).select("id").maybeSingle();
  if (error) throw new Error(`notification insert failed: ${error.message}`);

  if (draft.push) {
    // Best-effort; the in-app record above is the durable notice. The link
    // routes the tap through /notifications/<id> (permission-checked).
    await pushToProfile(profileId, {
      title: draft.push.title,
      body: draft.push.body,
      data: {
        ...draft.push.data,
        ...(inserted ? { notification_id: inserted.id, link: notificationLink(inserted.id) } : {}),
      },
    })
      .catch((pushError) => console.warn("[moderation-outbox] push failed", pushError instanceof Error ? pushError.message : pushError));
  }
  return true;
}

async function moderatorRecipients(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("moderation_role_grants")
    .select("profile_id")
    .eq("capability", "queue_read")
    .is("revoked_at", null);
  const candidates = [...new Set((data ?? []).map((row) => row.profile_id))];
  // A suspended or pending holder keeps the grant row but must not be paged.
  const eligible = await Promise.all(candidates.map(async (profileId) => {
    const { data: available, error } = await admin.rpc("social_profile_is_available", {
      p_profile_id: profileId,
    });
    if (error) throw new Error(`moderator eligibility check failed: ${error.message}`);
    return available ? profileId : null;
  }));
  return eligible.filter((profileId): profileId is string => Boolean(profileId));
}

async function postOperationalWebhook(
  body: ReturnType<typeof operationalWebhookBody> | ReturnType<typeof visibilityIntegrityWebhookBody>,
) {
  const url = process.env.MODERATION_ALERT_WEBHOOK_URL;
  if (!url) return;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`operational webhook responded ${response.status}`);
}

function caseUrl(caseId: string) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.CANONICAL_ORIGIN ?? "").replace(/\/$/, "");
  return `${origin}/admin/moderation/cases/${caseId}`;
}

async function handle(job: OutboxRow): Promise<void> {
  const admin = createAdminClient();
  const caseId = field(job.payload, "caseId") ?? job.case_id;

  switch (job.event_type) {
    case "author_restored":
    case "author_removed": {
      const { data: moderationCase } = await admin
        .from("moderation_cases")
        .select("id, entity_type, entity_id, closed_at, moderation_item_id")
        .eq("id", job.case_id)
        .maybeSingle();
      if (!moderationCase) return;
      const { data: item } = await admin
        .from("moderation_items")
        .select("author_id, reason_codes")
        .eq("id", moderationCase.moderation_item_id)
        .maybeSingle();
      // Author already gone (account deleted): nothing to notify, job done.
      if (!item?.author_id) return;
      const policyCategory = item.reason_codes.find((code) => code.startsWith("policy:"))?.slice("policy:".length) ?? null;
      const draft = job.event_type === "author_restored"
        ? authorRestoredMessage({ outboxId: job.id, caseId: moderationCase.id, entityType: moderationCase.entity_type, entityId: moderationCase.entity_id })
        : authorRemovedMessage({
            outboxId: job.id, caseId: moderationCase.id, entityType: moderationCase.entity_type, entityId: moderationCase.entity_id,
            policyCategory, decidedAt: moderationCase.closed_at ?? new Date().toISOString(),
          });
      await deliver(item.author_id, "moderation_decision", draft);
      return;
    }

    case "report_received": {
      const reporterId = field(job.payload, "reporterId");
      if (!reporterId) return;
      const { data: moderationCase } = await admin
        .from("moderation_cases").select("state").eq("id", job.case_id).maybeSingle();
      const hidden = moderationCase ? moderationCase.state !== "monitoring" : true;
      await deliver(reporterId, "report_received", reportReceivedMessage({ outboxId: job.id, caseId: job.case_id, hidden }));
      return;
    }

    case "reporters_review_complete": {
      const { data: reports } = await admin
        .from("moderation_reports").select("reporter_id").eq("case_id", job.case_id);
      const reporters = [...new Set((reports ?? []).map((row) => row.reporter_id).filter((id): id is string => Boolean(id)))];
      for (const reporterId of reporters) {
        await deliver(reporterId, "report_received", reporterReviewCompleteMessage({ outboxId: job.id, caseId: job.case_id }));
      }
      return;
    }

    case "case_opened":
    case "case_escalated":
    case "sla_alert":
    case "queue_backlog": {
      const draft = moderatorAlertMessage({
        outboxId: job.id,
        eventType: job.event_type,
        caseId,
        priority: field(job.payload, "priority"),
        stage: field(job.payload, "stage"),
        slaDueAt: field(job.payload, "slaDueAt"),
        openCases: numberField(job.payload, "openCases"),
        casesOver24h: numberField(job.payload, "casesOver24h"),
        sustained: boolField(job.payload, "sustained"),
        reason: field(job.payload, "reason"),
      });
      for (const moderatorId of await moderatorRecipients()) {
        await deliver(moderatorId, "moderation_case", draft);
      }
      // Protected operational channel for anything that pages (plan 18.5 / 20.3).
      const stage = field(job.payload, "stage");
      const pages = job.event_type === "case_escalated"
        || job.event_type === "queue_backlog"
        || (job.event_type === "sla_alert" && (stage === "overdue" || stage === "urgent_unacknowledged"))
        || field(job.payload, "priority") === "urgent";
      if (pages) {
        await postOperationalWebhook(operationalWebhookBody({
          eventType: job.event_type,
          caseId,
          priority: field(job.payload, "priority"),
          stage,
          slaDueAt: field(job.payload, "slaDueAt"),
          openCases: numberField(job.payload, "openCases"),
          casesOver24h: numberField(job.payload, "casesOver24h"),
          sustained: boolField(job.payload, "sustained"),
          caseUrl: caseUrl(caseId),
        }));
      }
      return;
    }

    default:
      throw new Error(`unknown outbox event type ${job.event_type}`);
  }
}

export async function processModerationOutbox(limit = 50): Promise<OutboxReport> {
  const admin = createAdminClient();
  const integrity = await getModerationVisibilityIntegrity();
  const report: OutboxReport = {
    sla: {},
    visibilityIntegrity: {
      available: integrity.available,
      totalViolations: integrity.totalViolations,
    },
    claimed: 0,
    completed: 0,
    failed: 0,
    deadLettered: 0,
    byType: {},
  };

  const { data: sla, error: slaError } = await admin.rpc("enqueue_moderation_sla_alerts");
  if (slaError) {
    console.error("[moderation-outbox] SLA alert generation failed", slaError.message);
  } else if (sla && typeof sla === "object" && !Array.isArray(sla)) {
    report.sla = Object.fromEntries(Object.entries(sla).map(([key, value]) => [key, Number(value ?? 0)]));
  }

  const { data: jobs, error: claimError } = await admin.rpc("claim_moderation_outbox", {
    p_limit: limit,
    p_worker: `outbox-${randomUUID()}`,
  });
  if (claimError) throw new Error(claimError.message);

  for (const job of jobs ?? []) {
    report.claimed += 1;
    report.byType[job.event_type] = (report.byType[job.event_type] ?? 0) + 1;
    try {
      await handle(job);
      const { error } = await admin.rpc("complete_moderation_outbox", { p_id: job.id, p_success: true });
      if (error) throw new Error(error.message);
      report.completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const { data: updated } = await admin.rpc("complete_moderation_outbox", {
        p_id: job.id, p_success: false, p_error: message,
      });
      report.failed += 1;
      if (updated?.dead_lettered_at) report.deadLettered += 1;
      console.error("[moderation-outbox] job failed", { id: job.id, type: job.event_type, message });
    }
  }

  // Page after draining durable jobs so an alert-provider outage cannot stop
  // reporter or moderator notifications from progressing.
  if (!integrity.available || integrity.totalViolations > 0) {
    await postOperationalWebhook(visibilityIntegrityWebhookBody(integrity));
  }
  return report;
}

export async function getModerationOperationsStatus(): Promise<Record<string, number>> {
  const { data } = await createAdminClient().rpc("moderation_operations_status");
  return data && typeof data === "object" && !Array.isArray(data)
    ? Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Number(value ?? 0)]))
    : {};
}
