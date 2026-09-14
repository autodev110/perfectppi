import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { recordProductEvent } from "@/features/analytics/product-events";

// The few product events that only the client can observe (a share sheet
// was used). Closed allowlist; nothing else about the action is accepted.
const bodySchema = z.object({
  event: z.enum(["invite_shared"]),
}).strict();

export async function POST(request: Request) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  await recordProductEvent({ profileId: auth.profile.id, eventName: parsed.data.event, surface: "profile" });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
