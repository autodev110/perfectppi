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
