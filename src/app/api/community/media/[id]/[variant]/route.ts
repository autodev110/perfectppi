import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoredObjectRange, isPrivateStorageReference } from "@/lib/storage/r2";
import {
  COMMUNITY_MEDIA_DISPLAY_VARIANTS,
  isApprovedCommunityReference,
  isLegacyPublicCommunityUrl,
} from "@/lib/storage/community-media";
import { UPLOAD_LIMITS } from "@/config/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Status-aware Community media delivery (plan 19.2).
//
// Every request re-verifies the viewer, the parent post's content and
// moderation status, its audience, and blocks before a single byte is
// streamed. Nothing here is cacheable by a shared cache and no direct object
// URL is ever revealed, so a report that hides a post denies its media on the
// very next request. Denials are a generic 404 so the moderation state is not
// leaked to ordinary callers.

const variantSchema = z.enum(COMMUNITY_MEDIA_DISPLAY_VARIANTS);
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function unavailable() {
  return NextResponse.json({ error: "Media unavailable" }, { status: 404, headers: NO_STORE });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variant: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id, variant } = await params;
  if (!z.string().uuid().safeParse(id).success || !variantSchema.safeParse(variant).success) {
    return unavailable();
  }

  const admin = createAdminClient();
  const { data: media } = await admin
    .from("community_post_media")
    .select("id, post_id, uploader_id, url, display_reference, media_type, content_type, moderation_status")
    .eq("id", id)
    .maybeSingle();
  if (!media) return unavailable();

  const viewerIsUploader = media.uploader_id === auth.profile.id;

  // Ordinary viewers: the media itself must be approved and the parent post
  // visible to this viewer right now. The uploader may also see their own
  // pending upload (it is their file) but never anything rejected or held.
  if (media.moderation_status === "rejected" || media.moderation_status === "legal_hold") {
    return unavailable();
  }
  if (!viewerIsUploader) {
    if (media.moderation_status !== "active") return unavailable();
    const { data: canView, error } = await admin.rpc("social_can_view_community_post", {
      p_viewer_id: auth.profile.id,
      p_post_id: media.post_id,
      p_include_muted: false,
    });
    if (error || !canView) return unavailable();
  }

  // Which object to stream: the metadata-stripped display variant for images;
  // the original for legacy videos (no variant exists). Until the retirement
  // worker has processed a legacy public-URL image it has no variant, so its
  // original is served here (it is already public at that URL); the uploader
  // may also see their own not-yet-approved original.
  const reference = media.media_type === "image"
    ? (media.display_reference
      ?? (isLegacyPublicCommunityUrl(media.url) || (viewerIsUploader && !isApprovedCommunityReference(media.url))
        ? media.url
        : null))
    : media.url;
  if (!reference) return unavailable();
  if (!isPrivateStorageReference(reference) && !/^https:\/\//.test(reference)) return unavailable();

  try {
    const object = await getStoredObjectRange(reference, request.headers.get("range"), {
      maxBytes: media.media_type === "video" ? UPLOAD_LIMITS.maxVideoSize : UPLOAD_LIMITS.maxImageSize,
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
    console.error("[community/media] delivery failed", {
      mediaId: id,
      error: error instanceof Error ? error.name : "unknown",
    });
    return unavailable();
  }
}
