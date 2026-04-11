import { createClient } from "@/lib/supabase/server";

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

export async function getMyNotifications(limit = 20) {
  const { supabase, profileId } = await getMyProfileId();
  if (!profileId) return [];

  // Explicit user_id filter — do NOT rely on RLS alone. Admin users have a
  // FOR ALL policy on notifications that would otherwise leak every row.
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function getUnreadCount(): Promise<number> {
  const { supabase, profileId } = await getMyProfileId();
  if (!profileId) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profileId)
    .is("read_at", null);

  return count ?? 0;
}
