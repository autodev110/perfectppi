import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getAdminCommunications } from "@/features/messages/queries";

// GET /api/admin/communications — list all conversations and message activity (admin only)
export async function GET() {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  const data = await getAdminCommunications();
  return NextResponse.json({ data });
}
