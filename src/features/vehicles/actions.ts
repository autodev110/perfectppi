"use server";

import { createClient } from "@/lib/supabase/server";
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

  const insertData = {
    ...parsed.data,
    vin: parsed.data.vin || null,
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
