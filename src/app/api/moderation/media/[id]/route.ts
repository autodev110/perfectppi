import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModerationCapability } from "@/features/moderation/capabilities";
import { getStoredObjectRange } from "@/lib/storage/r2";
import { UPLOAD_LIMITS } from "@/config/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Restricted evidence access (plan 18.1 / 19.2). Moderators read the original
// object through this endpoint only; every read is appended to
// moderation_events as `evidence_accessed`. Legal-hold evidence stays behind
// the designated reviewer list. Nothing is redirected to a reusable object URL.

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;
  // Plan 18.1: evidence reads need an explicit grant, never the role alone.
  if (!(await hasModerationCapability(auth.profile.id, "queue_read"))) {
    return NextResponse.json({ error: "Preview unavailable" }, { status: 403, headers: NO_STORE });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Preview unavailable" }, { status: 404, headers: NO_STORE });
  }

  const admin = createAdminClient();
  const { data: item } = await admin.from("moderation_items")
    .select("id, status, entity_type")
    .in("entity_type", ["community_post_media", "vehicle_media"])
    .eq("entity_id", id)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: "Preview unavailable" }, { status: 404, headers: NO_STORE });
  }

  if (item.status === "legal_hold" && !(await hasModerationCapability(auth.profile.id, "legal_hold_review"))) {
    return NextResponse.json({ error: "Preview unavailable" }, { status: 403, headers: NO_STORE });
  }

  const table = item.entity_type === "vehicle_media" ? "vehicle_media" : "community_post_media";
  const { data: media } = await admin.from(table).select("url, media_type").eq("id", id).maybeSingle();
  if (!media) {
    return NextResponse.json({ error: "Media not found" }, { status: 404, headers: NO_STORE });
  }

  // A legal hold on the parent post restricts its media too, even when the
  // media item itself was approved earlier.
  if (item.entity_type === "community_post_media") {
    const { data: parent } = await admin
      .from("community_post_media")
      .select("post:community_posts!community_post_media_post_id_fkey(moderation_status)")
      .eq("id", id)
      .maybeSingle();
    const parentStatus = Array.isArray(parent?.post) ? parent?.post[0]?.moderation_status : parent?.post?.moderation_status;
    if (parentStatus === "legal_hold" && !(await hasModerationCapability(auth.profile.id, "legal_hold_review"))) {
      return NextResponse.json({ error: "Preview unavailable" }, { status: 403, headers: NO_STORE });
    }
  }

  // Audit before serving so a failed stream still leaves a record of intent.
  const { error: auditError } = await admin.from("moderation_events").insert({
    moderation_item_id: item.id,
    actor_type: "admin",
    actor_id: auth.profile.id,
    event_type: "evidence_accessed",
    previous_status: item.status,
    next_status: item.status,
    metadata: { entityType: item.entity_type, entityId: id, variant: "original" },
  });
  if (auditError) {
    console.error("[moderation/media] evidence access audit failed", auditError.message);
    return NextResponse.json({ error: "Preview unavailable" }, { status: 503, headers: NO_STORE });
  }

  try {
    const object = await getStoredObjectRange(media.url, request.headers.get("range"), {
      maxBytes: UPLOAD_LIMITS.maxVideoSize,
    });
    const headers = new Headers({
      ...NO_STORE,
      "Content-Type": object.contentType,
      "Content-Length": String(object.bytes.byteLength),
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    });
    if (object.etag) headers.set("ETag", object.etag);
    if (object.partial && object.contentRange) headers.set("Content-Range", object.contentRange);
    return new NextResponse(new Blob([new Uint8Array(object.bytes)], { type: object.contentType }), {
      status: object.partial ? 206 : 200,
      headers,
    });
  } catch (error) {
    console.error("[moderation/media] evidence fetch failed", {
      mediaId: id,
      error: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "Preview unavailable" }, { status: 502, headers: NO_STORE });
  }
}
