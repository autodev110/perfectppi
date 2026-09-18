import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";

// The few product events that only the client can observe (a share sheet
// was used, the app came to the foreground, the OS delivered a crash
// report). Closed allowlist; nothing else about the action is accepted —
// no stack traces, device details, or timings.
const bodySchema = z.object({
  event: z.enum(["invite_shared", "app_session_started", "app_crash_detected"]),
}).strict();

export async function POST(request: Request) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  const { error } = await createAdminClient().rpc("record_client_product_event", {
    p_profile_id: auth.profile.id,
    p_event_name: parsed.data.event,
  });
  if (error?.code === "54000") {
    return NextResponse.json({ error: "Please wait before sending another event." }, {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": "300" },
    });
  }
  if (error) {
    console.error("client analytics event failed", { code: error.code });
    return NextResponse.json({ error: "Event could not be recorded." }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
