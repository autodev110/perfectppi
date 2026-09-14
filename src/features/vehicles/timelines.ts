import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSocialProfileId } from "@/features/social/relationships";
import { vehicleDocumentReferenceSchema } from "@/features/uploads/url";
import { generatePresignedGetUrl, isPrivateStorageReference } from "@/lib/storage/r2";
import type { Database } from "@/types/database";

type BuildStage = Database["public"]["Tables"]["vehicle_build_stages"]["Row"];
type BuildDocument = Database["public"]["Tables"]["vehicle_build_documents"]["Row"];
export type BuildEntryPhoto = { media_id: string; url: string; position: number };

/** Approved photo references for a set of entries, with viewable URLs. */
async function loadEntryPhotos(entryIds: string[]): Promise<Map<string, BuildEntryPhoto[]>> {
  const result = new Map<string, BuildEntryPhoto[]>();
  if (entryIds.length === 0) return result;
  const admin = createAdminClient();
  const { data } = await admin
    .from("vehicle_build_entry_photos")
    .select("entry_id, media_id, position, media:vehicle_media!vehicle_build_entry_photos_media_id_fkey(url, moderation_status)")
    .in("entry_id", entryIds)
    .order("position");
  for (const row of data ?? []) {
    const media = row.media as unknown as { url: string; moderation_status: string } | null;
    if (!media || media.moderation_status !== "active") continue;
    const url = isPrivateStorageReference(media.url) ? await generatePresignedGetUrl(media.url, 900) : media.url;
    result.set(row.entry_id, [...(result.get(row.entry_id) ?? []), { media_id: row.media_id, url, position: row.position }]);
  }
  return result;
}

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const nullableNumber = z.number().nonnegative().nullable().optional();

export const buildStageSchema = z.object({
  title: z.string().trim().min(1, "Stage title is required").max(120),
  description: nullableText(2000),
  position: z.number().int().nonnegative().optional(),
  status: z.enum(["planned", "in_progress", "complete", "on_hold"]).default("planned"),
  target_date: dateValue.nullable().optional(),
  completed_on: dateValue.nullable().optional(),
  is_public: z.boolean().default(false),
});

export const buildStageUpdateSchema = buildStageSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "No changes were provided",
);

export const buildDocumentSchema = z.object({
  storage_reference: vehicleDocumentReferenceSchema,
  title: z.string().trim().min(1, "Give the document a name").max(120),
  kind: z.enum(["receipt", "invoice", "warranty", "dyno_sheet", "alignment", "other"]).default("other"),
  entry_id: z.string().uuid().nullable().optional(),
  stage_id: z.string().uuid().nullable().optional(),
  content_type: z.string().min(1).max(120),
  size_bytes: z.number().int().positive().max(25 * 1024 * 1024),
}).refine((value) => value.entry_id || value.stage_id, "Attach the document to a build entry or a stage");

export const buildEntryPhotosSchema = z.object({
  media_ids: z.array(z.string().uuid()).max(12),
});

export const buildEntrySchema = z.object({
  category: z.string().trim().min(1, "Category is required").max(80),
  title: z.string().trim().min(1, "Title is required").max(160),
  stage_id: z.string().uuid().nullable().optional(),
  labor_cents: z.number().int().nonnegative().nullable().optional(),
  labor_hours: z.number().nonnegative().max(9999).nullable().optional(),
  before_spec: nullableText(300),
  after_spec: nullableText(300),
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
  const [build, maintenance, stages, documents] = await Promise.all([
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
    admin
      .from("vehicle_build_stages")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("owner_id", profileId)
      .order("position")
      .order("created_at"),
    admin
      .from("vehicle_build_documents")
      .select("id, vehicle_id, entry_id, stage_id, kind, title, content_type, size_bytes, created_at")
      .eq("vehicle_id", vehicleId)
      .eq("owner_id", profileId)
      .order("created_at", { ascending: false }),
  ]);
  if (build.error || maintenance.error || stages.error || documents.error) {
    throw build.error ?? maintenance.error ?? stages.error ?? documents.error;
  }
  const entries = build.data ?? [];
  const photos = await loadEntryPhotos(entries.map((entry) => entry.id));
  return {
    build: entries.map((entry) => ({ ...entry, photos: photos.get(entry.id) ?? [] })),
    maintenance: maintenance.data ?? [],
    stages: (stages.data ?? []) as BuildStage[],
    documents: (documents.data ?? []) as Array<Omit<BuildDocument, "storage_reference" | "owner_id">>,
  };
}

export type OwnedVehicleTimelines = NonNullable<Awaited<ReturnType<typeof getOwnedVehicleTimelines>>>;

export async function getPublicVehicleTimelines(vehicleId: string) {
  const admin = createAdminClient();
  const viewerId = await getCurrentSocialProfileId();
  const { data: canView } = await admin.rpc("social_can_view_vehicle", {
    p_viewer_id: viewerId,
    p_vehicle_id: vehicleId,
  });
  if (!canView) return { build: [], maintenance: [], stages: [] };
  const [build, maintenance, stages] = await Promise.all([
    admin
      .from("vehicle_build_entries")
      // Public projection: never cost_cents, labor_cents, labor_hours, or private_notes.
      .select("id, vehicle_id, category, title, manufacturer, part_number, vehicle_configuration, wheel_size, wheel_width, wheel_offset_mm, tire_size, suspension_drop, installed_on, mileage, installation_kind, shop_name, public_notes, status, fitment_confidence, related_post_id, stage_id, before_spec, after_spec, created_at, updated_at")
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
    admin
      .from("vehicle_build_stages")
      .select("id, vehicle_id, title, description, position, status, target_date, completed_on, created_at")
      .eq("vehicle_id", vehicleId)
      .eq("is_public", true)
      .order("position")
      .order("created_at"),
  ]);
  if (build.error || maintenance.error || stages.error) throw build.error ?? maintenance.error ?? stages.error;
  const entries = build.data ?? [];
  const photos = await loadEntryPhotos(entries.map((entry) => entry.id));
  return {
    build: entries.map((entry) => ({ ...entry, photos: photos.get(entry.id) ?? [] })),
    maintenance: maintenance.data ?? [],
    stages: stages.data ?? [],
  };
}
