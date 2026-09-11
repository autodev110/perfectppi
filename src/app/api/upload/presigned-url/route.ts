import { NextResponse } from "next/server";
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
    "message_attachment",
  ]),
  recordId: z.string().uuid(),
});

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
    ...(parsed.data.entity === "media_package" || parsed.data.entity === "message_attachment"
      ? UPLOAD_LIMITS.allowedFileTypes
      : []),
  ];
  if (!(allowedTypes as string[]).includes(parsed.data.contentType)) {
    return NextResponse.json(
      { error: "File type not allowed" },
      { status: 400 }
    );
  }

  const isImage = (UPLOAD_LIMITS.allowedImageTypes as readonly string[]).includes(parsed.data.contentType);
  const isVideo = (UPLOAD_LIMITS.allowedVideoTypes as readonly string[]).includes(parsed.data.contentType);
  const refusal = await communityUploadRefusal(parsed.data.entity, isVideo, profile.id);
  if (refusal) return refusal;
  const maxBytes = isImage
    ? UPLOAD_LIMITS.maxImageSize
    : isVideo ? UPLOAD_LIMITS.maxVideoSize : UPLOAD_LIMITS.maxFileSize;
  if (parsed.data.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large. Max size is ${Math.floor(maxBytes / (1024 * 1024))}MB` },
      { status: 400 },
    );
  }

  const canUpload = await canUploadToTarget(
    supabase,
    profile.id,
    parsed.data.entity,
    parsed.data.recordId
  );
  if (!canUpload) {
    return NextResponse.json(
      { error: "Upload target not found" },
      { status: 404 }
    );
  }

  const keyParams = {
    entity: parsed.data.entity,
    ownerId: profile.id,
    recordId: parsed.data.recordId,
    filename: parsed.data.filename,
  };

  try {
    if (parsed.data.entity === "community_post" || parsed.data.entity === "vehicle_media") {
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
        storage_reference: result.storageReference,
        expected_size: parsed.data.size,
        content_type: parsed.data.contentType,
      });
      if (reservationError) throw reservationError;
      // Keep the response shape compatible with existing web/iOS uploaders.
      return NextResponse.json({ uploadUrl: result.uploadUrl, publicUrl: result.storageReference });
    }

    if (["ppi_media", "media_package", "message_attachment"].includes(parsed.data.entity)) {
      const result = await generatePrivatePresignedUrl({
        key: buildStorageKey(keyParams),
        contentType: parsed.data.contentType,
        contentLength: parsed.data.size,
      });
      return NextResponse.json({ uploadUrl: result.uploadUrl, publicUrl: result.storageReference });
    }

    return NextResponse.json({ error: "Unsupported upload destination" }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
