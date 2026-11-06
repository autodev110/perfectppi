import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueuePartnerEvent } from "./events";
import { autoDeliverySystems, partnerSystem } from "./systems";

// ============================================================================
// Automatic delivery for partners that do not use a Send button.
//
// The output pipeline calls this the moment all four artifacts exist, so a
// report held for admin review is never sent: it has no artifacts yet. Delivery
// itself stays with the delivery worker, which owns retries and signing.
//
// The sweep is the guarantee. If the pipeline's call fails after the artifacts
// were stored, the next delivery tick finds the gap and requests it again. After
// the sweep's window, the Send button on the inspection remains.
// ============================================================================

const SWEEP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export async function requestPartnerAutoDelivery(
  requestId: string,
  submissionId: string,
  outputVersion: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient();

    const { data: ref } = await admin
      .from("external_inspection_refs")
      .select("id, source_system, partner_connection_id, current_submission_id")
      .eq("ppi_request_id", requestId)
      .maybeSingle();

    if (!ref || !partnerSystem(ref.source_system)?.autoDeliver) return false;
    // A newer submission arrived while this version was generating.
    if (ref.current_submission_id !== submissionId) return false;

    const { data: connection } = await admin
      .from("partner_connections")
      .select("id, status, webhook_url")
      .eq("id", ref.partner_connection_id)
      .maybeSingle();

    if (!connection || connection.status !== "active" || !connection.webhook_url) return false;

    const { error } = await admin.rpc("partner_request_delivery", {
      p_ref_id: ref.id,
      p_submission_id: submissionId,
      p_output_version: outputVersion,
      p_event_id: randomUUID(),
      p_occurred_at: new Date().toISOString(),
    });

    if (error) {
      console.error("partner: automatic delivery request failed", error.message);
      return false;
    }

    await enqueuePartnerEvent({
      connectionId: connection.id,
      refId: ref.id,
      requestId,
      type: "inspection.delivery_requested",
      data: { submissionId, outputVersion, automatic: true },
      dedupeKey: `delivery_requested:${ref.id}:${submissionId}:v${outputVersion}`,
    });

    return true;
  } catch (error) {
    console.error("partner: automatic delivery request failed", error);
    return false;
  }
}

/**
 * Requests any complete output an automatic partner has not been sent, oldest
 * first. The database picks them, so reports already delivered and revoked
 * connections never use up a slot. Only a version that was never requested
 * qualifies: an exhausted delivery stays failed until someone retries it, rather
 * than being re-armed here on every tick.
 */
export async function sweepPartnerAutoDeliveries(limit = 25): Promise<number> {
  const systems = autoDeliverySystems();
  if (systems.length === 0) return 0;

  const { data, error } = await createAdminClient().rpc("partner_auto_delivery_candidates", {
    p_systems: systems,
    p_since: new Date(Date.now() - SWEEP_LOOKBACK_MS).toISOString(),
    p_limit: limit,
  });

  if (error) {
    console.error("partner: automatic delivery sweep failed", error.message);
    return 0;
  }

  let requested = 0;
  for (const row of data ?? []) {
    if (await requestPartnerAutoDelivery(row.ppi_request_id, row.submission_id, row.output_version)) {
      requested += 1;
    }
  }
  return requested;
}
