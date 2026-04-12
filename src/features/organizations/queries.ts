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

export async function getMyOrgWithTechnicianCount() {
  const org = await getMyOrg();
  if (!org) return null;

  const supabase = await createClient();
  const { count } = await supabase
    .from("technician_profiles")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org.id);

  return { org, techCount: count ?? 0 };
}

export async function getOrgInspections(
  orgId: string,
  page = 1,
  perPage = 50,
  filters?: { status?: string },
) {
  const supabase = await createClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  // Get profile IDs of techs in this org
  const { data: members } = await supabase
    .from("technician_profiles")
    .select("profile_id")
    .eq("organization_id", orgId);

  const profileIds = (members ?? []).map((m) => m.profile_id);
  if (profileIds.length === 0) return { submissions: [], total: 0 };

  let query = supabase
    .from("ppi_submissions")
    .select(
      `
      id, status, version, submitted_at,
      ppi_request:ppi_requests!ppi_submissions_ppi_request_id_fkey(
        id, ppi_type,
        vehicle:vehicles!ppi_requests_vehicle_id_fkey(year, make, model),
        requester:profiles!ppi_requests_requester_id_fkey(id, display_name, username)
      ),
      performer:profiles!ppi_submissions_performer_id_fkey(id, display_name, username)
    `,
      { count: "exact" },
    )
    .eq("is_current", true)
    .in("performer_id", profileIds)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (filters?.status) query = query.eq("status", filters.status as "draft" | "in_progress" | "submitted" | "completed");

  const { data, count } = await query;
  return { submissions: data ?? [], total: count ?? 0 };
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
