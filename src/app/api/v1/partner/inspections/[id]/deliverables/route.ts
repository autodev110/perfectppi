import { NextResponse } from "next/server";
import { authenticatePartnerRequest } from "@/features/partner/auth";
import { partnerError } from "@/features/partner/errors";
import {
  isUuid,
  loadDeliverableManifest,
  loadPartnerInspection,
  wasDeliverableRequested,
} from "@/features/partner/inspections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/v1/partner/inspections/:id/deliverables
//
// The immutable manifest for the newest *complete* output version. A version
// missing any of the four required artifacts is never offered, so DealerSpace
// cannot import a partial set and close its Recon phase on it.
//
// Checksums are over the exact stored bytes, so DealerSpace can verify each
// download before accepting it.
// ============================================================================

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticatePartnerRequest(request, {
    scope: "artifacts:read",
    limit: "read",
  });
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const inspection = await loadPartnerInspection(auth.connection, id);
  if (!inspection) return partnerError("inspection_not_found");

  const url = new URL(request.url);
  const submissionId = url.searchParams.get("submissionId") ?? "";
  const outputVersion = Number(url.searchParams.get("outputVersion"));
  if (!isUuid(submissionId) || !Number.isInteger(outputVersion) || outputVersion < 1) {
    return partnerError(
      "invalid_request",
      "submissionId and a positive integer outputVersion are required.",
    );
  }

  const requested = await wasDeliverableRequested({
    connectionId: auth.connection.id,
    refId: inspection.refId,
    submissionId,
    outputVersion,
  });
  if (!requested) {
    return partnerError(
      "delivery_not_requested",
      "This report version has not been sent to DealerSpace.",
    );
  }

  const manifest = await loadDeliverableManifest(submissionId, outputVersion);
  if (!manifest) {
    return partnerError(
      "deliverables_not_ready",
      "Report generation has not finished for this inspection.",
      { integrationStatus: inspection.integrationStatus },
    );
  }

  return NextResponse.json(
    {
      inspectionId: inspection.requestId,
      submissionId: manifest.submissionId,
      version: manifest.version,
      generatedAt: manifest.generatedAt,
      artifacts: manifest.artifacts.map((artifact) => ({
        id: artifact.id,
        type: artifact.artifactType,
        contentType: artifact.contentType,
        sizeBytes: artifact.sizeBytes,
        sha256: artifact.sha256,
        downloadPath: `/api/v1/partner/artifacts/${artifact.id}`,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
