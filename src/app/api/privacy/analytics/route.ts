import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
const preferenceSchema = z.object({ enabled: z.boolean() }).strict();

export async function GET() {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;

  const { data, error } = await createAdminClient()
    .from("product_analytics_preferences")
    .select("enabled")
    .eq("profile_id", auth.profile.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Analytics preference could not be loaded." }, { status: 500 });
  }
  return NextResponse.json({ enabled: data?.enabled ?? true }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const parsed = preferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose whether to share product usage analytics." }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("set_product_analytics_preference", {
    p_profile_id: auth.profile.id,
    p_enabled: parsed.data.enabled,
  });
  if (error) {
    return NextResponse.json({ error: "Analytics preference could not be saved." }, { status: 500 });
  }
  return NextResponse.json({ enabled: data }, { headers: { "Cache-Control": "no-store" } });
}
