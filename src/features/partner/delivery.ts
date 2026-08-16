import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, signWebhookPayload } from "./crypto";
import { checkUrlIsSafeDestination } from "./url-safety";
import {
  WEBHOOK_LEASE_SECONDS,
  WEBHOOK_TIMEOUT_MS,
  backoffDelayMs,
} from "./constants";
import type { Json } from "@/types/database";

// ============================================================================
// Outbound webhook delivery.
//
// Perfect PPI only *notifies*. The body is event metadata; DealerSpace then
// pulls the manifest and artifact bytes over the authenticated partner API. No
// PDF ever travels through a webhook.
//
// Delivery is at-least-once: DealerSpace must deduplicate on eventId.
// ============================================================================

export type DeliveryErrorCategory =
  | "timeout"
  | "network"
  | "http_4xx"
  | "http_5xx"
  | "configuration"
  | "unknown";

export interface DeliveryTickResult {
  claimed: number;
  delivered: number;
  failed: number;
  retrying: number;
  events: Array<{
    eventId: string;
    type: string;
    outcome: "delivered" | "retrying" | "failed";
    responseStatus?: number;
    error?: string;
  }>;
}

export async function runDeliveryWorkerTick(options?: {
  limit?: number;
  workerId?: string;
}): Promise<DeliveryTickResult> {
  const admin = createAdminClient();
  const workerId = options?.workerId ?? `deliver-${randomUUID().slice(0, 8)}`;

  await pruneExpiredRows(admin);

  const { data: claimed, error } = await admin.rpc("claim_outbound_events", {
    p_worker_id: workerId,
    p_limit: options?.limit ?? 10,
    p_lease_seconds: WEBHOOK_LEASE_SECONDS,
  });

  if (error) {
    console.error("delivery: claim failed", error.message);
    throw new Error(`Failed to claim outbound events: ${error.message}`);
  }

  const events = claimed ?? [];
  const result: DeliveryTickResult = {
    claimed: events.length,
    delivered: 0,
    failed: 0,
    retrying: 0,
    events: [],
  };

  for (const event of events) {
    const outcome = await deliverEvent(event);

    result.events.push({
      eventId: event.id,
      type: event.event_type,
      outcome: outcome.state,
      responseStatus: outcome.responseStatus,
      error: outcome.errorMessage,
    });

    if (outcome.state === "delivered") result.delivered += 1;
    else if (outcome.state === "failed") result.failed += 1;
    else result.retrying += 1;
  }

  return result;
}

/**
 * Both of these tables are written on a hot path and never read again once
 * they age out, so without a sweep they grow forever: one row per connection
 * per minute of traffic, and one per abandoned linking attempt.
 *
 * Consumed and revoked link transactions are kept — they are the audit trail
 * for who authorized what. Only attempts that expired without ever being used
 * are discarded.
 */
async function pruneExpiredRows(admin: ReturnType<typeof createAdminClient>) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [buckets, transactions] = await Promise.all([
    admin.from("partner_rate_limit_buckets").delete().lt("window_start", oneHourAgo),
    admin
      .from("partner_user_link_transactions")
      .delete()
      .eq("status", "pending")
      .lt("expires_at", sevenDaysAgo),
  ]);

  // Housekeeping must never stop a delivery from going out.
  if (buckets.error) console.error("delivery: bucket prune failed", buckets.error.message);
  if (transactions.error) {
    console.error("delivery: transaction prune failed", transactions.error.message);
  }
}

interface DeliveryOutcome {
  state: "delivered" | "retrying" | "failed";
  responseStatus?: number;
  errorMessage?: string;
}

type OutboundEventRow = {
  id: string;
  partner_connection_id: string;
  external_inspection_ref_id: string | null;
  event_type: string;
  payload: Json;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
};

async function deliverEvent(event: OutboundEventRow): Promise<DeliveryOutcome> {
  const admin = createAdminClient();

  const { data: connection } = await admin
    .from("partner_connections")
    .select("id, status, webhook_url, webhook_secret_ciphertext")
    .eq("id", event.partner_connection_id)
    .maybeSingle();

  if (!connection || connection.status !== "active" || !connection.webhook_url) {
    return finalize(event, {
      state: "failed",
      errorMessage: !connection
        ? "connection missing"
        : connection.status !== "active"
          ? "connection revoked"
          : "no webhook URL registered",
    }, "configuration", null);
  }

  // Re-checked on every attempt, not just at registration: DNS for a host that
  // was public yesterday can point at an internal address today.
  const destination = await checkUrlIsSafeDestination(connection.webhook_url);
  if (!destination.ok) {
    return finalize(
      event,
      { state: "failed", errorMessage: `unsafe webhook destination: ${destination.reason}` },
      "configuration",
      null,
    );
  }

  let secret: string;
  try {
    secret = decryptSecret(connection.webhook_secret_ciphertext);
  } catch (error) {
    return finalize(
      event,
      { state: "failed", errorMessage: `cannot decrypt signing secret: ${asMessage(error)}` },
      "configuration",
      null,
    );
  }

  // Serialize once. The bytes we sign must be byte-identical to the bytes we
  // send, because DealerSpace verifies against its own raw request body.
  const rawBody = JSON.stringify(event.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signWebhookPayload({ secret, timestamp, rawBody });

  const startedAt = Date.now();
  let responseStatus: number | null = null;
  let errorCategory: DeliveryErrorCategory | null = null;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(connection.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PerfectPPI-Webhooks/1",
        "X-PerfectPPI-Connection": connection.id,
        "X-PerfectPPI-Event-Id": String(
          (event.payload as { eventId?: string })?.eventId ?? event.id,
        ),
        "X-PerfectPPI-Timestamp": timestamp,
        "X-PerfectPPI-Signature": signature,
      },
      body: rawBody,
      // A redirect would send the signed body to a host we never validated.
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    responseStatus = response.status;

    if (response.status >= 200 && response.status < 300) {
      await recordAttempt(event, {
        url: connection.webhook_url,
        responseStatus,
        errorCategory: null,
        errorMessage: null,
        durationMs: Date.now() - startedAt,
      });
      return finalize(event, { state: "delivered", responseStatus }, null, responseStatus);
    }

    if (response.status >= 300 && response.status < 400) {
      errorCategory = "configuration";
      errorMessage = `webhook endpoint redirected (${response.status}); register the final URL instead`;
    } else if (response.status >= 400 && response.status < 500) {
      // 408 and 429 are the two 4xx that mean "later", not "never".
      errorCategory = response.status === 408 || response.status === 429 ? "http_5xx" : "http_4xx";
      errorMessage = `endpoint returned ${response.status}`;
    } else {
      errorCategory = "http_5xx";
      errorMessage = `endpoint returned ${response.status}`;
    }
  } catch (error) {
    const message = asMessage(error);
    errorCategory = /timeout|abort/i.test(message) ? "timeout" : "network";
    errorMessage = message;
  }

  await recordAttempt(event, {
    url: connection.webhook_url,
    responseStatus,
    errorCategory,
    errorMessage,
    durationMs: Date.now() - startedAt,
  });

  // A 4xx or a misconfigured endpoint will not fix itself by being retried.
  const permanent = errorCategory === "http_4xx" || errorCategory === "configuration";
  const exhausted = permanent || event.attempt_count >= event.max_attempts;

  return finalize(
    event,
    {
      state: exhausted ? "failed" : "retrying",
      responseStatus: responseStatus ?? undefined,
      errorMessage: errorMessage ?? undefined,
    },
    errorCategory,
    responseStatus,
  );
}

async function recordAttempt(
  event: OutboundEventRow,
  details: {
    url: string;
    responseStatus: number | null;
    errorCategory: DeliveryErrorCategory | null;
    errorMessage: string | null;
    durationMs: number;
  },
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.from("webhook_delivery_attempts").insert({
    outbound_event_id: event.id,
    attempt_number: event.attempt_count,
    request_url: details.url,
    response_status: details.responseStatus,
    error_category: details.errorCategory,
    error_message: details.errorMessage?.slice(0, 1000) ?? null,
    duration_ms: details.durationMs,
  });

  if (error) console.error("delivery: attempt log failed", error.message);
}

async function finalize(
  event: OutboundEventRow,
  outcome: DeliveryOutcome,
  errorCategory: DeliveryErrorCategory | null,
  responseStatus: number | null,
): Promise<DeliveryOutcome> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const update: Record<string, unknown> = {
    locked_at: null,
    lock_expires_at: null,
    locked_by: null,
    last_response_status: responseStatus,
  };

  if (outcome.state === "delivered") {
    update.status = "delivered";
    update.delivered_at = now;
    update.last_error = null;
  } else {
    update.status = outcome.state === "failed" ? "failed" : "pending";
    update.last_error = {
      category: errorCategory ?? "unknown",
      message: outcome.errorMessage ?? "delivery failed",
      attempt: event.attempt_count,
      at: now,
    } as unknown as Json;

    if (outcome.state === "retrying") {
      update.next_attempt_at = new Date(
        Date.now() + backoffDelayMs(event.attempt_count),
      ).toISOString();
    }
  }

  await admin.from("outbound_events").update(update).eq("id", event.id);

  // Only the deliverables notification drives the inspection's delivery state;
  // ordinary lifecycle events come and go without changing it.
  if (event.external_inspection_ref_id && event.event_type === "inspection.deliverables_ready") {
    const refUpdate: Record<string, unknown> = {};

    if (outcome.state === "delivered") {
      refUpdate.delivery_status = "delivered";
      refUpdate.last_delivered_at = now;
    } else if (outcome.state === "failed") {
      refUpdate.delivery_status = "failed";
      refUpdate.last_error = {
        category: errorCategory ?? "unknown",
        message: outcome.errorMessage ?? "delivery failed",
        at: now,
      } as unknown as Json;
    } else {
      refUpdate.delivery_status = "delivering";
    }

    await admin
      .from("external_inspection_refs")
      .update(refUpdate)
      .eq("id", event.external_inspection_ref_id);
  }

  return outcome;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
