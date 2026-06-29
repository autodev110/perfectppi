import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";

const deviceRegisterSchema = z.object({
  token: z.string().min(8).max(512),
  platform: z.enum(["ios", "android"]),
  env: z.enum(["prod", "sandbox"]).default("prod"),
  app_version: z.string().max(32).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiRole([
    "consumer",
    "technician",
    "org_manager",
    "admin",
  ]);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = deviceRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const { supabase, profile } = auth;
  const { error } = await supabase
    .from("device_tokens")
    .upsert(
      {
        profile_id: profile.id,
        token: parsed.data.token,
        platform: parsed.data.platform,
        env: parsed.data.env,
        app_version: parsed.data.app_version ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,token" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ok: true } });
}

const deviceDeleteSchema = z.object({
  token: z.string().min(8).max(512),
});

export async function DELETE(request: Request) {
  const auth = await requireApiRole([
    "consumer",
    "technician",
    "org_manager",
    "admin",
  ]);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = deviceDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { supabase, profile } = auth;
  const { error } = await supabase
    .from("device_tokens")
    .delete()
    .eq("profile_id", profile.id)
    .eq("token", parsed.data.token);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ok: true } });
}
