import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REQUIRED_ARTIFACT_TYPES } from "./constants";

// ============================================================================
// Server-side reads for the organization settings panel and the incoming
// DealerSpace queue.
//
// partner_connections holds a token hash and an encrypted signing secret, so
// the table has no RLS policies at all — nothing reads it from a browser
// session. These helpers run on the server, prove the caller manages the
// organization first, and then project only non-secret columns.
// ============================================================================

export interface ManagerContext {
  profileId: string;
  organizationId: string;
}

/**
 * Resolves the caller's organization from their own membership row, read with
 * the *user-scoped* client so RLS is doing the work. An organization id from a
 * URL or form field is never trusted for this.
 */
export async function getManagerContext(): Promise<ManagerContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "org_manager") return null;

  const { data: techProfile } = await supabase
    .from("technician_profiles")
    .select("organization_id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!techProfile?.organization_id) return null;

  return { profileId: profile.id, organizationId: techProfile.organization_id };
}

export interface SafeConnectionView {
  id: string;
  sourceSystem: string;
  externalOrganizationId: string;
  displayName: string | null;
  status: string;
  scopes: string[];
  /** Safe identifier only — the token itself was shown once and never stored. */
  tokenIdentifier: string;
  webhookUrl: string | null;
  userLinkRedirectUri: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
  lastVerifiedAt: string | null;
  credentialsRotatedAt: string | null;
  revokedAt: string | null;
}

export async function getOrgPartnerConnections(
  organizationId: string,
): Promise<SafeConnectionView[]> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("partner_connections")
    .select(
      `id, source_system, external_organization_id, display_name, status, scopes,
       token_prefix, token_last_four, webhook_url, user_link_redirect_uri,
       connected_at, last_used_at, last_verified_at, credentials_rotated_at, revoked_at`,
    )
    .eq("organization_id", organizationId)
    .order("connected_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    sourceSystem: row.source_system,
    externalOrganizationId: row.external_organization_id,
    displayName: row.display_name,
    status: row.status,
    scopes: row.scopes,
    tokenIdentifier: `ppi_${row.token_prefix}…${row.token_last_four}`,
    webhookUrl: row.webhook_url,
    userLinkRedirectUri: row.user_link_redirect_uri,
    connectedAt: row.connected_at,
    lastUsedAt: row.last_used_at,
    lastVerifiedAt: row.last_verified_at,
    credentialsRotatedAt: row.credentials_rotated_at,
    revokedAt: row.revoked_at,
  }));
}

export interface InstallationCodeView {
  id: string;
  codePrefix: string;
  status: string;
  scopes: string[];
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  isExpired: boolean;
}

export async function getOrgInstallationCodes(
  organizationId: string,
): Promise<InstallationCodeView[]> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("partner_installation_codes")
    .select("id, code_prefix, status, scopes, expires_at, created_at, consumed_at, revoked_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const now = Date.now();
  return (data ?? []).map((row) => ({
    id: row.id,
    codePrefix: row.code_prefix,
    status: row.status,
    scopes: row.scopes,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    consumedAt: row.consumed_at,
    revokedAt: row.revoked_at,
    isExpired:
      row.status === "pending" && new Date(row.expires_at).getTime() < now,
  }));
}

export interface UserLinkView {
  id: string;
  externalUserId: string;
  profileId: string;
  displayName: string | null;
  username: string | null;
  status: string;
  linkedAt: string;
  revokedAt: string | null;
}

export async function getConnectionUserLinks(
  connectionIds: string[],
): Promise<UserLinkView[]> {
  if (connectionIds.length === 0) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("partner_user_links")
    .select(
      `id, external_user_id, profile_id, status, linked_at, revoked_at,
       profile:profiles!partner_user_links_profile_id_fkey(display_name, username)`,
    )
    .in("partner_connection_id", connectionIds)
    .order("linked_at", { ascending: false });

  return (data ?? []).map((row) => {
    const profile = row.profile as {
      display_name: string | null;
      username: string | null;
    } | null;

    return {
      id: row.id,
      externalUserId: row.external_user_id,
      profileId: row.profile_id,
      displayName: profile?.display_name ?? null,
      username: profile?.username ?? null,
      status: row.status,
      linkedAt: row.linked_at,
      revokedAt: row.revoked_at,
    };
  });
}

// ============================================================================
// Incoming DealerSpace queue
// ============================================================================

export interface IncomingInspectionRow {
  refId: string;
  requestId: string;
  status: string;
  integrationStatus: string;
  deliveryStatus: string;
  sourceLabel: string | null;
  receivedAt: string;
  externalReconCaseId: string | null;
  externalInspectionPhaseId: string | null;
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    stockNumber: string | null;
    mileage: number | null;
  };
  assignedTech: {
    id: string;
    displayName: string | null;
    username: string | null;
  } | null;
  submissionId: string | null;
  artifactsReady: boolean;
  deepLink: string;
}

interface SnapshotShape {
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
}

/**
 * The manager-facing queue. Deliberately driven by external_inspection_refs
 * rather than by ppi_submissions, because a request that has been assigned but
 * not yet started has no submission — and those are exactly the rows a manager
 * needs to chase.
 */
export async function getIncomingPartnerInspections(
  organizationId: string,
  options?: { limit?: number },
): Promise<IncomingInspectionRow[]> {
  const admin = createAdminClient();

  const { data: connections } = await admin
    .from("partner_connections")
    .select("id")
    .eq("organization_id", organizationId);

  const connectionIds = (connections ?? []).map((c) => c.id);
  if (connectionIds.length === 0) return [];

  const { data } = await admin
    .from("external_inspection_refs")
    .select(
      `
      id, ppi_request_id, current_submission_id, integration_status, delivery_status,
      source_label, vehicle_snapshot, created_at,
      external_recon_case_id, external_inspection_phase_id,
      request:ppi_requests!external_inspection_refs_ppi_request_id_fkey(
        id, status, requesting_organization_id,
        vehicle:vehicles!ppi_requests_vehicle_id_fkey(year, make, model, trim, vin, mileage),
        assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name, username)
      )
    `,
    )
    .in("partner_connection_id", connectionIds)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  const rows = data ?? [];

  // Which of these already have all four required artifacts?
  const submissionIds = rows
    .map((row) => row.current_submission_id)
    .filter((id): id is string => Boolean(id));

  const readyBySubmission = await getReadySubmissionVersions(submissionIds);

  return rows
    .filter((row) => {
      const request = row.request as { requesting_organization_id: string | null } | null;
      // Defence in depth: the connection filter above already scopes to this
      // organization, but ownership is re-checked against the request itself.
      return request?.requesting_organization_id === organizationId;
    })
    .map((row) => {
      const request = row.request as {
        id: string;
        status: string;
        vehicle: {
          year: number | null;
          make: string | null;
          model: string | null;
          trim: string | null;
          vin: string | null;
          mileage: number | null;
        } | null;
        assigned_tech: {
          id: string;
          display_name: string | null;
          username: string | null;
        } | null;
      };

      const snapshot = (row.vehicle_snapshot ?? {}) as SnapshotShape;

      return {
        refId: row.id,
        requestId: row.ppi_request_id,
        status: request.status,
        integrationStatus: row.integration_status,
        deliveryStatus: row.delivery_status,
        sourceLabel: row.source_label,
        receivedAt: row.created_at,
        externalReconCaseId: row.external_recon_case_id,
        externalInspectionPhaseId: row.external_inspection_phase_id,
        vehicle: {
          year: snapshot.year ?? request.vehicle?.year ?? null,
          make: snapshot.make ?? request.vehicle?.make ?? null,
          model: snapshot.model ?? request.vehicle?.model ?? null,
          trim: snapshot.trim ?? request.vehicle?.trim ?? null,
          vin: snapshot.vin ?? request.vehicle?.vin ?? null,
          stockNumber: snapshot.stockNumber ?? null,
          mileage: snapshot.mileage ?? request.vehicle?.mileage ?? null,
        },
        assignedTech: request.assigned_tech
          ? {
              id: request.assigned_tech.id,
              displayName: request.assigned_tech.display_name,
              username: request.assigned_tech.username,
            }
          : null,
        submissionId: row.current_submission_id,
        artifactsReady: row.current_submission_id
          ? readyBySubmission.get(row.current_submission_id) !== undefined
          : false,
        deepLink: `/org/inspections/dealerspace/${row.id}`,
      };
    });
}

/**
 * Maps submission id -> highest output version that has all four required
 * artifacts. Absent from the map means "not deliverable yet".
 */
export async function getReadySubmissionVersions(
  submissionIds: string[],
): Promise<Map<string, number>> {
  const ready = new Map<string, number>();
  if (submissionIds.length === 0) return ready;

  const admin = createAdminClient();
  const { data } = await admin
    .from("integration_artifacts")
    .select("ppi_submission_id, output_version, artifact_type")
    .in("ppi_submission_id", submissionIds);

  const seen = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const key = `${row.ppi_submission_id}:${row.output_version}`;
    const set = seen.get(key) ?? new Set<string>();
    set.add(row.artifact_type);
    seen.set(key, set);
  }

  for (const [key, types] of seen) {
    if (!REQUIRED_ARTIFACT_TYPES.every((type) => types.has(type))) continue;

    const [submissionId, version] = key.split(":");
    const parsed = Number(version);
    const current = ready.get(submissionId);
    if (current === undefined || parsed > current) {
      ready.set(submissionId, parsed);
    }
  }

  return ready;
}

/** The single ref behind one PPI request, or null when it is not a partner inspection. */
export async function getExternalRefForRequest(requestId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("external_inspection_refs")
    .select("*, connection:partner_connections!external_inspection_refs_partner_connection_id_fkey(id, organization_id, display_name, status)")
    .eq("ppi_request_id", requestId)
    .maybeSingle();

  return data;
}
