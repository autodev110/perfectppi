import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatePartnerRequest } from "@/features/partner/auth";
import { secureCompareHex, sha256Hex } from "@/features/partner/crypto";
import { partnerError } from "@/features/partner/errors";
import { isUuid, wasDeliverableRequested } from "@/features/partner/inspections";
import { ARTIFACT_FILENAMES, type ArtifactType } from "@/features/partner/constants";
import {
  getPrivateObjectByKey,
  isPrivateR2Configured,
} from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// GET /api/v1/partner/artifacts/:artifactId
//
// Streams the authenticated bytes. There is no public URL and no presigned
// link: the connection token is checked on every download, and ownership is
// proven by joining the artifact back to a ref on *this* connection.
// ============================================================================

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const auth = await authenticatePartnerRequest(request, {
    scope: "artifacts:read",
    limit: "read",
  });
  if ("response" in auth) return auth.response;

  const { artifactId } = await params;
  if (!isUuid(artifactId)) return partnerError("artifact_not_found");

  const admin = createAdminClient();

  const { data: artifact } = await admin
    .from("integration_artifacts")
    .select(
      `
      id, artifact_type, content_type, size_bytes, sha256, storage_key,
      output_version, generated_at, ppi_submission_id,
      ref:external_inspection_refs!integration_artifacts_external_inspection_ref_id_fkey(
        id, partner_connection_id
      )
    `,
    )
    .eq("id", artifactId)
    .maybeSingle();

  const ref = artifact?.ref as { id: string; partner_connection_id: string } | null;

  // Unknown artifact and another dealership's artifact are the same answer.
  if (!artifact || !ref || ref.partner_connection_id !== auth.connection.id) {
    return partnerError("artifact_not_found");
  }

  const requested = await wasDeliverableRequested({
    connectionId: auth.connection.id,
    refId: ref.id,
    submissionId: artifact.ppi_submission_id,
    outputVersion: artifact.output_version,
  });
  if (!requested) return partnerError("artifact_not_found");

  // Checked only after ownership: an unauthorized caller must not be able to
  // tell a missing artifact apart from a storage outage.
  if (!isPrivateR2Configured()) {
    return partnerError("storage_unavailable", "Artifact storage is not configured.");
  }

  let bytes: Uint8Array;
  try {
    ({ bytes } = await getPrivateObjectByKey(artifact.storage_key));
  } catch (error) {
    console.error("partner: artifact fetch failed", artifact.storage_key, error);
    return partnerError("storage_unavailable", "Artifact bytes could not be read.");
  }

  const downloadedSha256 = sha256Hex(bytes);
  if (!secureCompareHex(downloadedSha256, artifact.sha256)) {
    console.error("partner: artifact checksum mismatch", artifact.id);
    return partnerError(
      "storage_unavailable",
      "Artifact integrity verification failed.",
    );
  }

  const filename =
    ARTIFACT_FILENAMES[artifact.artifact_type as ArtifactType] ?? "artifact.bin";

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": artifact.content_type,
      "Content-Length": String(bytes.byteLength),
      // Fixed, derived from the artifact type — never from user-controlled text,
      // so there is nothing to inject into the header.
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-PerfectPPI-Artifact-Sha256": artifact.sha256,
      "X-PerfectPPI-Submission-Id": artifact.ppi_submission_id,
      "X-PerfectPPI-Output-Version": String(artifact.output_version),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
