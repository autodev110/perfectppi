"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const updateTechProfileSchema = z.object({
  specialties: z.array(z.string()).optional(),
  certification_level: z
    .enum(["none", "ase", "master", "oem_qualified"])
    .optional(),
  is_independent: z.boolean().optional(),
  service_area: z.string().max(200).optional().nullable(),
  is_available: z.boolean().optional(),
});

function normalizeSpecialties(values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
}

export async function updateTechProfile(formData: FormData) {
  const specialties = normalizeSpecialties(
    formData.getAll("specialties") as string[]
  );
  const serviceAreaRaw = formData.get("service_area") as string | null;
  const raw = {
    specialties: specialties.length > 0 ? specialties : undefined,
    certification_level:
      (formData.get("certification_level") as string) || undefined,
    is_independent:
      formData.get("is_independent") === "true" ||
      formData.get("is_independent") === "on",
    service_area: serviceAreaRaw?.trim() || null,
    is_available:
      formData.get("is_available") === "true" ||
      formData.get("is_available") === "on",
  };

  const parsed = updateTechProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const { error } = await supabase
    .from("technician_profiles")
    .update(parsed.data)
    .eq("profile_id", profile.id);

  if (error) return { error: error.message };

  revalidatePath("/tech/profile");
  revalidatePath("/tech");
  return { success: true };
}
