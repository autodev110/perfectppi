import { createClient } from "@/lib/supabase/server";

export async function getMyOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return null;

  // Get org via technician_profile
  const { data: techProfile } = await supabase
    .from("technician_profiles")
    .select("organization_id")
    .eq("profile_id", profile.id)
    .single();

  if (!techProfile?.organization_id) return null;

  const { data } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", techProfile.organization_id)
    .single();

  return data;
}

export async function getOrgTechnicians(orgId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("technician_profiles")
    .select(
      `
      *,
      profile:profiles!technician_profiles_profile_id_fkey(
        id, username, display_name, avatar_url, bio
      )
    `
    )
    .eq("organization_id", orgId)
    .order("total_inspections", { ascending: false });

  return data ?? [];
}
