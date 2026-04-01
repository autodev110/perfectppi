import { createAdminClient } from "@/lib/supabase/admin";

export async function getAdminMetrics() {
  const supabase = createAdminClient();

  const [
    { count: totalUsers },
    { count: totalTechnicians },
    { count: totalOrganizations },
    { count: totalVehicles },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("technician_profiles")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("organizations")
      .select("*", { count: "exact", head: true }),
    supabase.from("vehicles").select("*", { count: "exact", head: true }),
  ]);

  return {
    totalUsers: totalUsers ?? 0,
    totalTechnicians: totalTechnicians ?? 0,
    totalOrganizations: totalOrganizations ?? 0,
    totalVehicles: totalVehicles ?? 0,
  };
}

export async function getAdminUsers(page = 1, perPage = 50) {
  const supabase = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, count } = await supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  return { users: data ?? [], total: count ?? 0 };
}

export async function getAdminTechnicians(page = 1, perPage = 50) {
  const supabase = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, count } = await supabase
    .from("technician_profiles")
    .select("*, profile:profiles(*), organization:organizations(*)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);

  return { technicians: data ?? [], total: count ?? 0 };
}

export async function getAdminOrganizations(page = 1, perPage = 50) {
  const supabase = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, count } = await supabase
    .from("organizations")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  return { organizations: data ?? [], total: count ?? 0 };
}

export async function getAdminVehicles(page = 1, perPage = 50) {
  const supabase = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, count } = await supabase
    .from("vehicles")
    .select("*, owner:profiles(id, display_name, username)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  return { vehicles: data ?? [], total: count ?? 0 };
}
