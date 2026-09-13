import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { runStorageCleanup } from "@/features/uploads/cleanup";
import type { Json } from "@/types/database";

// Retention purge worker (plan 19.3). The database functions own every
// eligibility rule and re-check it under a row lock; this worker only finds
// candidates, invokes the purge, drains the object-cleanup queue, and reports.
// A candidate the function declines is reported with its reason, never
// silently counted as done.

export type RetentionPurgeReport = {
  cases: { purged: number; skipped: Record<string, number>; failed: Array<{ id: string; error: string }> };
  archivedPosts: { purged: number; skipped: Record<string, number>; failed: Array<{ id: string; error: string }> };
  vehicleHandoffAttemptsPurged: number;
  storage: unknown;
  status: Record<string, number>;
};

function outcome(value: Json | null): { outcome: string; reason?: string } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, Json | undefined>;
    return {
      outcome: typeof record.outcome === "string" ? record.outcome : "unknown",
      reason: typeof record.reason === "string" ? record.reason : undefined,
    };
  }
  return { outcome: "unknown" };
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export async function getRetentionStatus(): Promise<Record<string, number>> {
  const { data } = await createAdminClient().rpc("retention_purge_status");
  return data && typeof data === "object" && !Array.isArray(data)
    ? Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Number(value ?? 0)]))
    : {};
}

export async function runRetentionPurge(limits = { cases: 25, archivedPosts: 25 }): Promise<RetentionPurgeReport> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const report: RetentionPurgeReport = {
    cases: { purged: 0, skipped: {}, failed: [] },
    archivedPosts: { purged: 0, skipped: {}, failed: [] },
    vehicleHandoffAttemptsPurged: 0,
    storage: null,
    status: {},
  };

  const { data: cases } = await admin
    .from("moderation_cases")
    .select("id")
    .eq("state", "closed")
    .eq("legal_hold", false)
    .eq("disposition_state", "retained")
    .not("retention_expires_at", "is", null)
    .lte("retention_expires_at", now)
    .order("retention_expires_at", { ascending: true })
    .limit(limits.cases);

  for (const row of cases ?? []) {
    try {
      const { data, error } = await admin.rpc("purge_moderation_case", { p_case_id: row.id });
      if (error) throw new Error(error.message);
      const result = outcome(data);
      if (result.outcome === "purged") report.cases.purged += 1;
      else bump(report.cases.skipped, result.reason ?? result.outcome);
    } catch (error) {
      report.cases.failed.push({ id: row.id, error: error instanceof Error ? error.message : "purge failed" });
    }
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: posts } = await admin
    .from("community_posts")
    .select("id")
    .eq("status", "archived")
    .lte("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limits.archivedPosts);

  for (const row of posts ?? []) {
    try {
      const { data, error } = await admin.rpc("purge_archived_community_post", { p_post_id: row.id });
      if (error) throw new Error(error.message);
      const result = outcome(data);
      if (result.outcome === "purged") report.archivedPosts.purged += 1;
      else bump(report.archivedPosts.skipped, result.reason ?? result.outcome);
    } catch (error) {
      report.archivedPosts.failed.push({ id: row.id, error: error instanceof Error ? error.message : "purge failed" });
    }
  }

  const { count: handoffAttemptCount, error: handoffAttemptError } = await admin
    .from("vehicle_handoff_claim_attempts")
    .delete({ count: "exact" })
    .lt("attempted_at", cutoff);
  if (handoffAttemptError) throw new Error(handoffAttemptError.message);
  report.vehicleHandoffAttemptsPurged = handoffAttemptCount ?? 0;

  // Queued object deletions are processed by the existing retrying cleanup.
  try {
    report.storage = await runStorageCleanup();
  } catch (error) {
    report.storage = { error: error instanceof Error ? error.message : "storage cleanup failed" };
  }
  report.status = await getRetentionStatus();
  return report;
}
