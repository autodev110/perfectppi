import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSocialProfileId } from "@/features/social/relationships";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const nullableNumber = z.number().nonnegative().nullable().optional();

export const buildEntrySchema = z.object({
  category: z.string().trim().min(1, "Category is required").max(80),
  title: z.string().trim().min(1, "Title is required").max(160),
  manufacturer: nullableText(120),
  part_number: nullableText(100),
  vehicle_configuration: nullableText(500),
  wheel_size: nullableText(40),
  wheel_width: nullableNumber,
  wheel_offset_mm: z.number().nullable().optional(),
  tire_size: nullableText(40),
  suspension_drop: nullableText(80),
  installed_on: dateValue.nullable().optional(),
  mileage: z.number().int().nonnegative().nullable().optional(),
  installation_kind: z.enum(["unknown", "self_installed", "shop_installed"]).default("unknown"),
  shop_name: nullableText(160),
  cost_cents: z.number().int().nonnegative().nullable().optional(),
  public_notes: nullableText(5000),
  private_notes: nullableText(5000),
  status: z.enum(["planned", "installed", "removed", "sold"]).default("installed"),
  is_public: z.boolean().default(false),
});

export const buildEntryUpdateSchema = buildEntrySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "No changes were provided",
);

export const maintenanceEventSchema = z.object({
  service_type: z.string().trim().min(1, "Service type is required").max(160),
  serviced_on: dateValue,
  mileage: z.number().int().nonnegative().nullable().optional(),
  parts_fluids: nullableText(3000),
  provider: nullableText(160),
  cost_cents: z.number().int().nonnegative().nullable().optional(),
  public_notes: nullableText(5000),
  private_notes: nullableText(5000),
  next_due_on: dateValue.nullable().optional(),
  next_due_mileage: z.number().int().nonnegative().nullable().optional(),
  is_public: z.boolean().default(false),
});

export const maintenanceEventUpdateSchema = maintenanceEventSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "No changes were provided",
);

export async function ownerCanManageVehicle(profileId: string, vehicleId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("owner_id", profileId)
    .maybeSingle();
  return !!data;
}

export async function getOwnedVehicleTimelines(profileId: string, vehicleId: string) {
  if (!await ownerCanManageVehicle(profileId, vehicleId)) return null;
  const admin = createAdminClient();
  const [build, maintenance] = await Promise.all([
    admin
      .from("vehicle_build_entries")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("owner_id", profileId)
      .order("installed_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    admin
      .from("vehicle_maintenance_events")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("owner_id", profileId)
      .order("serviced_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (build.error || maintenance.error) throw build.error ?? maintenance.error;
  return { build: build.data ?? [], maintenance: maintenance.data ?? [] };
}

export async function getPublicVehicleTimelines(vehicleId: string) {
  const admin = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();
  const { data: canView } = await admin.rpc("social_can_view_vehicle", {
    p_viewer_id: viewerId,
    p_vehicle_id: vehicleId,
  });
  if (!canView) return { build: [], maintenance: [] };
  const [build, maintenance] = await Promise.all([
    admin
      .from("vehicle_build_entries")
      .select("id, vehicle_id, category, title, manufacturer, part_number, vehicle_configuration, wheel_size, wheel_width, wheel_offset_mm, tire_size, suspension_drop, installed_on, mileage, installation_kind, shop_name, public_notes, status, fitment_confidence, related_post_id, created_at, updated_at")
      .eq("vehicle_id", vehicleId)
      .eq("is_public", true)
      .order("installed_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    admin
      .from("vehicle_maintenance_events")
      .select("id, vehicle_id, service_type, serviced_on, mileage, parts_fluids, provider, public_notes, next_due_on, next_due_mileage, related_post_id, created_at, updated_at")
      .eq("vehicle_id", vehicleId)
      .eq("is_public", true)
      .order("serviced_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (build.error || maintenance.error) throw build.error ?? maintenance.error;
  return { build: build.data ?? [], maintenance: maintenance.data ?? [] };
}
