"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDeliveryWorkerTick } from "./delivery";
import { getReadySubmissionVersions } from "./queries";
import { enqueuePartnerEvent } from "./events";

// ============================================================================
// "Send to DealerSpace".
//
// The click enqueues and returns. It never performs the HTTP delivery inside
// the browser request — that is the delivery worker's job, with retries, so a
// slow or briefly-down DealerSpace does not surface as a failed button press.
//
// Repeated clicks collapse onto one logical delivery per output version.
// ============================================================================

const uuidSchema = z.string().uuid();

export interface SendResult {
  eventId: string;
  deliveryStatus: string;
  outputVersion: number;
  alreadyQueued: boolean;
}

export async function sendInspectionToDealerSpace(
  requestId: string,
): Promise<{ data: SendResult } | { error: string }> {
  if (!uuidSchema.safeParse(requestId).success) {
    return { error: "Invalid inspection" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!profile) return { error: "Not authenticated" };

  // Authorization through the user-scoped client: the request RLS policies
  // grant the assigned technician and the requesting organization's managers,
  // and nobody else.
  const { data: request } = await supabase
    .from("ppi_requests")
    .select("id, status, assigned_tech_id, requesting_organization_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { error: "Inspection not found" };

  const isAssignedTech = request.assigned_tech_id === profile.id;

  // RLS already scoped the read above to this manager's organization, but the
  // membership is re-checked here rather than inferred from the role alone:
  // an authorization rule should be legible where the decision is made, not
  // two layers away in a policy.
  let isOrgManager = false;
  if (!isAssignedTech && profile.role === "org_manager" && request.requesting_organization_id) {
    const { data: membership } = await supabase
      .from("technician_profiles")
      .select("organization_id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    isOrgManager = membership?.organization_id === request.requesting_organization_id;
  }

  if (!isAssignedTech && !isOrgManager) {
    return { error: "Only the assigned technician or an organization manager can send this inspection" };
  }

  const admin = createAdminClient();

  const { data: ref } = await admin
    .from("external_inspection_refs")
    .select("id, partner_connection_id, current_submission_id, delivery_status")
    .eq("ppi_request_id", requestId)
    .maybeSingle();

  if (!ref) return { error: "This inspection did not come from DealerSpace" };

  const { data: connection } = await admin
    .from("partner_connections")
    .select("id, status, webhook_url")
    .eq("id", ref.partner_connection_id)
    .maybeSingle();

  if (!connection || connection.status !== "active") {
    return { error: "The DealerSpace connection has been revoked" };
  }
  if (!connection.webhook_url) {
    return { error: "The DealerSpace connection has no webhook URL registered" };
  }

  if (!ref.current_submission_id) {
    return { error: "This inspection has not been submitted yet" };
  }

  // The gate: every required artifact must exist for one output version.
  const ready = await getReadySubmissionVersions([ref.current_submission_id]);
  const outputVersion = ready.get(ref.current_submission_id);

  if (outputVersion === undefined) {
    return {
      error: "Reports are still being generated. All four deliverables must exist before sending.",
    };
  }

  const wasQueued = ref.delivery_status !== "not_requested";

  const { data, error } = await admin.rpc("partner_request_delivery", {
    p_ref_id: ref.id,
    p_output_version: outputVersion,
    p_event_id: randomUUID(),
    p_occurred_at: new Date().toISOString(),
  });

  if (error) {
    console.error("partner: delivery request failed", error.message);
    return { error: "Failed to queue delivery" };
  }

  const event = Array.isArray(data) ? data[0] : data;
  if (!event) return { error: "Failed to queue delivery" };

  await enqueuePartnerEvent({
    connectionId: connection.id,
    refId: ref.id,
    requestId,
    type: "inspection.delivery_requested",
    data: { outputVersion },
    dedupeKey: `delivery_requested:${ref.id}:v${outputVersion}`,
  });

  after(async () => {
    try {
      await runDeliveryWorkerTick({ limit: 5 });
    } catch (tickError) {
      console.error("partner: inline delivery tick failed", tickError);
    }
  });

  revalidatePath(`/tech/ppi/${requestId}`);
  revalidatePath("/org/inspections");

  return {
    data: {
      eventId: event.id,
      deliveryStatus: event.status,
      outputVersion,
      alreadyQueued: wasQueued && event.status !== "pending",
    },
  };
}

/**
 * Re-arms an exhausted delivery. Uses the same dedupe key, so a replay is the
 * *same* logical delivery being retried — DealerSpace still sees one eventId.
 */
export async function retryInspectionDelivery(
  requestId: string,
): Promise<{ data: SendResult } | { error: string }> {
  return sendInspectionToDealerSpace(requestId);
}
