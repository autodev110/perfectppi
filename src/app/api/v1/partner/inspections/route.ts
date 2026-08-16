import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/config/site";
import {
  authenticatePartnerRequest,
  requireMatchingExternalOrg,
} from "@/features/partner/auth";
import { partnerError } from "@/features/partner/errors";
import { fingerprintPayload } from "@/features/partner/crypto";
import { resolveLinkedTechnician } from "@/features/partner/user-links";
import { enqueuePartnerEvent } from "@/features/partner/events";
import { isValidVin } from "@/lib/utils/vin";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/v1/partner/inspections
//
// DealerSpace pushes one explicitly selected vehicle. Perfect PPI creates an
// organization-owned inspection, assigns it to the technician the sending staff
// member is linked to, and stores an immutable snapshot of the vehicle data as
// it stood at this moment.
//
// Idempotency-Key is required. A replay returns the original inspection; the
// same key with a materially different payload is a conflict, never an
// overwrite.
// ============================================================================

const vehicleSchema = z.object({
  vin: z.string().trim().min(11).max(17),
  stockNumber: z.string().trim().max(64).optional().nullable(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  make: z.string().trim().max(64).optional().nullable(),
  model: z.string().trim().max(64).optional().nullable(),
  trim: z.string().trim().max(64).optional().nullable(),
  mileage: z.number().int().min(0).max(3_000_000).optional().nullable(),
  exteriorColor: z.string().trim().max(64).optional().nullable(),
  interiorColor: z.string().trim().max(64).optional().nullable(),
  engine: z.string().trim().max(128).optional().nullable(),
  transmission: z.string().trim().max(64).optional().nullable(),
  drivetrain: z.string().trim().max(32).optional().nullable(),
});

const bodySchema = z
  .object({
    externalOrganizationId: z.string().trim().min(1).max(128),
    externalReconCaseId: z.string().trim().max(128).optional().nullable(),
    externalVehicleId: z.string().trim().max(128).optional().nullable(),
    externalInspectionPhaseId: z.string().trim().max(128).optional().nullable(),
    externalActorId: z.string().trim().min(1).max(128),
    source: z
      .object({
        system: z.literal("dealerspace"),
        label: z.string().trim().max(120).optional(),
      })
      .optional(),
    vehicle: vehicleSchema,
  })
  // Bounded by construction: no passthrough, so customer, lead, deal, pricing
  // or finance fields sent by mistake are dropped rather than stored.
  .strict();

export async function POST(request: Request) {
  const auth = await authenticatePartnerRequest(request, {
    scope: "inspections:create",
    limit: "write",
  });
  if ("response" in auth) return auth.response;
  const { connection } = auth;

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    return partnerError("missing_idempotency_key");
  }
  if (idempotencyKey.length > 255) {
    return partnerError("invalid_request", "Idempotency-Key must be 255 characters or fewer.");
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return partnerError("invalid_request", "Body must be JSON.");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.errors[0];
    return partnerError("invalid_request", issue.message, {
      field: issue.path.join("."),
    });
  }
  const body = parsed.data;

  const orgMismatch = requireMatchingExternalOrg(
    connection,
    body.externalOrganizationId,
  );
  if (orgMismatch) return orgMismatch;

  const vin = body.vehicle.vin.toUpperCase().replace(/\s/g, "");
  if (!isValidVin(vin)) {
    return partnerError(
      "invalid_vin",
      "VIN must be 17 characters with a valid check digit.",
      { vin },
    );
  }

  // The DealerSpace staff id is resolved through the user link — a Perfect PPI
  // profile id is never accepted from the payload.
  const technician = await resolveLinkedTechnician(connection, body.externalActorId);
  if ("error" in technician) {
    return partnerError(technician.error, undefined, {
      externalActorId: body.externalActorId,
    });
  }

  const snapshot = {
    ...body.vehicle,
    vin,
    capturedAt: new Date().toISOString(),
    sourceSystem: "dealerspace",
  };

  // The fingerprint covers the data that defines the inspection. It excludes
  // the snapshot timestamp, which differs on every retry and would otherwise
  // turn every honest replay into a conflict.
  const fingerprint = fingerprintPayload({
    externalOrganizationId: body.externalOrganizationId,
    externalReconCaseId: body.externalReconCaseId ?? null,
    externalVehicleId: body.externalVehicleId ?? null,
    externalInspectionPhaseId: body.externalInspectionPhaseId ?? null,
    externalActorId: body.externalActorId,
    vehicle: { ...body.vehicle, vin },
  });

  const ppiType =
    technician.data.certificationLevel === "master" ||
    technician.data.certificationLevel === "oem_qualified"
      ? "certified_tech"
      : "general_tech";

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("partner_create_inspection", {
    p_connection_id: connection.id,
    p_organization_id: connection.organization_id,
    p_assigned_profile_id: technician.data.profileId,
    p_ppi_type: ppiType,
    p_external_organization_id: body.externalOrganizationId,
    p_external_recon_case_id: body.externalReconCaseId ?? undefined,
    p_external_vehicle_id: body.externalVehicleId ?? undefined,
    p_external_inspection_phase_id: body.externalInspectionPhaseId ?? undefined,
    p_external_actor_id: body.externalActorId,
    p_idempotency_key: idempotencyKey,
    p_request_fingerprint: fingerprint,
    p_source_label: body.source?.label ?? "DealerSpace Inspection",
    p_vehicle_snapshot: snapshot as unknown as Json,
    p_vin: vin,
    p_year: body.vehicle.year ?? undefined,
    p_make: body.vehicle.make ?? undefined,
    p_model: body.vehicle.model ?? undefined,
    p_trim: body.vehicle.trim ?? undefined,
    p_mileage: body.vehicle.mileage ?? undefined,
  });

  if (error) {
    if (error.message?.includes("idempotency_conflict")) {
      return partnerError("idempotency_conflict", undefined, { idempotencyKey });
    }
    console.error("partner: create inspection failed", error.message);
    return partnerError("internal_error");
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) {
    console.error("partner: create inspection returned no row");
    return partnerError("internal_error");
  }

  const { data: current } = await admin
    .from("ppi_requests")
    .select("status")
    .eq("id", result.request_id)
    .single();

  if (result.was_created) {
    await enqueuePartnerEvent({
      connectionId: connection.id,
      refId: result.ref_id,
      requestId: result.request_id,
      type: "inspection.created",
      data: { assignedProfileId: technician.data.profileId },
    });
    await enqueuePartnerEvent({
      connectionId: connection.id,
      refId: result.ref_id,
      requestId: result.request_id,
      type: "inspection.assigned",
      data: { assignedProfileId: technician.data.profileId },
    });
  }

  return NextResponse.json(
    {
      inspectionId: result.request_id,
      status: current?.status ?? "assigned",
      appUrl: `${siteConfig.url.replace(/\/$/, "")}/tech/ppi/${result.request_id}`,
      assignedTechnician: {
        profileId: technician.data.profileId,
        displayName: technician.data.displayName,
      },
      created: result.was_created,
    },
    {
      status: result.was_created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
