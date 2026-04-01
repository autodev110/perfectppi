import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";

// GET /api/technicians/me/queue — assigned inspections filterable by status
// TODO Phase B: implement full queue logic
export async function GET() {
  const auth = await requireApiRole(["technician"]);
  if ("response" in auth) return auth.response;

  return NextResponse.json({ data: [], message: "Queue — Phase B" });
}
