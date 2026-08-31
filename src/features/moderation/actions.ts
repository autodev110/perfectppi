"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildStorageKey,
  deleteStoredObject,
  isPrivateStorageReference,
  promoteQuarantinedObject,
} from "@/lib/storage/r2";

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

  let sourceUrl: string | null = null;
  let promotedUrl: string | null = null;
  if (item.entity_type === "community_post_media" && nextStatus === "active") {
    const { data: media, error: mediaError } = await admin
      .from("community_post_media")
      .select("url, post_id, content_type")
      .eq("id", item.entity_id)
      .single();
    if (mediaError) throw new Error(mediaError.message);
    if (isPrivateStorageReference(media.url)) {
      if (!item.author_id) throw new Error("Moderated media has no retained owner");
      sourceUrl = media.url;
      const ext = media.content_type.split("/").pop()?.replace("jpeg", "jpg") ?? "bin";
      const promoted = await promoteQuarantinedObject({
        storageReference: media.url,
        destinationKey: buildStorageKey({
          entity: "community_post",
          ownerId: item.author_id,
          recordId: media.post_id,
          filename: `${item.entity_id}.${ext}`,
        }),
      });
      promotedUrl = promoted.publicUrl;
    }
  }

  const { error: reviewError } = await admin.rpc("apply_moderation_review", {
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
