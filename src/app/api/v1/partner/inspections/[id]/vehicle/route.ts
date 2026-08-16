import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatePartnerRequest } from "@/features/partner/auth";
import { partnerError } from "@/features/partner/errors";
import { loadPartnerInspection } from "@/features/partner/inspections";
import { isValidVin } from "@/lib/utils/vin";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// PATCH /api/v1/partner/inspections/:id/vehicle
//
// The explicit correction path. Ordinary DealerSpace edits must not reach an
// inspection already underway — this endpoint exists so that changing the
// snapshot is a deliberate act, and it is refused outright once the technician
// has submitted. A material change after submission needs a new submission
// version, not a rewritten history.
// ============================================================================

const bodySchema = z
  .object({
    vin: z.string().trim().min(11).max(17).optional(),
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
    reason: z.string().trim().max(280).optional(),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticatePartnerRequest(request, {
    scope: "inspections:create",
    limit: "write",
  });
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const inspection = await loadPartnerInspection(auth.connection, id);
  if (!inspection) return partnerError("inspection_not_found");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return partnerError("invalid_request", "Body must be JSON.");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return partnerError("invalid_request", parsed.error.errors[0].message);
  }

  const { reason, ...fields } = parsed.data;

  let vin: string | undefined;
  if (fields.vin) {
    vin = fields.vin.toUpperCase().replace(/\s/g, "");
    if (!isValidVin(vin)) {
      return partnerError("invalid_vin", "VIN must be 17 characters with a valid check digit.");
    }
  }

  const previous = (inspection.vehicleSnapshot ?? {}) as Record<string, unknown>;
  const snapshot = {
    ...previous,
    ...Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ),
    ...(vin ? { vin } : {}),
    capturedAt: new Date().toISOString(),
    sourceSystem: "dealerspace",
    correction: {
      correctedAt: new Date().toISOString(),
      reason: reason ?? null,
      previousSnapshot: previous,
    },
  };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("partner_update_inspection_vehicle", {
    p_ref_id: inspection.refId,
    p_snapshot: snapshot as unknown as Json,
    p_vin: vin ?? undefined,
    p_year: fields.year ?? undefined,
    p_make: fields.make ?? undefined,
    p_model: fields.model ?? undefined,
    p_trim: fields.trim ?? undefined,
    p_mileage: fields.mileage ?? undefined,
  });

  if (error) {
    if (error.message?.includes("snapshot_locked")) {
      return partnerError(
        "snapshot_locked",
        "This inspection has already been submitted. Request a revision instead.",
      );
    }
    if (error.message?.includes("inspection_not_found")) {
      return partnerError("inspection_not_found");
    }
    console.error("partner: vehicle correction failed", error.message);
    return partnerError("internal_error");
  }

  const updated = Array.isArray(data) ? data[0] : data;

  return NextResponse.json(
    {
      inspectionId: inspection.requestId,
      vehicleSnapshot: updated?.vehicle_snapshot ?? snapshot,
      updatedAt: updated?.updated_at ?? new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
