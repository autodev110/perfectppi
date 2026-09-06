"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Json } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildStorageKey,
  deleteStoredObject,
  getObjectFromStoredUrl,
  isPrivateStorageReference,
  promoteQuarantinedObject,
} from "@/lib/storage/r2";
import { UPLOAD_LIMITS } from "@/config/constants";
import { extensionForContentType, moderateMediaBytes } from "@/lib/moderation/media-safety";
import { recordModeration } from "@/lib/moderation";

const reportSchema = z.object({
  entityType: z.enum(["community_post", "community_comment"]),
  entityId: z.string().uuid(),
  reasonCode: z.enum([
    "spam", "harassment", "hate", "violence", "sexual_content",
    "personal_information", "fraud", "illegal_content", "other",
  ]),
  details: z.string().trim().max(500).optional(),
});

async function currentProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return data;
}

export async function reportCommunityContent(formData: FormData) {
  const profile = await currentProfile();
  if (!profile) redirect("/login?redirect=/community");

  const parsed = reportSchema.safeParse({
    entityType: formData.get("entity_type"),
    entityId: formData.get("entity_id"),
    reasonCode: formData.get("reason_code"),
    details: String(formData.get("details") ?? "") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const admin = createAdminClient();
  const { error } = await admin.rpc("submit_moderation_report", {
    p_reporter_id: profile.id,
    p_entity_type: parsed.data.entityType,
    p_entity_id: parsed.data.entityId,
    p_reason_code: parsed.data.reasonCode,
    p_details: parsed.data.details ?? null,
  });
  if (error?.code === "23505") return { error: "You already reported this content" };
  if (error) return { error: error.message };
  revalidatePath("/admin/moderation");
  return { data: { submitted: true } };
}

export async function reportCommunityContentForm(formData: FormData): Promise<void> {
  await reportCommunityContent(formData);
}

const reviewSchema = z.object({
  itemId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "legal_hold"]),
  notes: z.string().trim().max(1000).optional(),
  enforcement: z.enum(["none", "warning", "posting_hold", "media_hold", "suspension"]).default("none"),
});

function hasCleanSpecialistScan(value: Json): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, Json | undefined>;
  const scan = record.specialistScan;
  if (!scan || typeof scan !== "object" || Array.isArray(scan)) return false;
  return (scan as Record<string, Json | undefined>).verdict === "clean";
}

function legacyContentType(url: string, mediaType: "image" | "video") {
  const pathname = url.toLowerCase().split("?")[0];
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".heic")) return "image/heic";
  if (pathname.endsWith(".heif")) return "image/heif";
  if (pathname.endsWith(".mov")) return "video/quicktime";
  if (pathname.endsWith(".mp4") || mediaType === "video") return "video/mp4";
  return "image/jpeg";
}

export async function reviewModerationItem(formData: FormData) {
  const profile = await currentProfile();
  if (!profile || profile.role !== "admin") return;
  const parsed = reviewSchema.safeParse({
    itemId: formData.get("item_id"),
    decision: formData.get("decision"),
    notes: String(formData.get("notes") ?? "") || undefined,
    enforcement: formData.get("enforcement") ?? "none",
  });
  if (!parsed.success) return;

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("moderation_items")
    .select("*")
    .eq("id", parsed.data.itemId)
    .single();
  if (!item) return;

  const nextStatus = parsed.data.decision === "approve"
    ? "active"
    : parsed.data.decision === "legal_hold" ? "legal_hold" : "rejected";
  const nextDecision = parsed.data.decision === "approve"
    ? "allow"
    : parsed.data.decision === "legal_hold" ? "legal_hold" : "block";

  const isMedia = item.entity_type === "community_post_media" || item.entity_type === "vehicle_media";
  let sourceUrl: string | null = null;
  let promotedUrl: string | null = null;
  if (isMedia && nextStatus === "active") {
    const mediaResult = item.entity_type === "vehicle_media"
      ? await admin.from("vehicle_media")
        .select("url, vehicle_id, media_type, content_type")
        .eq("id", item.entity_id)
        .single()
      : await admin.from("community_post_media")
        .select("url, post_id, media_type, content_type")
        .eq("id", item.entity_id)
        .single();
    if (mediaResult.error || !mediaResult.data) {
      throw new Error(mediaResult.error?.message ?? "Moderated media was not found");
    }
    const media = mediaResult.data;
    const contentType = media.content_type ?? legacyContentType(media.url, media.media_type);

    if (!hasCleanSpecialistScan(item.raw_result)) {
      const object = await getObjectFromStoredUrl(media.url, { maxBytes: UPLOAD_LIMITS.maxVideoSize });
      const scan = await moderateMediaBytes(object.bytes, contentType, media.media_type);
      if (!hasCleanSpecialistScan(scan.rawResult as Json)) {
        await recordModeration({
          entityType: item.entity_type as "community_post_media" | "vehicle_media",
          entityId: item.entity_id,
          authorId: item.author_id ?? profile.id,
          contentPreview: item.content_preview,
          evidenceReference: scan.decision === "legal_hold" ? media.url : item.evidence_reference,
          result: scan,
        });
        throw new Error("Media cannot be approved until the specialist safety scan passes");
      }

      // Preserve pending review until promotion and the review RPC both succeed.
      const { error: scanUpdateError } = await admin
        .from("moderation_items")
        .update({
          model_provider: scan.provider,
          model_name: scan.modelName,
          model_version: scan.modelVersion,
          raw_result: scan.rawResult as Json,
        })
        .eq("id", item.id);
      if (scanUpdateError) throw new Error(scanUpdateError.message);
    }

    if (isPrivateStorageReference(media.url)) {
      if (!item.author_id) throw new Error("Moderated media has no retained owner");
      sourceUrl = media.url;
      const promoted = await promoteQuarantinedObject({
        storageReference: media.url,
        destinationKey: buildStorageKey({
          entity: item.entity_type === "vehicle_media" ? "vehicle_media" : "community_post",
          ownerId: item.author_id,
          recordId: "vehicle_id" in media ? media.vehicle_id : media.post_id,
          filename: `${item.entity_id}.${extensionForContentType(contentType)}`,
        }),
      });
      promotedUrl = promoted.publicUrl;
    }
  }

  const reviewFunction = item.entity_type === "vehicle_media"
    ? "apply_vehicle_media_review"
    : "apply_moderation_review";
  const { error: reviewError } = await admin.rpc(reviewFunction, {
    p_item_id: item.id,
    p_reviewer_id: profile.id,
    p_next_status: nextStatus,
    p_next_decision: nextDecision,
    p_notes: parsed.data.notes ?? null,
    p_enforcement: parsed.data.enforcement,
    p_media_url: promotedUrl,
  });
  if (reviewError) {
    if (promotedUrl) await deleteStoredObject(promotedUrl).catch(() => undefined);
    throw new Error(reviewError.message);
  }
  if (sourceUrl) await deleteOrQueue(sourceUrl, "approved_media_promoted");

  revalidateModerationPaths();
}

export async function appealModerationItem(formData: FormData) {
  const profile = await currentProfile();
  if (!profile) redirect("/login?redirect=/dashboard/posts?tab=review");
  const entityId = String(formData.get("entity_id") ?? "");
  const statement = String(formData.get("statement") ?? "").trim();
  if (!z.string().uuid().safeParse(entityId).success || statement.length < 10 || statement.length > 1000) return;

  const admin = createAdminClient();
  const { data: item } = await admin.from("moderation_items")
    .select("id")
    .eq("entity_type", "community_post")
    .eq("entity_id", entityId)
    .eq("author_id", profile.id)
    .eq("status", "rejected")
    .maybeSingle();
  if (!item) return;
  const { error } = await admin.rpc("open_moderation_appeal", {
    p_item_id: item.id,
    p_appellant_id: profile.id,
    p_statement: statement,
  });
  if (error?.code === "23505") return;
  if (error) throw new Error(error.message);
  revalidateModerationPaths();
}

async function deleteOrQueue(storageReference: string, reason: string) {
  try {
    await deleteStoredObject(storageReference);
  } catch (error) {
    await createAdminClient().from("storage_cleanup_jobs").upsert({
      storage_reference: storageReference,
      reason,
      status: "pending",
      last_error: error instanceof Error ? error.message.slice(0, 1000) : "Storage deletion failed",
      next_attempt_at: new Date().toISOString(),
    }, { onConflict: "storage_reference" });
  }
}

function revalidateModerationPaths() {
  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  revalidatePath("/admin/moderation");
}
