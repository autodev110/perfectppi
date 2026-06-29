import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityPostOptions } from "@/features/community/queries";

export async function GET() {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const data = await getCommunityPostOptions();
  return NextResponse.json({ data });
}
