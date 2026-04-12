"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const createVehicleSchema = z.object({
  vin: z.string().max(17).optional().or(z.literal("")),
  year: z.coerce.number().min(1900).max(2100).optional(),
  make: z.string().min(1, "Make is required").max(100),
  model: z.string().min(1, "Model is required").max(100),
  trim: z.string().max(100).optional().or(z.literal("")),
  mileage: z.coerce.number().min(0).optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

const updateVehicleSchema = createVehicleSchema.partial();

const vehiclePhotoSchema = z.object({
  vehicleId: z.string().uuid(),
  url: z.string().url(),
  mediaType: z.enum(["image", "video"]),
});

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
    if (value !== "") raw[key] = value;
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
      .eq("vin", normalizedVin)
      .limit(1);

    const existingVehicle = existingVehicles?.[0];
    if (existingVehicle) {
      revalidatePath("/dashboard/vehicles");
      return { data: existingVehicle };
    }
  }

  const insertData = {
    ...parsed.data,
    vin: normalizedVin,
    trim: parsed.data.trim || null,
    owner_id: profile.id,
  };

  const { data, error } = await supabase
    .from("vehicles")
    .insert(insertData)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard/vehicles");
  return { data };
}

export async function updateVehicle(vehicleId: string, formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value !== "") raw[key] = value;
  }

  const parsed = updateVehicleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("vehicles")
    .update(parsed.data)
    .eq("id", vehicleId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/vehicles");
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  return { success: true };
}

async function setVehicleVisibilityFromForm(
  formData: FormData,
  visibility: "public" | "private"
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

export async function attachVehiclePhoto(input: {
  vehicleId: string;
  url: string;
  mediaType: "image" | "video";
}) {
  const parsed = vehiclePhotoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return profile;

  const admin = createAdminClient();
  const { data: vehicle } = await admin
    .from("vehicles")
    .select("id, owner_id")
    .eq("id", parsed.data.vehicleId)
    .single();

  if (!vehicle || vehicle.owner_id !== profile.profileId) {
    return { error: "You can only upload photos for vehicles you own" };
  }

  await admin
    .from("vehicle_media")
    .update({ is_primary: false })
    .eq("vehicle_id", parsed.data.vehicleId);

  const { data, error } = await admin
    .from("vehicle_media")
    .insert({
      vehicle_id: parsed.data.vehicleId,
      url: parsed.data.url,
      media_type: parsed.data.mediaType,
      is_primary: true,
      sort_order: 0,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard/vehicles");
  revalidatePath(`/dashboard/vehicles/${parsed.data.vehicleId}`);
  revalidatePath(`/vehicle/${parsed.data.vehicleId}`);
  revalidatePath("/marketplace");
  revalidatePath("/dashboard/listings");
  revalidatePath("/admin/vehicles");
  revalidatePath("/admin/listings");

  return { data };
}

export async function deleteVehiclePhoto(formData: FormData) {
  const parsed = deleteVehiclePhotoSchema.safeParse({
    vehicleId: formData.get("vehicle_id"),
    mediaId: formData.get("media_id"),
  });

  if (!parsed.success) return;

  const profile = await getCurrentProfileId();
  if ("error" in profile) return;

  const admin = createAdminClient();
  const { data: vehicle } = await admin
    .from("vehicles")
    .select("id, owner_id")
    .eq("id", parsed.data.vehicleId)
    .single();

  if (!vehicle || vehicle.owner_id !== profile.profileId) return;

  await admin
    .from("vehicle_media")
    .delete()
    .eq("id", parsed.data.mediaId)
    .eq("vehicle_id", parsed.data.vehicleId);

  const { data: nextMedia } = await admin
    .from("vehicle_media")
    .select("id")
    .eq("vehicle_id", parsed.data.vehicleId)
    .order("sort_order", { ascending: true })
    .order("uploaded_at", { ascending: true })
    .limit(1);

  const nextPrimary = nextMedia?.[0];
  if (nextPrimary) {
    await admin
      .from("vehicle_media")
      .update({ is_primary: true })
      .eq("id", nextPrimary.id);
  }

  revalidatePath("/dashboard/vehicles");
  revalidatePath(`/dashboard/vehicles/${parsed.data.vehicleId}`);
  revalidatePath(`/vehicle/${parsed.data.vehicleId}`);
  revalidatePath("/marketplace");
  revalidatePath("/dashboard/listings");
  revalidatePath("/admin/vehicles");
  revalidatePath("/admin/listings");
}

export async function deleteVehicle(vehicleId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", vehicleId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/vehicles");
  return { success: true };
}
