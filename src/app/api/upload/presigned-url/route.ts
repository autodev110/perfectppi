import { NextResponse } from "next/server";
import { recordProductEvent } from "@/features/analytics/product-events";
import { browserFamily, logUploadEvent } from "@/features/uploads/diagnostics";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildQuarantineKey,
  buildStorageKey,
  generatePrivatePresignedUrl,
  generateQuarantinePresignedUrl,
} from "@/lib/storage/r2";
import { z } from "zod";
import { UPLOAD_LIMITS } from "@/config/constants";
import { canUploadToTarget } from "@/features/uploads/access";
import { communityUploadRefusal } from "@/features/uploads/community-policy";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  entity: z.enum([
    "ppi_media",
    "vehicle_media",
    "media_package",
    "community_post",
    "community_group",
    "message_attachment",
    "vehicle_document",
  ]),
  recordId: z.string().uuid(),
});

const QUARANTINED = new Set(["community_post", "vehicle_media", "community_group"]);
const CREATE_ONLY_UPLOAD_HEADERS = { "If-None-Match": "*" } as const;


// Refusals are logged with metadata only (Renditions doc: diagnostics), so a
// device- or browser-specific failure pattern is visible in the log stream.
function refuse(request: Request, reason: string, status: number, meta: { entity?: string; contentType?: string; sizeBytes?: number }, body: Record<string, unknown> = { error: reason }) {
  logUploadEvent({ source: "server", stage: "presign", outcome: "refused", status, reason, entity: meta.entity ?? "unknown", contentType: meta.contentType, sizeBytes: meta.sizeBytes, browser: browserFamily(request.headers.get("user-agent")) });
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  // Validate content type
  const allowedTypes = [
    ...UPLOAD_LIMITS.allowedImageTypes,
    ...UPLOAD_LIMITS.allowedVideoTypes,
    ...(parsed.data.entity === "media_package" || parsed.data.entity === "message_attachment" || parsed.data.entity === "vehicle_document"
      ? UPLOAD_LIMITS.allowedFileTypes
      : []),
  ];
  if (!(allowedTypes as string[]).includes(parsed.data.contentType)) {
    return refuse(request, "File type not allowed", 400, { entity: parsed.data.entity, contentType: parsed.data.contentType, sizeBytes: parsed.data.size });
  }

  const isImage = (UPLOAD_LIMITS.allowedImageTypes as readonly string[]).includes(parsed.data.contentType);
  const isVideo = (UPLOAD_LIMITS.allowedVideoTypes as readonly string[]).includes(parsed.data.contentType);
  const refusal = await communityUploadRefusal(parsed.data.entity, isVideo, profile.id);
  if (refusal) return refusal;
  const maxBytes = isImage
    ? UPLOAD_LIMITS.maxImageSize
    : isVideo ? UPLOAD_LIMITS.maxVideoSize : UPLOAD_LIMITS.maxFileSize;
  if (parsed.data.size > maxBytes) {
    return refuse(request, `File too large. Max size is ${Math.floor(maxBytes / (1024 * 1024))}MB`, 400, { entity: parsed.data.entity, contentType: parsed.data.contentType, sizeBytes: parsed.data.size });
  }

  const canUpload = await canUploadToTarget(
    supabase,
    profile.id,
    parsed.data.entity,
    parsed.data.recordId
  );
  if (!canUpload) {
    return refuse(request, "Upload target not found", 404, { entity: parsed.data.entity, contentType: parsed.data.contentType, sizeBytes: parsed.data.size });
  }

  const keyParams = {
    entity: parsed.data.entity,
    ownerId: profile.id,
    recordId: parsed.data.recordId,
    filename: parsed.data.filename,
  };

  try {
    if (QUARANTINED.has(parsed.data.entity)) {
      const admin = createAdminClient();
      const now = Date.now();
      // A presigned URL is valid for ten minutes, so a reservation still
      // "issued" after that belongs to an abandoned attempt (failed upload,
      // closed composer). Retire those first; otherwise a few failed tries
      // pin the member against the open-upload cap for half an hour and
      // surface as a mysterious rate limit.
      await admin.from("community_upload_reservations")
        .update({ status: "expired" })
        .eq("profile_id", profile.id)
        .eq("status", "issued")
        .lt("created_at", new Date(now - 10 * 60 * 1000).toISOString());

      const since = new Date(now - 60 * 60 * 1000).toISOString();
      const [{ count: recentCount }, { count: openCount }] = await Promise.all([
        admin.from("community_upload_reservations").select("id", { count: "exact", head: true })
          .eq("profile_id", profile.id).gte("created_at", since),
        admin.from("community_upload_reservations").select("id", { count: "exact", head: true })
          .eq("profile_id", profile.id).eq("status", "issued").gt("expires_at", new Date(now).toISOString()),
      ]);
      if ((recentCount ?? 0) >= 120 || (openCount ?? 0) >= 30) {
        return NextResponse.json(
          {
            error: "Too many photo uploads are still pending from earlier attempts. Wait a few minutes, then try again.",
            code: "upload_backlog",
            retryAfterSeconds: 600,
          },
          { status: 429, headers: { "Retry-After": "600" } },
        );
      }

      const result = await generateQuarantinePresignedUrl({
        key: buildQuarantineKey(keyParams),
        contentType: parsed.data.contentType,
        contentLength: parsed.data.size,
      });
      const { error: reservationError } = await admin.from("community_upload_reservations").insert({
        profile_id: profile.id,
        post_id: parsed.data.entity === "community_post" ? parsed.data.recordId : null,
        vehicle_id: parsed.data.entity === "vehicle_media" ? parsed.data.recordId : null,
        group_id: parsed.data.entity === "community_group" ? parsed.data.recordId : null,
        storage_reference: result.storageReference,
        expected_size: parsed.data.size,
        content_type: parsed.data.contentType,
      });
      if (reservationError) throw reservationError;
      // Plan 34.2 upload completion: reserved now, attached when the media
      // row claims the reservation. Keyed by the storage reference so a
      // retried request does not count twice.
      await recordProductEvent({
        profileId: profile.id,
        eventName: "media_upload_reserved",
        surface: parsed.data.entity === "vehicle_media" ? "garage" : "community",
        dedupeId: result.storageReference,
      });
      // Keep the response shape compatible with existing web/iOS uploaders.
      return NextResponse.json({
        uploadUrl: result.uploadUrl,
        publicUrl: result.storageReference,
        uploadHeaders: CREATE_ONLY_UPLOAD_HEADERS,
      });
    }

    if (["ppi_media", "media_package", "message_attachment", "vehicle_document"].includes(parsed.data.entity)) {
      const result = await generatePrivatePresignedUrl({
        key: buildStorageKey(keyParams),
        contentType: parsed.data.contentType,
        contentLength: parsed.data.size,
      });
      return NextResponse.json({
        uploadUrl: result.uploadUrl,
        publicUrl: result.storageReference,
        uploadHeaders: CREATE_ONLY_UPLOAD_HEADERS,
      });
    }

    return NextResponse.json({ error: "Unsupported upload destination" }, { status: 400 });
  } catch {
    return refuse(request, "Failed to generate upload URL", 500, { entity: parsed.data.entity, contentType: parsed.data.contentType, sizeBytes: parsed.data.size });
  }
}
