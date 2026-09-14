import { NextResponse } from "next/server";
import { browserFamily, logUploadEvent } from "@/features/uploads/diagnostics";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildQuarantineKey,
  buildStorageKey,
  deleteStoredObject,
  uploadPrivateObject,
} from "@/lib/storage/r2";
import { z } from "zod";
import { UPLOAD_LIMITS } from "@/config/constants";
import { canUploadToTarget } from "@/features/uploads/access";
import { communityUploadRefusal } from "@/features/uploads/community-policy";

const uploadSchema = z.object({
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


// Refusals are logged with metadata only (Renditions doc: diagnostics), so a
// device- or browser-specific failure pattern is visible in the log stream.
function refuse(request: Request, reason: string, status: number, meta: { entity?: string; contentType?: string; sizeBytes?: number }, body: Record<string, unknown> = { error: reason }) {
  logUploadEvent({ source: "server", stage: "direct", outcome: "refused", status, reason, entity: meta.entity ?? "unknown", contentType: meta.contentType, sizeBytes: meta.sizeBytes, browser: browserFamily(request.headers.get("user-agent")) });
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

  const formData = await request.formData();
  const file = formData.get("file");
  const entity = formData.get("entity");
  const recordId = formData.get("recordId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size < 1) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse({
    entity: typeof entity === "string" ? entity : "",
    recordId: typeof recordId === "string" ? recordId : "",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const allowedImageTypes = [...UPLOAD_LIMITS.allowedImageTypes] as string[];
  const allowedVideoTypes = [...UPLOAD_LIMITS.allowedVideoTypes] as string[];
  const allowedFileTypes =
    parsed.data.entity === "media_package" || parsed.data.entity === "message_attachment" || parsed.data.entity === "vehicle_document"
      ? ([...UPLOAD_LIMITS.allowedFileTypes] as string[])
      : [];
  const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes, ...allowedFileTypes];

  if (!allowedTypes.includes(file.type)) {
    return refuse(request, "File type not allowed", 400, { entity: parsed.data.entity, contentType: file.type, sizeBytes: file.size });
  }

  const isImage = allowedImageTypes.includes(file.type);
  const isVideo = allowedVideoTypes.includes(file.type);
  const refusal = await communityUploadRefusal(parsed.data.entity, isVideo, profile.id);
  if (refusal) return refusal;
  const maxBytes = isImage
    ? UPLOAD_LIMITS.maxImageSize
    : isVideo
      ? UPLOAD_LIMITS.maxVideoSize
      : UPLOAD_LIMITS.maxFileSize;

  if (file.size > maxBytes) {
    return refuse(request, `File too large. Max size is ${Math.floor(maxBytes / (1024 * 1024))}MB`, 400, { entity: parsed.data.entity, contentType: file.type, sizeBytes: file.size });
  }

  const canUpload = await canUploadToTarget(
    supabase,
    profile.id,
    parsed.data.entity,
    parsed.data.recordId
  );
  if (!canUpload) {
    return refuse(request, "Upload target not found", 404, { entity: parsed.data.entity, contentType: file.type, sizeBytes: file.size });
  }

  const keyParams = {
    entity: parsed.data.entity,
    ownerId: profile.id,
    recordId: parsed.data.recordId,
    filename: file.name,
  };

  try {
    const arrayBuffer = await file.arrayBuffer();
    if (QUARANTINED.has(parsed.data.entity)) {
      const { storageReference } = await uploadPrivateObject({
        key: buildQuarantineKey(keyParams),
        body: Buffer.from(arrayBuffer),
        contentType: file.type,
      });
      const { error: reservationError } = await createAdminClient()
        .from("community_upload_reservations")
        .insert({
          profile_id: profile.id,
          post_id: parsed.data.entity === "community_post" ? parsed.data.recordId : null,
          vehicle_id: parsed.data.entity === "vehicle_media" ? parsed.data.recordId : null,
          group_id: parsed.data.entity === "community_group" ? parsed.data.recordId : null,
          storage_reference: storageReference,
          expected_size: file.size,
          content_type: file.type,
        });
      if (reservationError) {
        try {
          await deleteStoredObject(storageReference);
        } catch (cleanupError) {
          await createAdminClient().from("storage_cleanup_jobs").upsert({
            storage_reference: storageReference,
            reason: "failed_direct_upload_reservation",
            status: "pending",
            last_error: cleanupError instanceof Error
              ? cleanupError.message.slice(0, 1000)
              : "Storage deletion failed",
          }, { onConflict: "storage_reference" });
        }
        throw reservationError;
      }
      return NextResponse.json({ publicUrl: storageReference }, { status: 201 });
    }
    if (["ppi_media", "media_package", "message_attachment", "vehicle_document"].includes(parsed.data.entity)) {
      const { storageReference } = await uploadPrivateObject({
        key: buildStorageKey(keyParams),
        body: Buffer.from(arrayBuffer),
        contentType: file.type,
      });
      return NextResponse.json({ publicUrl: storageReference }, { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported upload destination" }, { status: 400 });
  } catch {
    return refuse(request, "Failed to upload file", 500, { entity: parsed.data.entity, contentType: file.type, sizeBytes: file.size });
  }
}
