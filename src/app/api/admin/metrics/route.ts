import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";

// GET /api/admin/metrics — platform-wide metrics for admin dashboard (admin only)
// TODO Phase E: implement admin metrics query
export async function GET() {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: {}, message: "Phase E" });
}
