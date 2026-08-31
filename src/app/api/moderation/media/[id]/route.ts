import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePresignedGetUrl } from "@/lib/storage/r2";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const admin = createAdminClient();
  const { data: item } = await admin.from("moderation_items")
    .select("status")
    .eq("entity_type", "community_post_media")
    .eq("entity_id", id)
    .maybeSingle();
  if (!item || item.status === "legal_hold") {
    return NextResponse.json({ error: "Preview unavailable" }, { status: 403 });
  }
  const { data: media } = await admin.from("community_post_media").select("url").eq("id", id).maybeSingle();
  if (!media) return NextResponse.json({ error: "Media not found" }, { status: 404 });
  const url = await generatePresignedGetUrl(media.url, 300);
  return NextResponse.redirect(url);
}
