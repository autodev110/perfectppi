import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroup } from "@/features/social/groups";
import { getGroupJoinRequests, getViewerGroupRole } from "@/features/social/group-tools";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

// GET /api/community/groups/<slug>/requests — pending join requests for the
// group's owner and moderators (plan 13.3). Decide with POST .../moderation
// { action: approve_request | decline_request, profileId }.
export async function GET(_request: Request, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  const role = await getViewerGroupRole(group.id);
  if (role !== "owner" && role !== "moderator") {
    return NextResponse.json({ error: "Only group moderators can review requests." }, { status: 403 });
  }
  const requests = await getGroupJoinRequests(group.id);
  return NextResponse.json({ data: { requests } }, { headers: { "Cache-Control": "private, no-store" } });
}
