import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";

// GET /api/admin/warranties — list all warranty options and orders (admin only)
// TODO Phase E: implement admin warranties query
export async function GET() {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: [], message: "Phase E" });
}
