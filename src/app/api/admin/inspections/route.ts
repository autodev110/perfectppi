import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/inspections — list all PPI inspections (admin only)
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const perPage = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("perPage") ?? 50)));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const admin = createAdminClient();
  const { data, count } = await admin
    .from("ppi_requests")
    .select(
      `
      id,
      status,
      ppi_type,
      performer_type,
      whose_car,
      requester_role,
      created_at,
      updated_at,
      requester:profiles!ppi_requests_requester_id_fkey(id, display_name, username),
      assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name, username),
      vehicle:vehicles(id, year, make, model, trim, vin)
    `,
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(from, to);

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    perPage,
  });
}
