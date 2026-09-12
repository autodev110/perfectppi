import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { createCommunityEvent, eventsEnabled, getCommunityEvents } from "@/features/social/events";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;
const querySchema = z.object({
  group: z.string().uuid().optional(),
  includePast: z.enum(["true", "false"]).default("false"),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const parsed = querySchema.safeParse({
    group: request.nextUrl.searchParams.get("group") ?? undefined,
    includePast: request.nextUrl.searchParams.get("includePast") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid event filter", code: "invalid" }, { status: 400 });
  const enabled = await eventsEnabled();
  const events = enabled ? await getCommunityEvents({
    groupId: parsed.data.group,
    includePast: parsed.data.includePast === "true",
  }) : [];
  return NextResponse.json({ data: { enabled, events } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const result = await createCommunityEvent(await request.json().catch(() => null));
  if (!result.ok) {
    const status = result.code === "rate_limited" ? 429
      : result.code === "feature_unavailable" ? 503
        : result.code === "restricted" || result.code === "forbidden" ? 403
          : result.code === "invalid" || result.code === "invalid_schedule" || result.code === "content_not_allowed" ? 400
            : 500;
    const response = NextResponse.json({ error: result.message, code: result.code }, { status });
    if (result.retryAfterSeconds) response.headers.set("Retry-After", String(result.retryAfterSeconds));
    return response;
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
