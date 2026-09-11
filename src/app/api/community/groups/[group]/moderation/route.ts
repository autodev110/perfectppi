import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroup } from "@/features/social/groups";
import { moderateGroup } from "@/features/social/group-tools";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;
const STATUS = { invalid: 400, feature_unavailable: 503, forbidden: 403, not_found: 404, conflict: 409 } as const;

// POST /api/community/groups/<slug>/moderation
// { action, postId?, profileId?, username?, reason? } — owner/moderator tools
// (plan 13.4/13.7) plus approve_request / decline_request / invite (13.3).
export async function POST(request: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const { group: slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await moderateGroup({ ...(body ?? {}), groupId: group.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.outcome }, { status: STATUS[result.outcome] });
  }
  return NextResponse.json({ data: { action: result.action, ...result.result } });
}
