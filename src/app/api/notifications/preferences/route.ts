import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getNotificationPreferences, setNotificationPreference } from "@/features/notifications/preferences";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

// Per-category in-app/push switches (plan 22.1). Safety and account
// categories are reported as locked and reject changes.
export async function GET() {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  try {
    const data = await getNotificationPreferences(auth.profile.id);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("notification preferences failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Preferences unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const result = await setNotificationPreference(auth.profile.id, await request.json().catch(() => null));
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.error === "Invalid preference" ? 400 : 409 });
  }
  return NextResponse.json({ data: result.data });
}
