import assert from "node:assert/strict";
import { describe, test } from "node:test";

const {
  evaluateSocialLaunchReadiness,
  LAUNCH_REQUIRED_MODERATION_CAPABILITIES,
} = await import("../../src/features/moderation/launch-readiness-shared.ts");
const { MODERATION_CAPABILITIES } = await import("../../src/features/moderation/capability-codes.ts");

type LaunchReadinessInput = import("../../src/features/moderation/launch-readiness-shared.ts").LaunchReadinessInput;

function healthyInput(): LaunchReadinessInput {
  return {
    flagSource: "database",
    flags: {
      communityPhotoUploads: true,
      communityVideoUploads: false,
      reportAutoHide: true,
      specialistImageSafeguard: true,
    },
    scannerConfigured: true,
    workerCredentialsConfigured: true,
    moderationAlertWebhookConfigured: true,
    mediaStorage: { available: true, legacyPublicObjects: 0, unverifiedRetirements: 0 },
    moderationOperations: {
      available: true,
      casesOpen: 1,
      casesOverdue: 0,
      urgentUnacknowledged: 0,
      casesOver24hShare: 0,
      outboxDeadLettered: 0,
      outboxOldestPendingMinutes: 0,
    },
    moderatorCoverage: {
      available: true,
      counts: {
        queue_read: 2,
        reporter_identity_read: 1,
        content_decide: 2,
        account_enforce: 1,
        evidence_export: 1,
        legal_hold_review: 1,
      },
    },
    communityRetentionPolicyConfigured: true,
    storageCleanup: { available: true, pendingOrFailed: 0, failed: 0, oldestPendingMinutes: 0 },
    workerHealth: { available: true, issues: [] },
  };
}

describe("social launch readiness", () => {
  test("requires the complete moderation capability model", () => {
    assert.deepEqual([...LAUNCH_REQUIRED_MODERATION_CAPABILITIES], [...MODERATION_CAPABILITIES]);
  });

  test("clears every automated blocker for a healthy launch configuration", () => {
    const result = evaluateSocialLaunchReadiness(healthyInput());
    assert.equal(result.blockedCount, 0);
    assert.equal(result.warningCount, 0);
    assert.ok(result.readyCount > 0);
    assert.ok(result.manual.every((check) => check.status === "manual"));
  });

  test("blocks public photos when the specialist scanner is not configured", () => {
    const input = healthyInput();
    input.scannerConfigured = false;
    const result = evaluateSocialLaunchReadiness(input);
    const photo = result.automated.find((check) => check.id === "photo-safety");
    assert.equal(photo?.status, "blocked");
    assert.match(photo?.detail ?? "", /remain private/i);
  });

  test("allows the scanner to be absent while photo uploads are disabled", () => {
    const input = healthyInput();
    input.flags.communityPhotoUploads = false;
    input.scannerConfigured = false;
    const result = evaluateSocialLaunchReadiness(input);
    assert.equal(result.automated.find((check) => check.id === "photo-safety")?.status, "ready");
  });

  test("fails closed when operational status cannot be read", () => {
    const input = healthyInput();
    input.flagSource = "safe_defaults";
    input.mediaStorage.available = false;
    input.moderationOperations.available = false;
    input.moderatorCoverage.available = false;
    input.communityRetentionPolicyConfigured = null;
    input.storageCleanup.available = false;
    input.workerHealth.available = false;
    const failedClosed = evaluateSocialLaunchReadiness(input);
    assert.equal(failedClosed.blockedCount, 7);
  });

  test("blocks missing capabilities and unhealthy queues", () => {
    const input = healthyInput();
    input.moderatorCoverage.counts.evidence_export = 0;
    input.moderationOperations.outboxDeadLettered = 1;
    input.storageCleanup.failed = 1;
    input.storageCleanup.pendingOrFailed = 1;
    const result = evaluateSocialLaunchReadiness(input);
    assert.equal(result.automated.find((check) => check.id === "moderator-coverage")?.status, "blocked");
    assert.equal(result.automated.find((check) => check.id === "moderation-health")?.status, "blocked");
    assert.equal(result.automated.find((check) => check.id === "storage-cleanup")?.status, "blocked");
  });

  test("blocks a missing, stale, or failed worker heartbeat", () => {
    const input = healthyInput();
    input.workerHealth.issues = ["moderation_outbox most recently failed."];
    const result = evaluateSocialLaunchReadiness(input);
    assert.equal(result.automated.find((check) => check.id === "worker-heartbeats")?.status, "blocked");
  });
});
