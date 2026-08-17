import { NextResponse } from "next/server";
import { authenticatePartnerRequest } from "@/features/partner/auth";
import { partnerError } from "@/features/partner/errors";
import { loadPartnerInspection } from "@/features/partner/inspections";
import { getReadySubmissionVersions } from "@/features/partner/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/v1/partner/inspections/:id
//
// Current remote status for the DealerSpace Recon card. `deliverablesReady`
// tells DealerSpace whether pulling the manifest is worthwhile yet.
// ============================================================================

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticatePartnerRequest(request, {
    scope: "inspections:read",
    limit: "read",
  });
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const inspection = await loadPartnerInspection(auth.connection, id);

  // Also the answer when the inspection belongs to another connection — the
  // two cases are deliberately indistinguishable.
  if (!inspection) return partnerError("inspection_not_found");

  const ready = inspection.submissionId
    ? await getReadySubmissionVersions([inspection.submissionId])
    : new Map<string, number>();

  const readyVersion = inspection.submissionId
    ? ready.get(inspection.submissionId)
    : undefined;

  return NextResponse.json(
    {
      inspectionId: inspection.requestId,
      status: inspection.status,
      integrationStatus: inspection.integrationStatus,
      deliveryStatus: inspection.deliveryStatus,
      deliveryVersion: inspection.deliveryVersion,
      deliverySubmissionId: inspection.deliverySubmissionId,
      deliveryOutputVersion: inspection.deliveryOutputVersion,
      submissionId: inspection.submissionId,
      submissionVersion: inspection.submissionVersion,
      submittedAt: inspection.submittedAt,
      deliverablesReady: readyVersion !== undefined,
      readyOutputVersion: readyVersion ?? null,
      assignedTechnician: inspection.assignedProfileId
        ? {
            profileId: inspection.assignedProfileId,
            displayName: inspection.assignedDisplayName,
          }
        : null,
      external: {
        reconCaseId: inspection.externalReconCaseId,
        vehicleId: inspection.externalVehicleId,
        inspectionPhaseId: inspection.externalInspectionPhaseId,
        actorId: inspection.externalActorId,
      },
      vehicleSnapshot: inspection.vehicleSnapshot,
      createdAt: inspection.createdAt,
      updatedAt: inspection.updatedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
