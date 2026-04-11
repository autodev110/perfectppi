import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getAdminMetrics } from "@/features/admin/queries";

// GET /api/admin/metrics — platform-wide metrics for admin dashboard (admin only)
export async function GET() {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  const data = await getAdminMetrics();
  return NextResponse.json({ data });
}
