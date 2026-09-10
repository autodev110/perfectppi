import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroups, groupsEnabled } from "@/features/social/groups";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

export async function GET() {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const enabled = await groupsEnabled();
  return NextResponse.json(
    { data: { enabled, groups: enabled ? await getCommunityGroups() : [] } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
