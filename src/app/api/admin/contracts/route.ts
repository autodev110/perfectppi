import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";

// GET /api/admin/contracts — list all contracts (admin only)
// TODO Phase E: implement admin contracts query
export async function GET() {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: [], message: "Phase E" });
}
