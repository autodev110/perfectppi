import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type {
  IntegrationStatus,
  PartnerEventType,
} from "./constants";
import type { PpiRequestStatus } from "@/types/enums";

// ============================================================================
// Outbound event outbox.
//
// Enqueueing is deliberately cheap and never throws into the caller's path: a
// lifecycle notification failing to queue must not roll back the inspection
// action that produced it. Delivery is the worker's problem.
// ============================================================================

export interface EnqueueEventParams {
  connectionId: string;
  refId: string;
  requestId: string;
  type: PartnerEventType;
  /** Extra fields merged into the signed body. Keep it small — no artifacts. */
  data?: Record<string, unknown>;
  /**
   * Collapses repeats onto one logical event. Defaults to one event of each
   * type per inspection.
   */
  dedupeKey?: string;
}

export async function enqueuePartnerEvent(
  params: EnqueueEventParams,
): Promise<{ eventId: string } | null> {
  const admin = createAdminClient();
  const eventId = `evt_${randomUUID().replace(/-/g, "")}`;

  const payload = {
    eventId,
    type: params.type,
    occurredAt: new Date().toISOString(),
    inspectionId: params.requestId,
    ...(params.data ?? {}),
  };

  const { error } = await admin.from("outbound_events").insert({
    partner_connection_id: params.connectionId,
    external_inspection_ref_id: params.refId,
    event_type: params.type,
    payload: payload as unknown as Json,
    dedupe_key: params.dedupeKey ?? `${params.type}:${params.refId}`,
  });

  if (error) {
    // 23505 is the dedupe index doing its job — the event is already queued.
    if (error.code !== "23505") {
      console.error("partner: enqueue event failed", params.type, error.message);
    }
    return null;
  }

  return { eventId };
}

// ============================================================================
// Lifecycle mirroring
//
// Perfect PPI's own request status is authoritative; external_inspection_refs
// carries the partner-facing projection of it, which is broader (it also covers
// output generation and delivery, which have no PPI request status).
// ============================================================================

const STATUS_TO_INTEGRATION: Partial<Record<PpiRequestStatus, IntegrationStatus>> = {
  assigned: "assigned",
  accepted: "accepted",
  in_progress: "in_progress",
  submitted: "submitted",
  needs_revision: "needs_revision",
  archived: "cancelled",
};

const STATUS_TO_EVENT: Partial<Record<PpiRequestStatus, PartnerEventType>> = {
  assigned: "inspection.assigned",
  accepted: "inspection.accepted",
  in_progress: "inspection.started",
  submitted: "inspection.submitted",
  needs_revision: "inspection.needs_revision",
  archived: "inspection.cancelled",
};

/**
 * Mirrors a PPI request status change onto the partner integration record and
 * queues the matching webhook. A no-op for inspections that did not come from a
 * partner, which is the common case.
 */
export async function syncPartnerLifecycle(
  requestId: string,
  status: PpiRequestStatus,
  options?: { submissionId?: string | null },
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: ref } = await admin
      .from("external_inspection_refs")
      .select("id, partner_connection_id, integration_status, current_submission_id")
      .eq("ppi_request_id", requestId)
      .maybeSingle();

    if (!ref) return;

    const integrationStatus = STATUS_TO_INTEGRATION[status];
    const update: Record<string, unknown> = {};
    if (integrationStatus) update.integration_status = integrationStatus;
    if (options?.submissionId) update.current_submission_id = options.submissionId;

    if (Object.keys(update).length > 0) {
      await admin.from("external_inspection_refs").update(update).eq("id", ref.id);
    }

    const eventType = STATUS_TO_EVENT[status];
    if (!eventType) return;

    // A resubmission legitimately produces a second inspection.submitted, so
    // the submission id joins the dedupe key for those.
    const submissionId = options?.submissionId ?? ref.current_submission_id;
    const dedupeKey =
      status === "submitted" && submissionId
        ? `${eventType}:${ref.id}:${submissionId}`
        : `${eventType}:${ref.id}`;

    await enqueuePartnerEvent({
      connectionId: ref.partner_connection_id,
      refId: ref.id,
      requestId,
      type: eventType,
      data: submissionId ? { submissionId } : undefined,
      dedupeKey,
    });
  } catch (error) {
    // Lifecycle notification is best-effort. DealerSpace also polls the status
    // endpoint, and the deliverables_ready event is queued through a separate,
    // transactional path.
    console.error("partner: lifecycle sync failed", error);
  }
}

/** Records an integration-only status that has no PPI request equivalent. */
export async function setIntegrationStatus(
  requestId: string,
  integrationStatus: IntegrationStatus,
  options?: { event?: PartnerEventType; data?: Record<string, unknown> },
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: ref } = await admin
      .from("external_inspection_refs")
      .select("id, partner_connection_id")
      .eq("ppi_request_id", requestId)
      .maybeSingle();

    if (!ref) return;

    await admin
      .from("external_inspection_refs")
      .update({ integration_status: integrationStatus })
      .eq("id", ref.id);

    if (options?.event) {
      await enqueuePartnerEvent({
        connectionId: ref.partner_connection_id,
        refId: ref.id,
        requestId,
        type: options.event,
        data: options.data,
        dedupeKey: `${options.event}:${ref.id}:${integrationStatus}`,
      });
    }
  } catch (error) {
    console.error("partner: integration status update failed", error);
  }
}
