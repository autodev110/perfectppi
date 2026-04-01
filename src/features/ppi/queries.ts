import { createClient } from "@/lib/supabase/server";

// Phase A: count queries only — full PPI engine is Phase B

export async function getMyPpiRequestCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) return 0;

  const { count } = await supabase
    .from("ppi_requests")
    .select("*", { count: "exact", head: true })
    .eq("requester_id", profile.id);

  return count ?? 0;
}

// For technician dashboard: inspections not yet completed/archived
export async function getMyTechQueueCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: techProfile } = await supabase
    .from("technician_profiles")
    .select("id, profile:profiles!inner(auth_user_id)")
    .eq("profile.auth_user_id", user.id)
    .single();
  if (!techProfile) return 0;

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profileRow) return 0;

  const { count } = await supabase
    .from("ppi_requests")
    .select("*", { count: "exact", head: true })
    .eq("assigned_tech_id", profileRow.id)
    .not("status", "in", '("completed","archived")');

  return count ?? 0;
}
