import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireApiRole(["org_manager"]);
  if ("response" in auth) return auth.response;

  // Look up the manager's org via their own tech profile, using the
  // user-scoped client (RLS allows self-read).
  const { data: techProfile } = await auth.supabase
    .from("technician_profiles")
    .select("organization_id")
    .eq("profile_id", auth.profile.id)
    .single();

  if (!techProfile?.organization_id) {
    return NextResponse.json(
      { error: "No organization found" },
      { status: 404 },
    );
  }
  const orgId = techProfile.organization_id;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const perPage = Math.max(1, Math.min(200, Number(searchParams.get("perPage") ?? 50)));
  const status = searchParams.get("status");

  // Use admin client to query cross-user data. We've already verified the
  // caller is an org_manager and limited the query to *their* org_id, so
  // bypassing RLS here is scoped and safe — every row is filtered by
  // `performer_id IN (techs of orgId)`.
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("technician_profiles")
    .select("profile_id")
    .eq("organization_id", orgId);

  const profileIds = (members ?? []).map((m) => m.profile_id);
  if (profileIds.length === 0) {
    return NextResponse.json({ data: [], total: 0, page, perPage });
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = admin
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

  if (status) {
    query = query.eq(
      "status",
      status as "draft" | "in_progress" | "submitted" | "completed",
    );
  }

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    perPage,
  });
}
