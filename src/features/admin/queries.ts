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
    .select("*, vehicle_media(*), owner:profiles(id, display_name, username)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  return { vehicles: data ?? [], total: count ?? 0 };
}

type AdminOutputStatus = "ready" | "pending_vsc";

interface AdminOutputRow {
  standardizedOutputId: string;
  vscOutputId: string | null;
  submissionId: string;
  requestId: string | null;
  version: number;
  ppiType: string | null;
  vehicleLabel: string;
  vin: string | null;
  standardizedGeneratedAt: string;
  vscGeneratedAt: string | null;
  status: AdminOutputStatus;
}

export async function getAdminOutputs(page = 1, perPage = 50) {
  const supabase = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const [{ data: standardizedRows, count: totalStandardized }, { count: totalVsc }] =
    await Promise.all([
      supabase
        .from("standardized_outputs")
        .select(
          `
          id,
          ppi_submission_id,
          version,
          generated_at,
          ppi_submission:ppi_submissions(
            id,
            ppi_request_id,
            request:ppi_requests(
              id,
              ppi_type,
              vehicle:vehicles(year, make, model, trim, vin)
            )
          )
        `,
          { count: "exact" }
        )
        .order("generated_at", { ascending: false })
        .range(from, to),
      supabase.from("vsc_outputs").select("*", { count: "exact", head: true }),
    ]);

  const rows = standardizedRows ?? [];
  const submissionIds = Array.from(new Set(rows.map((row) => row.ppi_submission_id)));

  const vscBySubmissionVersion = new Map<
    string,
    { id: string; generated_at: string }
  >();

  if (submissionIds.length > 0) {
    const { data: vscRows } = await supabase
      .from("vsc_outputs")
      .select("id, ppi_submission_id, version, generated_at")
      .in("ppi_submission_id", submissionIds);

    for (const vsc of vscRows ?? []) {
      vscBySubmissionVersion.set(`${vsc.ppi_submission_id}:${vsc.version}`, {
        id: vsc.id,
        generated_at: vsc.generated_at,
      });
    }
  }

  const outputs: AdminOutputRow[] = rows.map((row) => {
    const submission = row.ppi_submission as {
      id: string;
      ppi_request_id: string;
      request: {
        id: string;
        ppi_type: string;
        vehicle: {
          year: number | null;
          make: string | null;
          model: string | null;
          trim: string | null;
          vin: string | null;
        } | null;
      } | null;
    } | null;

    const vehicle = submission?.request?.vehicle ?? null;
    const vehicleLabel =
      [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim]
        .filter(Boolean)
        .join(" ") || "Unknown Vehicle";

    const vsc = vscBySubmissionVersion.get(
      `${row.ppi_submission_id}:${row.version}`
    );

    return {
      standardizedOutputId: row.id,
      vscOutputId: vsc?.id ?? null,
      submissionId: row.ppi_submission_id,
      requestId: submission?.ppi_request_id ?? null,
      version: row.version,
      ppiType: submission?.request?.ppi_type ?? null,
      vehicleLabel,
      vin: vehicle?.vin ?? null,
      standardizedGeneratedAt: row.generated_at,
      vscGeneratedAt: vsc?.generated_at ?? null,
      status: vsc ? "ready" : "pending_vsc",
    };
  });

  const pendingVsc = outputs.filter((output) => output.status === "pending_vsc").length;

  return {
    outputs,
    total: totalStandardized ?? 0,
    totalStandardized: totalStandardized ?? 0,
    totalVsc: totalVsc ?? 0,
    pendingVsc,
  };
}

type AdminAuditActor = {
  id: string;
  display_name: string | null;
  username: string | null;
  role: string;
} | null;

interface AdminAuditLogRow {
  id: string;
  actorId: string;
  actor: AdminAuditActor;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function getAdminAuditLogs(page = 1, perPage = 100) {
  const supabase = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, count } = await supabase
    .from("audit_logs")
    .select(
      `
      id,
      actor_id,
      action,
      target_type,
      target_id,
      metadata,
      created_at,
      actor:profiles!audit_logs_actor_id_fkey(
        id,
        display_name,
        username,
        role
      )
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  const logs: AdminAuditLogRow[] = (data ?? []).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actor: (row.actor as AdminAuditActor) ?? null,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
  }));

  return { logs, total: count ?? 0 };
}
