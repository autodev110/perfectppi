import { createClient } from "@/lib/supabase/server";

export async function getDirectory(filters?: {
  certification?: string;
  specialty?: string;
  orgId?: string;
  isIndependent?: boolean;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("technician_profiles")
    .select(
      `
      *,
      profile:profiles!technician_profiles_profile_id_fkey!inner(
        id, username, display_name, avatar_url, bio, is_public
      ),
      organization:organizations(id, name, slug, logo_url)
    `
    )
    .eq("profile.is_public", true)
    .order("total_inspections", { ascending: false });

  if (filters?.certification) {
    query = query.eq("certification_level", filters.certification as "none" | "ase" | "master" | "oem_qualified");
  }

  if (filters?.orgId) {
    query = query.eq("organization_id", filters.orgId);
  }

  if (filters?.isIndependent !== undefined) {
    query = query.eq("is_independent", filters.isIndependent);
  }

  const { data } = await query;
  return data ?? [];
}

// id = technician_profiles.id (the PK used in /technicians/[id] URLs)
export async function getTechProfile(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("technician_profiles")
    .select(
      `
      *,
      profile:profiles!technician_profiles_profile_id_fkey!inner(
        id, username, display_name, avatar_url, bio, is_public
      ),
      organization:organizations(id, name, slug, logo_url)
    `
    )
    .eq("id", id)
    .eq("profile.is_public", true)
    .single();

  return data;
}

export async function getMyTechProfile() {
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

  const { data } = await supabase
    .from("technician_profiles")
    .select(
      `
      *,
      organization:organizations(id, name, slug, logo_url)
    `
    )
    .eq("profile_id", profile.id)
    .single();

  return data;
}
