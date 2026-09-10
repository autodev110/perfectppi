import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import {
  friendsDiscoveryEnabled,
  getMyFriendRequests,
  getMyFriends,
  mutateFriendship,
  type FriendActionOutcome,
} from "@/features/social/friends";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

const OUTCOME_STATUS: Record<FriendActionOutcome, number> = {
  invalid: 400,
  feature_unavailable: 503,
  profile_unavailable: 404,
  request_unavailable: 409,
  not_accepted: 403,
  rate_limited: 429,
};

// Friends, incoming requests, and outgoing requests for the signed-in member.
export async function GET() {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const [friends, requests, enabled] = await Promise.all([
    getMyFriends(),
    getMyFriendRequests(),
    friendsDiscoveryEnabled(),
  ]);
  return NextResponse.json(
    { data: { enabled, friends, incoming: requests.incoming, outgoing: requests.outgoing } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// One mutation endpoint: { profileId, action: request|accept|decline|cancel|remove }.
// Returns the canonical relationship state the client should render.
export async function POST(request: NextRequest) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const result = await mutateFriendship(await request.json().catch(() => null));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.outcome },
      { status: OUTCOME_STATUS[result.outcome] },
    );
  }
  return NextResponse.json({ data: { state: result.state, changed: result.changed } });
}
