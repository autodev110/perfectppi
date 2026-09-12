import "server-only";

import { getFeatureFlags } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODERATION_CAPABILITIES, type ModerationCapability } from "./capability-codes";
import type { OperationalWorkerCode } from "@/features/operations/worker-runs";
import {
  evaluateSocialLaunchReadiness,
  type LaunchReadinessEvaluation,
} from "./launch-readiness-shared";

export type SocialLaunchReadiness = LaunchReadinessEvaluation & {
  environment: string;
  generatedAt: string;
};

function numericRecord(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, Number(entry ?? 0)]));
}

function hasSecureEndpoint(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const REQUIRED_SOCIAL_WORKERS: ReadonlyArray<{
  code: OperationalWorkerCode;
  maxAgeMinutes: number;
}> = [
  { code: "moderation_outbox", maxAgeMinutes: 15 },
  { code: "storage_cleanup", maxAgeMinutes: 45 },
  { code: "community_media_migration", maxAgeMinutes: 45 },
  { code: "retention_purge", maxAgeMinutes: 36 * 60 },
];

export async function getSocialLaunchReadiness(): Promise<SocialLaunchReadiness> {
  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const workerRunsPromise = Promise.all(REQUIRED_SOCIAL_WORKERS.map(async (requirement) => ({
    requirement,
    result: await admin.from("operational_worker_runs")
      .select("worker_code, status, started_at")
      .eq("worker_code", requirement.code)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  })));
  const [flags, mediaResult, operationsResult, grantsResult, policyResult, cleanupResult, failedCleanupResult, workerRunResults] = await Promise.all([
    getFeatureFlags({ fresh: true }),
    admin.rpc("community_media_storage_status"),
    admin.rpc("moderation_operations_status"),
    admin.from("moderation_role_grants").select("profile_id, capability").is("revoked_at", null),
    admin.from("moderation_retention_policies").select("basis").eq("basis", "community_safety").maybeSingle(),
    admin.from("storage_cleanup_jobs")
      .select("created_at", { count: "exact" })
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(1),
    admin.from("storage_cleanup_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    workerRunsPromise,
  ]);

  const grants = grantsResult.error ? [] : grantsResult.data ?? [];
  const profileIds = [...new Set(grants.map((grant) => grant.profile_id))];
  const [profilesResult, enforcementResult] = profileIds.length > 0
    ? await Promise.all([
      admin.from("profiles").select("id, role, username_state").in("id", profileIds),
      admin.from("user_enforcement_actions")
        .select("profile_id")
        .in("profile_id", profileIds)
        .in("action_type", ["suspension", "ban"])
        .lte("starts_at", nowIso)
        .or(`ends_at.is.null,ends_at.gt.${nowIso}`),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const coverageAvailable = !grantsResult.error && !profilesResult.error && !enforcementResult.error;
  const unavailableProfiles = new Set((enforcementResult.data ?? []).map((action) => action.profile_id));
  const eligibleProfiles = new Set((profilesResult.data ?? [])
    .filter((profile) => profile.role === "admin" && profile.username_state === "claimed" && !unavailableProfiles.has(profile.id))
    .map((profile) => profile.id));
  const coverage = Object.fromEntries(MODERATION_CAPABILITIES.map((capability) => [capability, 0])) as Record<ModerationCapability, number>;
  if (coverageAvailable) {
    const holders = new Map<ModerationCapability, Set<string>>();
    for (const grant of grants) {
      if (!(MODERATION_CAPABILITIES as readonly string[]).includes(grant.capability) || !eligibleProfiles.has(grant.profile_id)) continue;
      const capability = grant.capability as ModerationCapability;
      const profiles = holders.get(capability) ?? new Set<string>();
      profiles.add(grant.profile_id);
      holders.set(capability, profiles);
    }
    for (const capability of MODERATION_CAPABILITIES) coverage[capability] = holders.get(capability)?.size ?? 0;
  }

  const media = mediaResult.error ? null : numericRecord(mediaResult.data);
  const operations = operationsResult.error ? null : numericRecord(operationsResult.data);
  const oldestCleanup = cleanupResult.data?.[0]?.created_at;
  const oldestPendingMinutes = oldestCleanup
    ? Math.max(0, Math.floor((now.getTime() - new Date(oldestCleanup).getTime()) / 60_000))
    : 0;
  const workerIssues: string[] = [];
  const workerRunsAvailable = workerRunResults.every(({ result }) => !result.error);
  if (workerRunsAvailable) {
    for (const { requirement, result } of workerRunResults) {
      const latest = result.data;
      if (!latest) {
        workerIssues.push(`${requirement.code} has no recorded run.`);
        continue;
      }
      const ageMinutes = Math.max(0, Math.floor((now.getTime() - new Date(latest.started_at).getTime()) / 60_000));
      if (latest.status === "failed") {
        workerIssues.push(`${requirement.code} most recently failed.`);
      } else if (latest.status === "running" && ageMinutes > requirement.maxAgeMinutes) {
        workerIssues.push(`${requirement.code} has been running for ${ageMinutes} minutes.`);
      } else if (latest.status === "succeeded" && ageMinutes > requirement.maxAgeMinutes) {
        workerIssues.push(`${requirement.code} last succeeded ${ageMinutes} minutes ago.`);
      }
    }
  }

  const evaluated = evaluateSocialLaunchReadiness({
    flagSource: flags.source,
    flags: {
      communityPhotoUploads: flags.flags.community_photo_uploads,
      communityVideoUploads: flags.flags.community_video_uploads,
      reportAutoHide: flags.flags.report_auto_hide,
      specialistImageSafeguard: flags.flags.specialist_image_safeguard,
    },
    scannerConfigured: hasSecureEndpoint(process.env.CHILD_SAFETY_SCANNER_URL)
      && Boolean(process.env.CHILD_SAFETY_SCANNER_TOKEN?.trim()),
    // Vercel Cron authenticates with CRON_SECRET. WORKER_SECRET alone only
    // enables manual calls and cannot keep scheduled queues moving.
    workerCredentialsConfigured: Boolean(process.env.CRON_SECRET?.trim()),
    moderationAlertWebhookConfigured: hasSecureEndpoint(process.env.MODERATION_ALERT_WEBHOOK_URL),
    mediaStorage: {
      available: media !== null,
      legacyPublicObjects: media?.legacyPublicObjects ?? 0,
      unverifiedRetirements: media?.unverifiedRetirements ?? 0,
    },
    moderationOperations: {
      available: operations !== null,
      casesOpen: operations?.casesOpen ?? 0,
      casesOverdue: operations?.casesOverdue ?? 0,
      urgentUnacknowledged: operations?.urgentUnacknowledged ?? 0,
      casesOver24hShare: operations?.casesOver24hShare ?? 0,
      outboxDeadLettered: operations?.outboxDeadLettered ?? 0,
      outboxOldestPendingMinutes: operations?.outboxOldestPendingMinutes ?? 0,
    },
    moderatorCoverage: { available: coverageAvailable, counts: coverage },
    communityRetentionPolicyConfigured: policyResult.error ? null : policyResult.data !== null,
    storageCleanup: {
      available: !cleanupResult.error && !failedCleanupResult.error,
      pendingOrFailed: cleanupResult.count ?? 0,
      failed: failedCleanupResult.count ?? 0,
      oldestPendingMinutes,
    },
    workerHealth: {
      available: workerRunsAvailable,
      issues: workerIssues,
    },
  });

  return {
    ...evaluated,
    environment: flags.environment,
    generatedAt: nowIso,
  };
}
