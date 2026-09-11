import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroup } from "@/features/social/groups";
import { getGroupMembers } from "@/features/social/group-tools";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

// GET /api/community/groups/<slug>/members?page= — owner, moderators, then
// members; blocked and unavailable profiles are omitted server-side.
export async function GET(request: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const members = await getGroupMembers(group.id, page, 50);
  return NextResponse.json(
    { data: { members, page, hasMore: members.length === 50 } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
