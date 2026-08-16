import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReadySubmissionVersions } from "@/features/partner/queries";
import { isUuid } from "@/features/partner/inspections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/ppi/requests/:id/dealerspace
//
// Partner context for the technician's inspection screen and for iOS: source
// label, the vehicle snapshot DealerSpace sent, and whether the deliverables
// are complete enough to send back.
//
// Returns `{ data: null }` for ordinary inspections, so callers can render the
// panel conditionally without a second request.
// ============================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole([
    "technician",
    "org_manager",
    "consumer",
    "admin",
  ]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Access is decided by RLS on the user-scoped client: the assigned
  // technician, the requesting organization's managers, and admins can read
  // the request; everyone else gets nothing back and therefore a 404.
  const { data: request } = await auth.supabase
    .from("ppi_requests")
    .select("id, status, source_system, assigned_tech_id")
    .eq("id", id)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (request.source_system !== "dealerspace") {
    return NextResponse.json({ data: null });
  }

  const admin = createAdminClient();
  const { data: ref } = await admin
    .from("external_inspection_refs")
    .select(
      `
      id, source_label, integration_status, delivery_status, delivery_version,
      current_submission_id, vehicle_snapshot, external_recon_case_id,
      external_inspection_phase_id, created_at, last_delivered_at,
      connection:partner_connections!external_inspection_refs_partner_connection_id_fkey(
        display_name, status
      )
    `,
    )
    .eq("ppi_request_id", id)
    .maybeSingle();

  if (!ref) return NextResponse.json({ data: null });

  const ready = ref.current_submission_id
    ? await getReadySubmissionVersions([ref.current_submission_id])
    : new Map<string, number>();
  const readyVersion = ref.current_submission_id
    ? ready.get(ref.current_submission_id)
    : undefined;

  const connection = ref.connection as {
    display_name: string | null;
    status: string;
  } | null;

  return NextResponse.json({
    data: {
      refId: ref.id,
      sourceSystem: "dealerspace",
      sourceLabel: ref.source_label,
      partnerName: connection?.display_name ?? "DealerSpace",
      connectionActive: connection?.status === "active",
      integrationStatus: ref.integration_status,
      deliveryStatus: ref.delivery_status,
      deliveryVersion: ref.delivery_version,
      deliverablesReady: readyVersion !== undefined,
      readyOutputVersion: readyVersion ?? null,
      vehicleSnapshot: ref.vehicle_snapshot,
      externalReconCaseId: ref.external_recon_case_id,
      externalInspectionPhaseId: ref.external_inspection_phase_id,
      receivedAt: ref.created_at,
      lastDeliveredAt: ref.last_delivered_at,
      canSend:
        request.assigned_tech_id === auth.profile.id ||
        auth.profile.role === "org_manager",
    },
  });
}
