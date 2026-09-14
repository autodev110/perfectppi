import { NextResponse } from "next/server";
import { getMyEnforcementStatus } from "@/features/moderation/enforcement-status";

// GET /api/me/enforcement — the signed-in member's own enforcement notice.
// Reachable during a suspension (see ACCOUNT_UNAVAILABLE_ROUTES) so the
// member can see what happened, for how long, and how to ask for a review.
export async function GET() {
  const status = await getMyEnforcementStatus();
  if (!status) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ data: status }, { headers: { "Cache-Control": "private, no-store" } });
}
