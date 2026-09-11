import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getCommunityGroups, getMyGroupInvitations, groupsEnabled } from "@/features/social/groups";
import { createCommunityGroup, groupCreationEnabled, type GroupCreateOutcome } from "@/features/social/group-create";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

export async function GET() {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const [enabled, creationEnabled] = await Promise.all([groupsEnabled(), groupCreationEnabled()]);
  const [groups, invitations] = enabled
    ? await Promise.all([getCommunityGroups(), getMyGroupInvitations()])
    : [[], []];
  return NextResponse.json(
    { data: { enabled, creationEnabled, groups, invitations } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

const CREATE_STATUS: Record<GroupCreateOutcome, number> = {
  invalid: 400, feature_unavailable: 503, account_too_new: 403, restricted: 403,
  rate_limited: 429, slug_taken: 409, policy_not_allowed: 400, forbidden: 403, failed: 500,
};

// POST /api/community/groups — member-created group (plan 13.2, 13.3).
export async function POST(request: NextRequest) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const result = await createCommunityGroup(await request.json().catch(() => null));
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.outcome }, { status: CREATE_STATUS[result.outcome] });
  }
  return NextResponse.json({ data: { id: result.id, slug: result.slug } }, { status: 201 });
}
