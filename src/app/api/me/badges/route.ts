import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/me/badges — counts behind navigation badges (plan 7.1 / 22.2):
// unread notifications, incoming friend requests, unread messages. One
// source for every surface so tabs, rows, and bells never disagree.
export async function GET() {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { data, error } = await createAdminClient().rpc("member_activity_badges", {
    p_profile_id: auth.profile.id,
  });
  if (error) {
    console.error("member_activity_badges failed", error.message);
    return NextResponse.json({ error: "Badges unavailable" }, { status: 503 });
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  const count = (key: string) => Math.max(0, Number(raw[key] ?? 0) || 0);
  return NextResponse.json(
    {
      data: {
        unreadNotifications: count("unreadNotifications"),
        pendingFriendRequests: count("pendingFriendRequests"),
        unreadMessages: count("unreadMessages"),
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
