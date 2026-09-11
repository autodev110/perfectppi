import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getMemberProfile } from "@/features/profiles/member-profile";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{4,16}$/;

// GET /api/profiles/<username>: the social profile as another member sees it
// (plan 9.1/9.2). A profile that is unavailable, blocked in either direction,
// or hidden from exact lookup answers 404 without distinguishing why.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;

  const { username } = await params;
  const trimmed = username.trim().replace(/^@/, "");
  if (!USERNAME_PATTERN.test(trimmed)) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profile = await getMemberProfile(trimmed);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  return NextResponse.json({ data: profile }, { headers: { "Cache-Control": "private, no-store" } });
}
