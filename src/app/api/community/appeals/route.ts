import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  entityId: z.string().uuid(),
  statement: z.string().trim().min(10).max(1000),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid appeal" }, { status: 400 });

  const admin = createAdminClient();
  const { data: item } = await admin.from("moderation_items")
    .select("id")
    .eq("entity_type", "community_post")
    .eq("entity_id", parsed.data.entityId)
    .eq("author_id", auth.profile.id)
    .eq("status", "rejected")
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Appeal is not available" }, { status: 409 });

  const { error } = await admin.rpc("open_moderation_appeal", {
    p_item_id: item.id,
    p_appellant_id: auth.profile.id,
    p_statement: parsed.data.statement,
  });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Appeal already submitted" : error.message }, { status: 409 });
  return NextResponse.json({ data: { submitted: true } }, { status: 201 });
}
