import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getAdminTechnicians } from "@/features/admin/queries";

// GET /api/admin/technicians — list all technicians (admin only)
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const perPage = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("perPage") ?? 50)));

  const data = await getAdminTechnicians(page, perPage);
  return NextResponse.json({ data, page, perPage });
}
