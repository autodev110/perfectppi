import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { addCommunityEventUpdate } from "@/features/social/events";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const result = await addCommunityEventUpdate({ eventId: (await params).id, content: body?.content });
  if (!result.ok) {
    const status = result.code === "rate_limited" ? 429
      : result.code === "invalid" || result.code === "content_not_allowed" ? 400
        : result.code === "forbidden" ? 403 : 404;
    const response = NextResponse.json({ error: result.message, code: result.code }, { status });
    if (result.retryAfterSeconds) response.headers.set("Retry-After", String(result.retryAfterSeconds));
    return response;
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
