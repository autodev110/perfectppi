"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const updateOrgSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  logo_url: z.string().url().optional().or(z.literal("")),
});

export async function updateOrg(formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value !== "") raw[key] = value;
  }

  const parsed = updateOrgSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Verify user is org_manager
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile || profile.role !== "org_manager") {
    return { error: "Not authorized" };
  }

  // Get org via technician_profile
  const { data: techProfile } = await supabase
    .from("technician_profiles")
    .select("organization_id")
    .eq("profile_id", profile.id)
    .single();

  if (!techProfile?.organization_id) {
    return { error: "No organization found" };
  }

  const { error } = await supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", techProfile.organization_id);

  if (error) return { error: error.message };

  revalidatePath("/org/profile");
  revalidatePath("/org");
  return { success: true };
}
