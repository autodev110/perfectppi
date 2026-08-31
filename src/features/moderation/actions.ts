"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildStorageKey, isPrivateStorageReference, promoteQuarantinedObject } from "@/lib/storage/r2";

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
  if (!parsed.success) return;

  const admin = createAdminClient();
  const table = parsed.data.entityType === "community_post" ? "community_posts" : "community_comments";
  const { data: entity } = await admin
    .from(table)
    .select("id, author_id, content, moderation_status")
    .eq("id", parsed.data.entityId)
    .maybeSingle();
  if (!entity || entity.author_id === profile.id) return;

  const { error } = await admin.from("moderation_reports").insert({
    reporter_id: profile.id,
    entity_type: parsed.data.entityType,
    entity_id: entity.id,
    reason_code: parsed.data.reasonCode,
    details: parsed.data.details ?? null,
  });
  if (error?.code === "23505") return;
  if (error) throw new Error(error.message);

  const { data: existing } = await admin
    .from("moderation_items")
    .select("id, status, report_count")
    .eq("entity_type", parsed.data.entityType)
    .eq("entity_id", entity.id)
    .maybeSingle();

  let itemId = existing?.id;
  if (existing) {
    await admin.from("moderation_items").update({
      status: existing.status === "legal_hold" ? "legal_hold" : "pending_review",
      decision: existing.status === "legal_hold" ? "legal_hold" : "review",
      risk_level: existing.status === "legal_hold" ? "critical" : "medium",
      report_count: existing.report_count + 1,
    }).eq("id", existing.id);
  } else {
    const { data: created } = await admin.from("moderation_items").insert({
      entity_type: parsed.data.entityType,
      entity_id: entity.id,
      author_id: entity.author_id,
      status: "pending_review",
      risk_level: "medium",
      decision: "review",
      reason_codes: [`user_report:${parsed.data.reasonCode}`],
      content_preview: entity.content.slice(0, 500),
      model_provider: "user_report",
      model_version: "perfectppi-moderation-v1",
      report_count: 1,
    }).select("id").single();
    itemId = created?.id;
  }

  if (itemId) {
    await admin.from("moderation_events").insert({
      moderation_item_id: itemId,
      actor_type: "user",
      actor_id: profile.id,
      event_type: "reported",
      previous_status: entity.moderation_status,
      next_status: "pending_review",
      metadata: { reasonCode: parsed.data.reasonCode },
    });
  }
  revalidatePath("/admin/moderation");
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

  await applyEntityDecision(item.entity_type, item.entity_id, item.author_id, nextStatus);
  await admin.from("moderation_items").update({
    status: nextStatus,
    decision: nextDecision,
    risk_level: nextStatus === "legal_hold" ? "critical" : nextStatus === "rejected" ? "high" : "none",
    decided_by: profile.id,
    decided_at: new Date().toISOString(),
  }).eq("id", item.id);

  const eventType = nextStatus === "active"
    ? "manual_approved"
    : nextStatus === "legal_hold" ? "legal_hold_applied" : "manual_rejected";
  await admin.from("moderation_events").insert({
    moderation_item_id: item.id,
    actor_type: "admin",
    actor_id: profile.id,
    event_type: eventType,
    previous_status: item.status,
    next_status: nextStatus,
    notes: parsed.data.notes ?? null,
  });

  const { data: pendingAppeals } = await admin
    .from("moderation_appeals")
    .update({
      status: nextStatus === "active" ? "approved" : "denied",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      resolution_notes: parsed.data.notes ?? null,
    })
    .eq("moderation_item_id", item.id)
    .eq("status", "pending")
    .select("id");

  if (pendingAppeals?.length) {
    await admin.from("moderation_events").insert({
      moderation_item_id: item.id,
      actor_type: "admin",
      actor_id: profile.id,
      event_type: "appeal_resolved",
      previous_status: item.status,
      next_status: nextStatus,
      notes: parsed.data.notes ?? null,
    });
  }

  if (parsed.data.enforcement !== "none") {
    await applyEnforcement({
      profileId: item.author_id,
      itemId: item.id,
      adminId: profile.id,
      enforcement: parsed.data.enforcement,
      reasonCode: item.reason_codes[0] ?? "community_guidelines",
    });
  }

  revalidateModerationPaths();
}

async function applyEntityDecision(entityType: string, entityId: string, authorId: string, status: string) {
  const admin = createAdminClient();
  const moderationUpdate = {
    moderation_status: status,
    moderation_checked_at: new Date().toISOString(),
    moderation_version: "perfectppi-moderation-v1",
  };

  if (entityType === "community_post") {
    await admin.from("community_posts").update({
      ...moderationUpdate,
      status: status === "active" ? "active" : "hidden",
    }).eq("id", entityId);
    return;
  }
  if (entityType === "community_comment") {
    await admin.from("community_comments").update({
      ...moderationUpdate,
      status: status === "active" ? "active" : "hidden",
    }).eq("id", entityId);
    return;
  }

  const { data: media } = await admin
    .from("community_post_media")
    .select("url, post_id, content_type")
    .eq("id", entityId)
    .single();
  if (!media) return;

  let url = media.url;
  if (status === "active" && isPrivateStorageReference(url)) {
    const ext = media.content_type.split("/").pop()?.replace("jpeg", "jpg") ?? "bin";
    const promoted = await promoteQuarantinedObject({
      storageReference: url,
      destinationKey: buildStorageKey({
        entity: "community_post",
        ownerId: authorId,
        recordId: media.post_id,
        filename: `${entityId}.${ext}`,
      }),
    });
    url = promoted.publicUrl;
  }
  await admin.from("community_post_media").update({ ...moderationUpdate, url }).eq("id", entityId);
  await admin.from("moderation_hashes").update({
    scan_status: status === "active" ? "approved" : status === "legal_hold" ? "legal_hold" : "rejected",
  }).eq("entity_id", entityId);
}

async function applyEnforcement(input: {
  profileId: string;
  itemId: string;
  adminId: string;
  enforcement: "warning" | "posting_hold" | "media_hold" | "suspension";
  reasonCode: string;
}) {
  const admin = createAdminClient();
  const actionType = input.enforcement === "posting_hold"
    ? "temporary_posting_hold"
    : input.enforcement === "media_hold" ? "media_upload_hold" : input.enforcement;
  const endsAt = input.enforcement === "warning"
    ? null
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await admin.from("user_enforcement_actions").insert({
    profile_id: input.profileId,
    action_type: actionType,
    reason_code: input.reasonCode,
    related_moderation_item_id: input.itemId,
    ends_at: endsAt,
    created_by: input.adminId,
  });
  await admin.from("moderation_events").insert({
    moderation_item_id: input.itemId,
    actor_type: "admin",
    actor_id: input.adminId,
    event_type: input.enforcement === "warning" ? "user_warned" : "posting_hold_applied",
    next_status: "rejected",
    metadata: { enforcement: input.enforcement, endsAt },
  });
}

export async function appealModerationItem(formData: FormData) {
  const profile = await currentProfile();
  if (!profile) redirect("/login?redirect=/dashboard/posts?tab=review");
  const entityId = String(formData.get("entity_id") ?? "");
  const statement = String(formData.get("statement") ?? "").trim();
  if (!z.string().uuid().safeParse(entityId).success || statement.length < 10 || statement.length > 1000) return;

  const admin = createAdminClient();
  const { data: item } = await admin.from("moderation_items")
    .select("id, author_id, status")
    .eq("entity_type", "community_post")
    .eq("entity_id", entityId)
    .eq("author_id", profile.id)
    .eq("status", "rejected")
    .maybeSingle();
  if (!item) return;

  const { error } = await admin.from("moderation_appeals").insert({
    moderation_item_id: item.id,
    appellant_id: profile.id,
    statement,
  });
  if (error?.code === "23505") return;
  if (error) throw new Error(error.message);
  await admin.from("moderation_events").insert({
    moderation_item_id: item.id,
    actor_type: "appeal",
    actor_id: profile.id,
    event_type: "appeal_opened",
    previous_status: item.status,
    next_status: "pending_review",
  });
  revalidateModerationPaths();
}

function revalidateModerationPaths() {
  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  revalidatePath("/admin/moderation");
}
