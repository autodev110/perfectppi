// Server side of Factory Spec vs Current Build (Renditions doc): decode the
// VIN once, store the factory layer with the service role (owners cannot
// write it — see guard_vehicle_factory_spec), and refuse a current build
// that contradicts the factory record while claiming to be original.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decodeVinDetails } from "@/lib/vehicles/vin-decoder";
import { factoryConflict, parseFactorySpec, type CurrentBuild, type VehicleFactorySpec } from "@/lib/vehicles/factory-spec";
import type { Json } from "@/types/database";
import { isValidVin } from "@/lib/utils/vin";
import { recordProductEvent } from "@/features/analytics/product-events";

/**
 * Decode a VIN into a factory spec. Never throws: a decoder outage simply
 * means no factory layer for now (it can be established on a later save).
 */
export async function decodeFactorySpec(vin: string | null | undefined): Promise<VehicleFactorySpec | null> {
  const normalized = (vin ?? "").trim().toUpperCase();
  if (!isValidVin(normalized)) return null;
  try {
    const decoded = await decodeVinDetails(normalized);
    return decoded?.factory_spec ?? null;
  } catch (error) {
    console.warn("factory spec decode unavailable", { reason: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}

/** Persist the factory layer for a vehicle (service role; the trigger keeps it tied to the VIN). */
export async function storeFactorySpec(vehicleId: string, spec: VehicleFactorySpec | null, ownerProfileId?: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("vehicles")
    .update({
      factory_spec: (spec as unknown as Json) ?? null,
      factory_spec_decoded_at: spec ? spec.decoded_at : null,
    })
    .eq("id", vehicleId);
  if (error) {
    console.error("factory spec store failed", { code: error.code });
    return;
  }
  if (spec && ownerProfileId) {
    void recordProductEvent({ profileId: ownerProfileId, eventName: "factory_spec_recorded", surface: "garage", dedupeId: vehicleId });
  }
}

/**
 * The factory spec a vehicle should have for its VIN: the stored one when it
 * matches, otherwise a fresh decode (stored for next time). Used by owner
 * pages so vehicles created before this layer existed pick it up.
 */
export async function ensureFactorySpec(vehicle: { id: string; vin: string | null; factory_spec: Json | null }): Promise<VehicleFactorySpec | null> {
  const vin = (vehicle.vin ?? "").trim().toUpperCase();
  const stored = parseFactorySpec(vehicle.factory_spec);
  if (stored && stored.vin === vin) return stored;
  if (!isValidVin(vin)) return null;
  const decoded = await decodeFactorySpec(vin);
  if (decoded) await storeFactorySpec(vehicle.id, decoded);
  return decoded;
}

/**
 * The message to refuse a save with, or null when the current build is
 * consistent with the factory layer. A refusal is counted (KPI: vehicle-
 * profile accuracy) without storing what was entered.
 */
export function factoryConflictMessage(spec: VehicleFactorySpec | null, current: CurrentBuild, ownerProfileId?: string): string | null {
  const message = factoryConflict(spec, current);
  if (message && ownerProfileId) {
    void recordProductEvent({ profileId: ownerProfileId, eventName: "factory_conflict_refused", surface: "garage" });
  }
  return message;
}

/** Custom-build adoption KPI; deduped per vehicle. */
export function recordCustomBuildDeclared(ownerProfileId: string, vehicleId: string, configurationType: string | null | undefined) {
  if (configurationType !== "custom_build") return;
  void recordProductEvent({ profileId: ownerProfileId, eventName: "custom_build_declared", surface: "garage", dedupeId: vehicleId });
}
