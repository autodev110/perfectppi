import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/contracts — list all contracts (admin only)
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const perPage = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("perPage") ?? 50)));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const admin = createAdminClient();
  const { data, count } = await admin
    .from("contracts")
    .select("id, warranty_order_id, signer_id, docuseal_id, presented_at, signed_at, document_url, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    perPage,
  });
}
