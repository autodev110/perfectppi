import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";

const patchSchema = z.object({
  read: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole([
    "consumer",
    "technician",
    "org_manager",
    "admin",
  ]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { supabase, profile } = auth;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: parsed.data.read ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", profile.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ok: true } });
}
