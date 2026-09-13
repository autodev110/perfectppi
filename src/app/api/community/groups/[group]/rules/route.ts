import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroup } from "@/features/social/groups";
import { acknowledgeGroupRules } from "@/features/social/group-tools";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

export async function POST(_request: Request, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const result = await acknowledgeGroupRules(group.id);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 403 });
  return NextResponse.json({ data: result.data });
}
