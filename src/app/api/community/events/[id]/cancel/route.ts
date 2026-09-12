import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { cancelCommunityEvent } from "@/features/social/events";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const result = await cancelCommunityEvent({ eventId: (await params).id, reason: body?.reason });
  if (!result.ok) {
    const status = result.code === "invalid" ? 400 : result.code === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }
  return NextResponse.json({ data: result.data }, { headers: { "Cache-Control": "private, no-store" } });
}
