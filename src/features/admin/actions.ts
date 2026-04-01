"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/features/auth/guards";
import { revalidatePath } from "next/cache";

export async function provisionAdmin(targetProfileId: string) {
  await requireRole(["admin"]);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", targetProfileId);

  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}

export async function demoteToConsumer(targetProfileId: string) {
  await requireRole(["admin"]);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: "consumer" })
    .eq("id", targetProfileId);

  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}
