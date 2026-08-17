import { createAdminClient } from "@/lib/supabase/admin";
import { REQUIRED_ARTIFACT_TYPES, type ArtifactType } from "./constants";
import type { PartnerConnection } from "./auth";

// ============================================================================
// Reads for the partner-facing inspection endpoints.
//
// Every lookup is filtered by partner_connection_id, so an inspection belonging
// to another dealership is indistinguishable from one that does not exist. The
// route handlers return `inspection_not_found` in both cases.
// ============================================================================

export interface PartnerInspectionView {
  refId: string;
  requestId: string;
  status: string;
  integrationStatus: string;
  deliveryStatus: string;
  deliveryVersion: number;
  deliverySubmissionId: string | null;
  deliveryOutputVersion: number | null;
  submissionId: string | null;
  submissionVersion: number | null;
  submittedAt: string | null;
  assignedProfileId: string | null;
  assignedDisplayName: string | null;
  externalReconCaseId: string | null;
  externalVehicleId: string | null;
  externalInspectionPhaseId: string | null;
  externalActorId: string | null;
  vehicleSnapshot: unknown;
  createdAt: string;
  updatedAt: string;
}

export async function loadPartnerInspection(
  connection: PartnerConnection,
  requestId: string,
): Promise<PartnerInspectionView | null> {
  if (!isUuid(requestId)) return null;

  const admin = createAdminClient();

  const { data } = await admin
    .from("external_inspection_refs")
    .select(
      `
      id, ppi_request_id, current_submission_id, integration_status, delivery_status,
      delivery_version, delivered_submission_id, delivered_output_version,
      external_recon_case_id, external_vehicle_id,
      external_inspection_phase_id, external_actor_id, vehicle_snapshot,
      created_at, updated_at,
      request:ppi_requests!external_inspection_refs_ppi_request_id_fkey(
        id, status, assigned_tech_id,
        assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name)
      )
    `,
    )
    .eq("partner_connection_id", connection.id)
    .eq("ppi_request_id", requestId)
    .maybeSingle();

  if (!data) return null;

  const request = data.request as {
    id: string;
    status: string;
    assigned_tech_id: string | null;
    assigned_tech: { id: string; display_name: string | null } | null;
  } | null;

  let submissionVersion: number | null = null;
  let submittedAt: string | null = null;

  if (data.current_submission_id) {
    const { data: submission } = await admin
      .from("ppi_submissions")
      .select("version, submitted_at")
      .eq("id", data.current_submission_id)
      .maybeSingle();

    submissionVersion = submission?.version ?? null;
    submittedAt = submission?.submitted_at ?? null;
  }

  return {
    refId: data.id,
    requestId: data.ppi_request_id,
    status: request?.status ?? "unknown",
    integrationStatus: data.integration_status,
    deliveryStatus: data.delivery_status,
    deliveryVersion: data.delivery_version,
    deliverySubmissionId: data.delivered_submission_id,
    deliveryOutputVersion: data.delivered_output_version,
    submissionId: data.current_submission_id,
    submissionVersion,
    submittedAt,
    assignedProfileId: request?.assigned_tech_id ?? null,
    assignedDisplayName: request?.assigned_tech?.display_name ?? null,
    externalReconCaseId: data.external_recon_case_id,
    externalVehicleId: data.external_vehicle_id,
    externalInspectionPhaseId: data.external_inspection_phase_id,
    externalActorId: data.external_actor_id,
    vehicleSnapshot: data.vehicle_snapshot,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export interface ArtifactRecord {
  id: string;
  artifactType: ArtifactType;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  generatedAt: string;
}

export interface DeliverableManifest {
  submissionId: string;
  version: number;
  generatedAt: string;
  artifacts: ArtifactRecord[];
}

/**
 * The manifest for the newest output version that is *complete*. A version
 * missing even one required artifact is not offered, so DealerSpace can never
 * import a half-generated set and close its Recon phase on it.
 */
export async function loadDeliverableManifest(
  submissionId: string,
  outputVersion?: number,
): Promise<DeliverableManifest | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("integration_artifacts")
    .select("id, output_version, artifact_type, content_type, size_bytes, sha256, storage_key, generated_at")
    .eq("ppi_submission_id", submissionId)
    .match(outputVersion === undefined ? {} : { output_version: outputVersion })
    .order("output_version", { ascending: false });

  if (!data || data.length === 0) return null;

  const byVersion = new Map<number, typeof data>();
  for (const row of data) {
    const bucket = byVersion.get(row.output_version) ?? [];
    bucket.push(row);
    byVersion.set(row.output_version, bucket);
  }

  const versions = [...byVersion.keys()].sort((a, b) => b - a);
  for (const version of versions) {
    const rows = byVersion.get(version)!;
    const present = new Set(rows.map((r) => r.artifact_type));
    if (!REQUIRED_ARTIFACT_TYPES.every((type) => present.has(type))) continue;

    return {
      submissionId,
      version,
      generatedAt: rows
        .map((r) => r.generated_at)
        .sort()
        .at(-1)!,
      artifacts: rows.map((row) => ({
        id: row.id,
        artifactType: row.artifact_type as ArtifactType,
        contentType: row.content_type,
        sizeBytes: Number(row.size_bytes),
        sha256: row.sha256,
        storageKey: row.storage_key,
        generatedAt: row.generated_at,
      })),
    };
  }

  return null;
}

/**
 * A partner may pull bytes only after a technician explicitly requested this
 * exact submission/output pair. The transactional delivery event is the
 * durable authorization record, so an older requested revision remains
 * retryable even after a newer revision becomes current.
 */
export async function wasDeliverableRequested(params: {
  connectionId: string;
  refId: string;
  submissionId: string;
  outputVersion: number;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("outbound_events")
    .select("id")
    .eq("partner_connection_id", params.connectionId)
    .eq("external_inspection_ref_id", params.refId)
    .eq("event_type", "inspection.deliverables_ready")
    .contains("payload", {
      submissionId: params.submissionId,
      outputVersion: params.outputVersion,
    })
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
