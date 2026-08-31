import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getEnforcementNotices } from "@/features/moderation/queries";

export async function GET() {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ data: await getEnforcementNotices(auth.profile.id) });
}
