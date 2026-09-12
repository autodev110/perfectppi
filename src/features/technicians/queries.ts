import { createClient } from "@/lib/supabase/server";
import { getBlockedProfileIds, getCurrentSocialProfileId } from "@/features/social/relationships";
import { getPublicCredentialMap } from "@/features/technicians/credentials";

const publicTechnicianSelect = `
  id, profile_id, organization_id, specialties, supported_makes, service_area,
  offers_mobile_service, offers_shop_service, is_available, is_independent,
  total_inspections, avg_rating, total_reviews,
  profile:profiles!technician_profiles_profile_id_fkey!inner(
    id, username, display_name, avatar_url, bio, is_public
  ),
  organization:organizations(id, name, slug, logo_url)
` as const;

export async function getDirectory(filters?: {
  certification?: string;
  specialty?: string;
  orgId?: string;
  isIndependent?: boolean;
}) {
  const supabase = await createClient();
  const viewerId = await getCurrentSocialProfileId();

  let query = supabase
    .from("technician_profiles")
    .select(publicTechnicianSelect)
    .eq("profile.is_public", true)
    .eq("profile.discoverable", true)
    .order("total_inspections", { ascending: false });

  if (filters?.orgId) {
    query = query.eq("organization_id", filters.orgId);
  }

  if (filters?.isIndependent !== undefined) {
    query = query.eq("is_independent", filters.isIndependent);
  }

  if (filters?.specialty) {
    query = query.contains("specialties", [filters.specialty]);
  }

  const { data } = await query;
  const rows = data ?? [];
  const profileIds = rows.flatMap((row) => row.profile ? [row.profile.id] : []);
  const [blockedIds, credentialMap] = await Promise.all([
    viewerId ? getBlockedProfileIds(viewerId, profileIds) : Promise.resolve(new Set<string>()),
    getPublicCredentialMap(rows.map((row) => row.id)),
  ]);
  const credentialTypeByFilter: Record<string, string> = {
    ase: "ase",
    master: "ase_master",
    oem_qualified: "oem_training",
  };

  return rows
    .filter((row) => !row.profile || !blockedIds.has(row.profile.id))
    .map((row) => ({ ...row, credentials: credentialMap.get(row.id) ?? [] }))
    .filter((row) => {
      if (!filters?.certification) return true;
      if (filters.certification === "none") return row.credentials.length === 0;
      const credentialType = credentialTypeByFilter[filters.certification];
      return credentialType
        ? row.credentials.some((credential) => credential.credential_type === credentialType)
        : true;
    });
}

// id = technician_profiles.id (the PK used in /technicians/[id] URLs)
export async function getTechProfile(id: string) {
  const supabase = await createClient();
  const viewerId = await getCurrentSocialProfileId();

  const { data } = await supabase
    .from("technician_profiles")
    .select(publicTechnicianSelect)
    .eq("id", id)
    .eq("profile.is_public", true)
    .single();

  if (!data?.profile) return null;
  const [blockedIds, credentialMap] = await Promise.all([
    viewerId ? getBlockedProfileIds(viewerId, [data.profile.id]) : Promise.resolve(new Set<string>()),
    getPublicCredentialMap([data.id]),
  ]);
  return blockedIds.has(data.profile.id)
    ? null
    : { ...data, credentials: credentialMap.get(data.id) ?? [] };
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
