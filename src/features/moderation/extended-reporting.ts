import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const EXTENDED_REPORT_ENTITY_TYPES = [
  "profile", "group", "listing", "review", "message", "media",
] as const;

export type ExtendedReportEntityType = (typeof EXTENDED_REPORT_ENTITY_TYPES)[number];

export async function unavailableEntityIds(
  reporterId: string | null,
  entityType: ExtendedReportEntityType,
  entityIds: string[],
) {
  if (entityIds.length === 0) return new Set<string>();
  const ids = [...new Set(entityIds)];
  const admin = createAdminClient();
  const [moderated, reporterHidden] = await Promise.all([
    admin
      .from("moderation_items")
      .select("entity_id")
      .eq("entity_type", entityType)
      .in("status", ["rejected", "legal_hold"])
      .in("entity_id", ids),
    reporterId
      ? admin
          .from("moderation_reporter_hidden_entities")
          .select("entity_id")
          .eq("reporter_id", reporterId)
          .eq("entity_type", entityType)
          .in("entity_id", ids)
      : Promise.resolve({ data: [] as Array<{ entity_id: string }>, error: null }),
  ]);
  if (moderated.error) {
    console.error("moderated entity lookup failed", { entityType, code: moderated.error.code });
    return new Set(ids);
  }
  if (reporterHidden.error) {
    console.error("reporter-hidden entity lookup failed", { entityType, code: reporterHidden.error.code });
    // During a staged deploy the table can briefly be absent. Global
    // moderation still applies; every other failure is fail-closed.
    if (reporterHidden.error.code !== "42P01") return new Set(ids);
  }
  return new Set([
    ...(moderated.data ?? []).map((row) => row.entity_id),
    ...(reporterHidden.data ?? []).map((row) => row.entity_id),
  ]);
}
