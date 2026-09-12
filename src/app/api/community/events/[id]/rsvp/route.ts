import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { setCommunityEventRsvp } from "@/features/social/events";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const result = await setCommunityEventRsvp({
    eventId: (await params).id,
    status: (await request.json().catch(() => null))?.status,
  });
  if (!result.ok) {
    const status = result.code === "at_capacity" ? 409
      : result.code === "feature_unavailable" ? 503
        : result.code === "forbidden" || result.code === "organizer_required" ? 403
          : result.code === "invalid" ? 400 : 404;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }
  return NextResponse.json({ data: result.data }, { headers: { "Cache-Control": "private, no-store" } });
}
