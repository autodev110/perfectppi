"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getMyProfileId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, profileId: null as string | null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  return { supabase, profileId: profile?.id ?? null };
}

export async function markNotificationRead(notificationId: string) {
  const { supabase, profileId } = await getMyProfileId();
  if (!profileId) return { error: "Not authenticated" };

  // Explicit user_id filter — do NOT rely on RLS alone. Admin's FOR ALL
  // policy would otherwise let this mutate any user's notification.
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", profileId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function markAllNotificationsRead() {
  const { supabase, profileId } = await getMyProfileId();
  if (!profileId) return { error: "Not authenticated" };

  // CRITICAL: without this filter, admin accounts would mark every user's
  // notifications read in a single call.
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", profileId)
    .is("read_at", null);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
