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

export async function getAdminInspections(
  page = 1,
  perPage = 50,
  filters?: {
    status?: string;
    ppiType?: string;
    from?: string;
    to?: string;
  },
) {
  const supabase = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  // If filtering by ppiType, resolve matching request IDs first
  let requestIdFilter: string[] | null = null;
  if (filters?.ppiType) {
    const { data: matchingRequests } = await supabase
      .from("ppi_requests")
      .select("id")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("ppi_type", filters.ppiType as any);
    requestIdFilter = (matchingRequests ?? []).map((r) => r.id);
    if (requestIdFilter.length === 0) return { submissions: [], total: 0 };
  }

  let query = supabase
    .from("ppi_submissions")
    .select(
      `
      id, status, version, submitted_at, is_current, ppi_request_id,
      ppi_request:ppi_requests!ppi_submissions_ppi_request_id_fkey(
        id, ppi_type, performer_type,
        vehicle:vehicles!ppi_requests_vehicle_id_fkey(year, make, model, vin),
        requester:profiles!ppi_requests_requester_id_fkey(id, display_name, username)
      ),
      performer:profiles!ppi_submissions_performer_id_fkey(id, display_name, username)
    `,
      { count: "exact" },
    )
    .eq("is_current", true)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (filters?.status) query = query.eq("status", filters.status as "draft" | "in_progress" | "submitted" | "completed");
  if (filters?.from) query = query.gte("submitted_at", filters.from);
  if (filters?.to) query = query.lte("submitted_at", filters.to);
  if (requestIdFilter) query = query.in("ppi_request_id", requestIdFilter);

  const { data, count } = await query;
  return { submissions: data ?? [], total: count ?? 0 };
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

export async function getAdminInspectionDetail(requestId: string) {
  const supabase = createAdminClient();

  const [{ data: request }, { data: submission }] = await Promise.all([
    supabase
      .from("ppi_requests")
      .select(
        `
        *,
        vehicle:vehicles(id, year, make, model, trim, vin, mileage),
        requester:profiles!ppi_requests_requester_id_fkey(id, display_name, username, avatar_url),
        assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name, username, avatar_url)
      `
      )
      .eq("id", requestId)
      .single(),
    supabase
      .from("ppi_submissions")
      .select(
        `
        *,
        performer:profiles!ppi_submissions_performer_id_fkey(id, display_name, username),
        sections:ppi_sections(
          *,
          answers:ppi_answers(*)
        )
      `
      )
      .eq("ppi_request_id", requestId)
      .eq("is_current", true)
      .single(),
  ]);

  if (!request) return null;

  // Fetch outputs if there's a submission
  let outputs: { standardized: { id: string; generated_at: string; document_url: string | null; structured_content: unknown } | null; vsc: { id: string; generated_at: string; coverage_data: unknown } | null } = { standardized: null, vsc: null };
  if (submission) {
    const [{ data: standardized }, { data: vsc }] = await Promise.all([
      supabase
        .from("standardized_outputs")
        .select("id, generated_at, document_url, structured_content")
        .eq("ppi_submission_id", submission.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("vsc_outputs")
        .select("id, generated_at, coverage_data")
        .eq("ppi_submission_id", submission.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    outputs = { standardized: standardized ?? null, vsc: vsc ?? null };
  }

  const sortedSubmission = submission
    ? {
        ...submission,
        sections: ((submission.sections ?? []) as { sort_order: number; answers: { sort_order: number }[]; [key: string]: unknown }[])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({ ...s, answers: [...(s.answers ?? [])].sort((a, b) => a.sort_order - b.sort_order) })),
      }
    : null;

  return { request, submission: sortedSubmission, outputs };
}

export async function getAdminRecentSignups(limit = 8) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, username, role, created_at, avatar_url")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getAdminRecentPpiActivity(limit = 8) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ppi_submissions")
    .select(`
      id,
      status,
      version,
      submitted_at,
      ppi_request:ppi_requests!ppi_submissions_ppi_request_id_fkey(
        id,
        ppi_type,
        vehicle:vehicles!ppi_requests_vehicle_id_fkey(year, make, model)
      )
    `)
    .order("submitted_at", { ascending: false })
    .limit(limit);
  return data ?? [];
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
