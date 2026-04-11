import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/warranties — list all warranty options and orders (admin only)
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const perPage = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("perPage") ?? 50)));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const admin = createAdminClient();

  const [{ data: options, count: optionCount }, { data: orders, count: orderCount }] =
    await Promise.all([
      admin
        .from("warranty_options")
        .select("id, user_id, vehicle_id, status, offered_at, viewed_at, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to),
      admin
        .from("warranty_orders")
        .select("id, warranty_option_id, plan_name, term_years, term_miles, price_cents, status, selected_at", { count: "exact" })
        .order("selected_at", { ascending: false })
        .range(from, to),
    ]);

  return NextResponse.json({
    data: {
      options: options ?? [],
      orders: orders ?? [],
      optionCount: optionCount ?? 0,
      orderCount: orderCount ?? 0,
    },
    page,
    perPage,
  });
}
