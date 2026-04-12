import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getMyVehicles() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return [];

  const { data } = await supabase
    .from("vehicles")
    .select("*, vehicle_media(*)")
    .eq("owner_id", profile.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getVehicle(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("vehicles")
    .select("*, vehicle_media(*)")
    .eq("id", id)
    .single();

  return data;
}

export async function getPublicVehicle(id: string) {
  const admin = createAdminClient();

  const { data: vehicle } = await admin
    .from("vehicles")
    .select(`
      *,
      vehicle_media(*),
      owner:profiles!vehicles_owner_id_fkey(id, display_name, username, avatar_url, is_public)
    `)
    .eq("id", id)
    .eq("visibility", "public")
    .single();

  return vehicle ?? null;
}

export async function getVehiclePpiHistory(vehicleId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("ppi_requests")
    .select(`
      id,
      ppi_type,
      status,
      created_at,
      updated_at,
      requester:profiles!ppi_requests_requester_id_fkey(id, display_name, username, avatar_url),
      assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name, username, avatar_url)
    `)
    .eq("vehicle_id", vehicleId)
    .in("status", ["submitted", "completed"])
    .order("created_at", { ascending: false });

  return data ?? [];
}
