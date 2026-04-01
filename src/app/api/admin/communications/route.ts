import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";

// GET /api/admin/communications — list all conversations and messages (admin only)
// TODO Phase E: implement admin communications query
export async function GET() {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: [], message: "Phase E" });
}
