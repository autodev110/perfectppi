"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { vehicleUploadReferenceSchema } from "@/features/uploads/url";
import {
  blockedMediaResult,
  extensionForContentType,
  hasExpectedMediaSignature,
  moderateMediaBytes,
} from "@/lib/moderation/media-safety";
import {
  getActivePostingRestriction,
  moderationUserMessage,
  recordModeration,
  statusForDecision,
} from "@/lib/moderation";
import type { ModerationResult } from "@/lib/moderation";
import { buildStorageKey, getObjectFromStoredUrl, promoteQuarantinedObject } from "@/lib/storage/r2";
import { UPLOAD_LIMITS } from "@/config/constants";
import { deleteStoredObjectOrQueue } from "@/features/uploads/cleanup";
import {
  cleanupInspectionStorage,
  collectInspectionStorageReferences,
} from "@/features/ppi/deletion";

const createVehicleSchema = z.object({
  vin: z.string().max(17).optional().or(z.literal("")),
  year: z.coerce.number().min(1900).max(2100).optional(),
  make: z.string().min(1, "Make is required").max(100),
  model: z.string().min(1, "Model is required").max(100),
  trim: z.string().max(100).optional().or(z.literal("")),
  engine: z.string().trim().max(100).optional().or(z.literal("")),
  drivetrain: z.string().trim().max(100).optional().or(z.literal("")),
  transmission: z.string().trim().max(100).optional().or(z.literal("")),
  body_style: z.string().trim().max(100).optional().or(z.literal("")),
  nickname: z.string().trim().max(60).optional().or(z.literal("")),
  ownership_state: z.enum(["owned", "previously_owned", "considering", "project"]).optional(),
  mileage: z.coerce.number().min(0).optional(),
  visibility: z.enum(["public", "friends", "private"]).optional(),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});

const updateVehicleSchema = createVehicleSchema.partial();

const vehiclePhotoSchema = z.object({
  vehicleId: z.string().uuid(),
  url: vehicleUploadReferenceSchema,
  mediaType: z.enum(["image", "video"]),
  contentType: z.string().regex(/^(image|video)\//),
}).refine(
  ({ mediaType, contentType }) => contentType.startsWith(`${mediaType}/`),
  { message: "Media type does not match its content type", path: ["contentType"] },
);

const deleteVehiclePhotoSchema = z.object({
  vehicleId: z.string().uuid(),
  mediaId: z.string().uuid(),
});

async function getCurrentProfileId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" as const };

  return { profileId: profile.id };
}

export async function createVehicle(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value !== "" || ["notes", "vin", "trim", "nickname", "engine", "drivetrain", "transmission", "body_style"].includes(key)) raw[key] = value;
  }

  const parsed = createVehicleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Get profile id
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const normalizedVin = parsed.data.vin?.trim().toUpperCase() || null;

  if (normalizedVin) {
    const { data: existingVehicles } = await supabase
      .from("vehicles")
      .select("*")
      .eq("owner_id", profile.id)
      .not("vin", "is", null);

    const existingVehicle = existingVehicles?.find(
      (vehicle) => vehicle.vin?.trim().toUpperCase() === normalizedVin
    );
    if (existingVehicle) {
      return {
        error: "It looks like you already have a vehicle with this same VIN.",
        code: "duplicate_vin" as const,
        existingVehicle,
      };
    }
  }

  const { notes, ...vehicleFields } = parsed.data;
  const insertData = {
    ...vehicleFields,
    vin: normalizedVin,
    trim: parsed.data.trim || null,
    engine: parsed.data.engine || null,
    drivetrain: parsed.data.drivetrain || null,
    transmission: parsed.data.transmission || null,
    body_style: parsed.data.body_style || null,
    nickname: parsed.data.nickname || null,
    owner_id: profile.id,
  };

  const { data, error } = await supabase
    .from("vehicles")
    .insert(insertData)
    .select()
    .single();

  if (error?.code === "23505" && normalizedVin) {
    const { data: existingVehicle } = await supabase
      .from("vehicles")
      .select("*")
      .eq("owner_id", profile.id)
      .not("vin", "is", null)
      .then(({ data }) => ({
        data: data?.find((vehicle) => vehicle.vin?.trim().toUpperCase() === normalizedVin) ?? null,
      }));
    return {
      error: "It looks like you already have a vehicle with this same VIN.",
      code: "duplicate_vin" as const,
      existingVehicle: existingVehicle ?? undefined,
    };
  }
  if (error) return { error: "The vehicle could not be saved. Please try again." };

  if (notes) {
    const { error: notesError } = await supabase
      .from("vehicle_notes")
      .insert({ vehicle_id: data.id, notes });
    if (notesError) {
      await supabase.from("vehicles").delete().eq("id", data.id);
      return { error: "The vehicle could not be saved. Please try again." };
    }
  }

  revalidatePath("/dashboard/vehicles");
  return { data };
}

export async function updateVehicle(vehicleId: string, formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value !== "" || ["notes", "vin", "trim", "nickname", "engine", "drivetrain", "transmission", "body_style"].includes(key)) raw[key] = value;
  }

  const parsed = updateVehicleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };
  const admin = createAdminClient();

  const { data: ownedVehicle } = await admin
    .from("vehicles")
    .select("id, ownership_state")
    .eq("id", vehicleId)
    .eq("owner_id", profile.profileId)
    .maybeSingle();
  if (!ownedVehicle) return { error: "Vehicle not found" };
  if (parsed.data.ownership_state === "previously_owned" && ownedVehicle.ownership_state !== "previously_owned") {
    return { error: "Use Mark as sold so active listings and your history privacy choice are updated together." };
  }

  const { notes, ...vehicleFields } = parsed.data;
  const updateData = {
    ...vehicleFields,
    vin: vehicleFields.vin === undefined
      ? undefined
      : vehicleFields.vin.trim().toUpperCase() || null,
    trim: vehicleFields.trim === undefined ? undefined : vehicleFields.trim || null,
    engine: vehicleFields.engine === undefined ? undefined : vehicleFields.engine || null,
    drivetrain: vehicleFields.drivetrain === undefined ? undefined : vehicleFields.drivetrain || null,
    transmission: vehicleFields.transmission === undefined ? undefined : vehicleFields.transmission || null,
    body_style: vehicleFields.body_style === undefined ? undefined : vehicleFields.body_style || null,
    nickname: vehicleFields.nickname === undefined ? undefined : vehicleFields.nickname || null,
  };

  const hasVehicleUpdates = Object.values(updateData).some((value) => value !== undefined);
  const { error } = hasVehicleUpdates
    ? await admin.from("vehicles").update(updateData).eq("id", vehicleId)
    : { error: null };

  if (error?.code === "23505") {
    return { error: "It looks like you already have a vehicle with this same VIN." };
  }
  if (error) return { error: "The vehicle could not be updated. Please try again." };

  if (notes !== undefined) {
    const { error: notesError } = notes
      ? await admin.from("vehicle_notes").upsert(
          { vehicle_id: vehicleId, notes },
          { onConflict: "vehicle_id" },
        )
      : await admin.from("vehicle_notes").delete().eq("vehicle_id", vehicleId);
    if (notesError) return { error: "The vehicle notes could not be updated. Please try again." };
  }

  revalidatePath("/dashboard/vehicles");
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  return { success: true };
}

async function setVehicleVisibilityFromForm(
  formData: FormData,
  visibility: "public" | "friends" | "private"
) {
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  if (!vehicleId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicles")
    .update({ visibility })
    .eq("id", vehicleId);

  if (error) return;

  revalidatePath("/dashboard/vehicles");
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  revalidatePath(`/vehicle/${vehicleId}`);
  revalidatePath("/marketplace");
  revalidatePath("/dashboard/listings");
}

export async function makeVehiclePublic(formData: FormData) {
  await setVehicleVisibilityFromForm(formData, "public");
}

export async function makeVehiclePrivate(formData: FormData) {
  await setVehicleVisibilityFromForm(formData, "private");
}

export async function makeVehicleFriendsOnly(formData: FormData) {
  await setVehicleVisibilityFromForm(formData, "friends");
}

export async function markVehiclePreviouslyOwned(
  vehicleId: string,
  keepPublicHistory: boolean,
) {
  const parsedId = z.string().uuid().safeParse(vehicleId);
  if (!parsedId.success) return { error: "Vehicle not found" };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_vehicle_previously_owned", {
    p_vehicle_id: parsedId.data,
    p_keep_public_history: keepPublicHistory,
  });
  if (error || !data) {
    return { error: "This vehicle could not be marked as sold. Please try again." };
  }

  revalidatePath("/dashboard/vehicles");
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  revalidatePath(`/vehicle/${vehicleId}`);
  revalidatePath("/marketplace");
  revalidatePath("/dashboard/listings");
  return { data };
}

export async function attachVehiclePhoto(input: {
  vehicleId: string;
  url: string;
  mediaType: "image" | "video";
  contentType: string;
}) {
  const parsed = vehiclePhotoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  if (await getActivePostingRestriction(profile.profileId, true)) {
    return { error: "Media uploads are unavailable for this account" };
  }

  const admin = createAdminClient();
  const { data: vehicle } = await admin
    .from("vehicles")
    .select("id, owner_id")
    .eq("id", parsed.data.vehicleId)
    .single();

  if (!vehicle || vehicle.owner_id !== profile.profileId) {
    return { error: "You can only upload photos for vehicles you own" };
  }

  const expectedPrefix = `r2-private:///quarantine/vehicle_media/${profile.profileId}/${vehicle.id}/`;
  if (!parsed.data.url.startsWith(expectedPrefix)) return { error: "Vehicle upload is invalid" };

  const now = new Date().toISOString();
  const { data: reservation } = await admin
    .from("community_upload_reservations")
    .select("id, expected_size, content_type")
    .eq("profile_id", profile.profileId)
    .eq("vehicle_id", vehicle.id)
    .eq("storage_reference", parsed.data.url)
    .eq("status", "issued")
    .gt("expires_at", now)
    .maybeSingle();
  if (!reservation || reservation.content_type !== parsed.data.contentType) {
    return { error: "Vehicle upload is missing, expired, or does not match the selected media" };
  }

  const { data: claimedReservation } = await admin
    .from("community_upload_reservations")
    .update({ status: "attached", attached_at: now })
    .eq("id", reservation.id)
    .eq("status", "issued")
    .select("id")
    .maybeSingle();
  if (!claimedReservation) {
    return { error: "This vehicle upload was already attached. Please select the file again." };
  }

  let bytes: Uint8Array;
  try {
    bytes = (await getObjectFromStoredUrl(parsed.data.url, {
      expectedBytes: reservation.expected_size,
      maxBytes: UPLOAD_LIMITS.maxVideoSize,
    })).bytes;
    if (!hasExpectedMediaSignature(bytes, parsed.data.contentType)) {
      throw new Error("Vehicle media signature does not match its content type");
    }
  } catch {
    await deleteStoredObjectOrQueue(parsed.data.url, "invalid_vehicle_media_upload");
    return { error: "Vehicle media could not be inspected" };
  }

  const { data, error } = await admin
    .from("vehicle_media")
    .insert({
      vehicle_id: parsed.data.vehicleId,
      url: parsed.data.url,
      media_type: parsed.data.mediaType,
      content_type: parsed.data.contentType,
      is_primary: false,
      sort_order: 0,
      moderation_status: "pending_scan",
    })
    .select()
    .single();

  if (error) {
    await deleteStoredObjectOrQueue(parsed.data.url, "failed_vehicle_media_record");
    return { error: "Vehicle media could not be saved" };
  }

  let result: ModerationResult;
  let storedUrl = parsed.data.url;
  const checkedAt = new Date().toISOString();
  try {
    result = await moderateMediaBytes(bytes, parsed.data.contentType, parsed.data.mediaType);
    if (result.decision === "allow") {
      const promoted = await promoteQuarantinedObject({
        storageReference: parsed.data.url,
        destinationKey: buildStorageKey({
          entity: "vehicle_media",
          ownerId: profile.profileId,
          recordId: vehicle.id,
          filename: `${data.id}.${extensionForContentType(parsed.data.contentType)}`,
        }),
      });
      storedUrl = promoted.publicUrl;
    }
    await recordModeration({
      entityType: "vehicle_media",
      entityId: data.id,
      authorId: profile.profileId,
      contentPreview: `${parsed.data.mediaType} vehicle upload`,
      evidenceReference: result.decision === "legal_hold" ? parsed.data.url : null,
      result,
    });
    const { error: updateError } = await admin.from("vehicle_media").update({
      url: storedUrl,
      moderation_status: statusForDecision(result.decision),
      moderation_reason: result.reasonCodes[0] ?? null,
      moderation_checked_at: checkedAt,
      moderation_version: result.modelVersion,
    }).eq("id", data.id);
    if (updateError) throw updateError;
    if (result.decision === "allow") {
      const { error: clearPrimaryError } = await admin
        .from("vehicle_media")
        .update({ is_primary: false })
        .eq("vehicle_id", parsed.data.vehicleId)
        .neq("id", data.id);
      if (clearPrimaryError) throw clearPrimaryError;
      const { error: primaryError } = await admin
        .from("vehicle_media")
        .update({ is_primary: true })
        .eq("id", data.id);
      if (primaryError) throw primaryError;
    }
    if (storedUrl !== parsed.data.url) {
      // The database already points at the promoted copy. Quarantine cleanup
      // is best-effort and must not roll a successful scan back to pending.
      await deleteStoredObjectOrQueue(parsed.data.url, "promoted_vehicle_media_source");
    }
  } catch (moderationError) {
    if (storedUrl !== parsed.data.url) {
      await deleteStoredObjectOrQueue(storedUrl, "failed_vehicle_media_promotion");
    }
    const fallback = blockedMediaResult("media_scan_failed", "review");
    await recordModeration({
      entityType: "vehicle_media",
      entityId: data.id,
      authorId: profile.profileId,
      contentPreview: `${parsed.data.mediaType} vehicle upload`,
      result: fallback,
    }).catch(() => undefined);
    await admin.from("vehicle_media").update({
      url: parsed.data.url,
      moderation_status: "pending_review",
      moderation_reason: fallback.reasonCodes[0],
      moderation_checked_at: checkedAt,
      moderation_version: fallback.modelVersion,
      is_primary: false,
    }).eq("id", data.id);
    console.error("vehicle media moderation failed", moderationError);
    result = fallback;
    storedUrl = parsed.data.url;
  }

  revalidatePath("/dashboard/vehicles");
  revalidatePath(`/dashboard/vehicles/${parsed.data.vehicleId}`);
  revalidatePath(`/vehicle/${parsed.data.vehicleId}`);
  revalidatePath("/marketplace");
  revalidatePath("/dashboard/listings");
  revalidatePath("/admin/vehicles");
  revalidatePath("/admin/listings");

  return {
    data: {
      ...data,
      url: storedUrl,
      moderation_status: statusForDecision(result.decision),
      moderation_reason: result.reasonCodes[0] ?? null,
      moderation_checked_at: checkedAt,
      moderation_version: result.modelVersion,
      is_primary: result.decision === "allow",
    },
    moderationMessage: moderationUserMessage(result.decision),
  };
}

export async function deleteVehiclePhoto(formData: FormData) {
  await removeVehiclePhoto({
    vehicleId: String(formData.get("vehicle_id") ?? ""),
    mediaId: String(formData.get("media_id") ?? ""),
  });
}

export async function removeVehiclePhoto(input: { vehicleId: string; mediaId: string }) {
  const parsed = deleteVehiclePhotoSchema.safeParse(input);

  if (!parsed.success) return { error: "Invalid photo" };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: vehicle } = await admin
    .from("vehicles")
    .select("id, owner_id")
    .eq("id", parsed.data.vehicleId)
    .single();

  if (!vehicle || vehicle.owner_id !== profile.profileId) {
    return { error: "You can only remove photos from vehicles you own" };
  }

  const { data: media } = await admin
    .from("vehicle_media")
    .select("url, is_primary")
    .eq("id", parsed.data.mediaId)
    .eq("vehicle_id", parsed.data.vehicleId)
    .maybeSingle();
  if (!media) return { error: "Media not found" };

  const { error: deleteError } = await admin
    .from("vehicle_media")
    .delete()
    .eq("id", parsed.data.mediaId)
    .eq("vehicle_id", parsed.data.vehicleId);
  if (deleteError) return { error: "Vehicle media could not be deleted" };

  await deleteStoredObjectOrQueue(media.url, "vehicle_media_deleted");

  if (media.is_primary) {
    const { data: nextPrimary } = await admin
      .from("vehicle_media")
      .select("id")
      .eq("vehicle_id", parsed.data.vehicleId)
      .eq("moderation_status", "active")
      .order("sort_order", { ascending: true })
      .order("uploaded_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextPrimary) {
      await admin.from("vehicle_media").update({ is_primary: true }).eq("id", nextPrimary.id);
    }
  }

  revalidatePath("/dashboard/vehicles");
  revalidatePath(`/dashboard/vehicles/${parsed.data.vehicleId}`);
  revalidatePath(`/vehicle/${parsed.data.vehicleId}`);
  revalidatePath("/marketplace");
  revalidatePath("/dashboard/listings");
  revalidatePath("/admin/vehicles");
  revalidatePath("/admin/listings");

  return { success: true };
}

export async function deleteVehicle(vehicleId: string) {
  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };
  const admin = createAdminClient();

  const { data: vehicle } = await admin
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("owner_id", profile.profileId)
    .maybeSingle();
  if (!vehicle) return { error: "Vehicle not found" };

  const [mediaResult, requestsResult] = await Promise.all([
    admin
      .from("vehicle_media")
      .select("url")
      .eq("vehicle_id", vehicleId),
    admin
      .from("ppi_requests")
      .select("id")
      .eq("vehicle_id", vehicleId),
  ]);
  if (mediaResult.error || requestsResult.error) {
    return { error: "The vehicle could not be prepared for deletion. Please try again." };
  }
  const media = mediaResult.data;
  const requests = requestsResult.data;
  let inspectionReferences: string[];
  try {
    inspectionReferences = await collectInspectionStorageReferences(
      (requests ?? []).map(({ id }) => id)
    );
  } catch {
    return { error: "The vehicle could not be prepared for deletion. Please try again." };
  }

  const { error } = await admin
    .from("vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("owner_id", profile.profileId);

  if (error) return { error: "The vehicle could not be deleted. Please try again." };

  await Promise.all([
    ...(media ?? []).map(({ url }) => deleteStoredObjectOrQueue(url, "vehicle_deleted")),
    cleanupInspectionStorage(inspectionReferences, "vehicle_inspections_deleted"),
  ]);

  revalidatePath("/dashboard/vehicles");
  return { success: true };
}
