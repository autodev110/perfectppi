"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/features/auth/guards";
import { revalidatePath } from "next/cache";

export async function provisionAdmin(targetProfileId: string, _formData?: FormData) {
  void _formData;
  await requireRole(["admin"]);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", targetProfileId);

  if (error) {
    throw new Error(`Failed to make user admin: ${error.message}`);
  }

  revalidatePath("/admin/users");
}

export async function demoteToConsumer(targetProfileId: string, _formData?: FormData) {
  void _formData;
  await requireRole(["admin"]);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: "consumer" })
    .eq("id", targetProfileId);

  if (error) {
    throw new Error(`Failed to demote user: ${error.message}`);
  }

  revalidatePath("/admin/users");
}

export async function toggleTechnicianFeatured(techId: string, value: boolean) {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("technician_profiles")
    .update({ is_featured: value })
    .eq("id", techId);
  return error ? { error: error.message } : { success: true };
}

export async function toggleTechnicianVerified(techId: string, value: boolean) {
  await requireRole(["admin"]);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("technician_profiles")
    .update({ is_verified: value })
    .eq("id", techId);
  return error ? { error: error.message } : { success: true };
}
