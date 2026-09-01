import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type { ModerationEntityType, ModerationResult } from "./types";
import { statusForDecision } from "./types";

export { moderateImage, moderateText, moderateVideo } from "./policy";
export { moderationUserMessage, publicStatusForDecision, statusForDecision } from "./types";
export type { ModerationDecision, ModerationEntityType, ModerationResult, ModerationStatus } from "./types";

export async function recordModeration(input: {
  entityType: ModerationEntityType;
  entityId: string;
  authorId: string;
  contentPreview?: string | null;
  evidenceReference?: string | null;
  result: ModerationResult;
}) {
  const admin = createAdminClient();
  const status = statusForDecision(input.result.decision);
  const { data: item, error } = await admin
    .from("moderation_items")
    .upsert(
      {
        entity_type: input.entityType,
        entity_id: input.entityId,
        author_id: input.authorId,
        status,
        risk_level: input.result.riskLevel,
        decision: input.result.decision,
        reason_codes: input.result.reasonCodes,
        content_preview: input.contentPreview?.slice(0, 500) ?? null,
        evidence_reference: input.evidenceReference ?? null,
        model_provider: input.result.provider,
        model_name: input.result.modelName,
        model_version: input.result.modelVersion,
        raw_result: input.result.rawResult as Json,
        decided_at: input.result.decision === "allow" ? new Date().toISOString() : null,
      },
      { onConflict: "entity_type,entity_id" },
    )
    .select("id")
    .single();

  if (error || !item) throw new Error(error?.message ?? "Could not record moderation result");

  const eventType = input.result.decision === "allow"
    ? "auto_allowed"
    : input.result.decision === "legal_hold"
      ? "escalated"
      : input.result.decision === "block"
        ? "auto_blocked"
        : "escalated";

  const { error: eventError } = await admin.from("moderation_events").insert({
    moderation_item_id: item.id,
    actor_type: "system",
    event_type: eventType,
    previous_status: "pending_scan",
    next_status: status,
    metadata: { reasonCodes: input.result.reasonCodes },
  });
  if (eventError) throw new Error(`Could not record moderation event: ${eventError.message}`);

  return { itemId: item.id, status };
}

export async function getActivePostingRestriction(profileId: string, media = false) {
  const admin = createAdminClient();
  const actionTypes = media
    ? ["media_upload_hold", "temporary_posting_hold", "suspension", "ban"]
    : ["temporary_posting_hold", "suspension", "ban"];
  const now = new Date().toISOString();
  const { data } = await admin
    .from("user_enforcement_actions")
    .select("action_type, ends_at")
    .eq("profile_id", profileId)
    .in("action_type", actionTypes)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function isCommunityRateLimited(profileId: string, entity: "post" | "comment") {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const table = entity === "post" ? "community_posts" : "community_comments";
  const limit = entity === "post" ? 5 : 20;
  const { count } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("author_id", profileId)
    .gte("created_at", since);
  return (count ?? 0) >= limit;
}
