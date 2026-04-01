import { createClient } from "@/lib/supabase/server";

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
