import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const PRODUCT_EVENT_NAMES = [
  "profile_completed",
  "garage_vehicle_added",
  "garage_vehicle_updated",
  "report_viewed",
  "listing_viewed",
  "listing_saved",
  "seller_message_started",
  "inspection_requested",
  "inspection_completed",
  "group_joined",
  "community_post_published",
  "question_published",
  "build_update_published",
  "maintenance_update_published",
  "answer_accepted",
  // Renditions-doc KPIs: search, network activation, invite conversion,
  // vehicle-profile accuracy, custom-build adoption.
  "search_performed",
  "contact_match_found",
  "invite_shared",
  "signup_from_invite",
  "factory_spec_recorded",
  "factory_conflict_refused",
  "custom_build_declared",
  "build_stage_created",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];
export type ProductEventSurface = "profile" | "garage" | "inspection" | "community" | "marketplace";

/**
 * Best-effort first-party measurement. Entity references are one-way hashed
 * before storage and no user content or arbitrary properties are accepted.
 */
export async function recordProductEvent(input: {
  profileId: string;
  eventName: ProductEventName;
  surface: ProductEventSurface;
  dedupeId?: string;
}) {
  const dedupeHash = input.dedupeId
    ? createHash("sha256").update(`${input.eventName}:${input.dedupeId}`).digest("hex")
    : null;
  const { error } = await createAdminClient().rpc("record_product_analytics_event", {
    p_profile_id: input.profileId,
    p_event_name: input.eventName,
    p_surface: input.surface,
    p_dedupe_hash: dedupeHash,
  });
  if (error) {
    console.error("product analytics event failed", { eventName: input.eventName, code: error.code });
  }
}

export async function pruneProductAnalyticsEvents() {
  const { data, error } = await createAdminClient().rpc("prune_product_analytics_events");
  if (error) throw new Error(`product_analytics_prune_${error.code ?? "failed"}`);
  return { deleted: Number(data ?? 0) };
}
