import type { Json } from "@/types/database";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptAppleToken, readAppleSignInConfig, revokeAppleRefreshToken } from "@/lib/auth/apple";
import { buildAccountDataExport } from "@/lib/privacy/export";
import { privacyRecordExpiry } from "@/lib/privacy/identity";
import { isManagedUploadUrl } from "@/features/uploads/url";
import {
  deleteOwnerStoredObjects,
  isPrivateStorageReference,
} from "@/lib/storage/r2";

type DeletionMetadata = {
  profileId?: string;
  storageReferences?: string[];
  retainedReferences?: string[];
  appleRevocation?: AppleRevocationRecord;
};

function metadata(value: Json): DeletionMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, Json | undefined>;
  return {
    profileId: typeof record.profileId === "string" ? record.profileId : undefined,
    storageReferences: Array.isArray(record.storageReferences)
      ? record.storageReferences.filter((item): item is string => typeof item === "string")
      : undefined,
    retainedReferences: Array.isArray(record.retainedReferences)
      ? record.retainedReferences.filter((item): item is string => typeof item === "string")
      : undefined,
    appleRevocation: record.appleRevocation === "revoked" || record.appleRevocation === "already_invalid"
      || record.appleRevocation === "not_linked"
      ? record.appleRevocation
      : undefined,
  };
}

type AppleRevocationRecord = "revoked" | "already_invalid" | "not_linked";

async function revokeAppleTokenForProfile(profileId: string): Promise<AppleRevocationRecord> {
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("apple_sign_in_tokens")
    .select("refresh_token_ciphertext, revoke_outcome")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!link) return "not_linked";
  if (link.revoke_outcome === "revoked" || link.revoke_outcome === "already_invalid") return link.revoke_outcome;

  const config = readAppleSignInConfig();
  if (!config) {
    // Never delete the account (and cascade-delete our only copy of the
    // refresh token) before Apple revocation can run. This is retryable once
    // the deployment credentials are restored.
    await admin.from("apple_sign_in_tokens").update({
      revoke_attempted_at: new Date().toISOString(), revoke_outcome: "failed", last_error: "Apple sign-in not configured",
    }).eq("profile_id", profileId);
    throw new Error("Apple token revocation is not configured; deletion will retry");
  }

  try {
    const outcome = await revokeAppleRefreshToken(decryptAppleToken(link.refresh_token_ciphertext), config);
    await admin.from("apple_sign_in_tokens").update({
      revoke_attempted_at: new Date().toISOString(), revoke_outcome: outcome, last_error: null,
    }).eq("profile_id", profileId);
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : "revocation failed";
    await admin.from("apple_sign_in_tokens").update({
      revoke_attempted_at: new Date().toISOString(), revoke_outcome: "failed", last_error: message.slice(0, 1000),
    }).eq("profile_id", profileId);
    throw new Error(`Apple token revocation failed; deletion will retry: ${message}`);
  }
}

function collectStorageReferences(value: unknown, references = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (isPrivateStorageReference(value) || isManagedUploadUrl(value)) references.add(value);
    return references;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStorageReferences(item, references);
    return references;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStorageReferences(item, references);
  }
  return references;
}

function retryAt(attempts: number): string {
  const delayMinutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

function isMissingAuthUser(message: string) {
  return /user.*not found|not_found/i.test(message);
}

async function fulfillDeletion(request: {
  id: string;
  profile_id: string | null;
  auth_user_id: string | null;
  account_deleted_at: string | null;
  processing_attempts: number;
  result_metadata: Json;
}) {
  const admin = createAdminClient();
  const stored = metadata(request.result_metadata);
  const profileId = request.profile_id ?? stored.profileId;
  const authUserId = request.auth_user_id;
  if (!profileId || (!request.account_deleted_at && !authUserId)) {
    throw new Error("Deletion request is missing its server-recorded account identity");
  }

  let storageReferences = stored.storageReferences ?? [];
  // Objects a not-yet-purged moderation case still needs (plan 19.4). They
  // are resolved before the profile disappears (the case->author link is
  // severed by the cascade) and checkpointed with the request.
  let retainedReferences = stored.retainedReferences ?? [];
  let accountDeletedAt = request.account_deleted_at;
  let appleRevocation: AppleRevocationRecord = stored.appleRevocation ?? "not_linked";

  if (!accountDeletedAt) {
    const { count, error: holdError } = await admin
      .from("moderation_items")
      .select("id", { count: "exact", head: true })
      .eq("author_id", profileId)
      .eq("status", "legal_hold");
    if (holdError) throw new Error(holdError.message);
    if ((count ?? 0) > 0) {
      await admin.from("privacy_requests").update({
        status: "on_hold",
        acknowledged_at: new Date().toISOString(),
        resolution_summary: "Automated deletion is paused because restricted evidence is subject to a legal preservation hold.",
        next_attempt_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        last_error: null,
        locked_at: null,
        lock_expires_at: null,
        locked_by: null,
      }).eq("id", request.id);
      return { status: "on_hold" as const, deletedObjects: 0 };
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(authUserId!);
    if (userError && !isMissingAuthUser(userError.message)) throw userError;

    if (userData.user) {
      const exportData = await buildAccountDataExport(profileId, userData.user);
      storageReferences = [...collectStorageReferences(exportData)];
      const { data: retained, error: retainedError } = await admin.rpc(
        "retained_evidence_references_for_profile",
        { p_profile_id: profileId },
      );
      if (retainedError) throw new Error(retainedError.message);
      retainedReferences = retained ?? [];
      const { error: metadataError } = await admin.from("privacy_requests").update({
        status: "in_progress",
        acknowledged_at: new Date().toISOString(),
        result_metadata: { profileId, storageReferences, retainedReferences },
        last_error: null,
      }).eq("id", request.id);
      if (metadataError) throw new Error(metadataError.message);
    }

    // Minimize every related request before deleting the profile. Keep the
    // current row's Auth ID until its completion checkpoint is written so a
    // worker crash can safely retry the irreversible Auth deletion step.
    const { error: minimizeError } = await admin.from("privacy_requests").update({
      details: null,
    }).eq("profile_id", profileId);
    if (minimizeError) throw new Error(minimizeError.message);

    const { error: relatedIdentityError } = await admin.from("privacy_requests").update({
      auth_user_id: null,
    }).eq("auth_user_id", authUserId!).neq("id", request.id);
    if (relatedIdentityError) throw new Error(relatedIdentityError.message);

    // Sign in with Apple: revoke Apple's refresh token before the account
    // disappears (App Store 5.1.1(v)). A transient Apple failure throws so the
    // request retries; an already-invalid token counts as revoked.
    appleRevocation = await revokeAppleTokenForProfile(profileId);

    if (userData.user) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId!, false);
      if (deleteError && !isMissingAuthUser(deleteError.message)) throw deleteError;
    }

    accountDeletedAt = new Date().toISOString();
    const { error: checkpointError } = await admin.from("privacy_requests").update({
      account_deleted_at: accountDeletedAt,
      auth_user_id: null,
      details: null,
      result_metadata: { profileId, storageReferences, retainedReferences, appleRevocation },
    }).eq("id", request.id);
    if (checkpointError) throw new Error(checkpointError.message);
  }

  const deletedObjects = await deleteOwnerStoredObjects(profileId, storageReferences, retainedReferences);
  const completedAt = new Date().toISOString();
  const { error: completeError } = await admin.from("privacy_requests").update({
    status: "completed",
    completed_at: completedAt,
    last_error: null,
    resolution_summary: retainedReferences.length > 0
      ? `Account, profile-owned application data, sessions, device registrations, share links, partner links, and managed media were deleted. ${retainedReferences.length} media object(s) referenced by a retained moderation case remain restricted until that case's approved retention period ends.`
      : "Account, profile-owned application data, sessions, device registrations, share links, partner links, and managed media were deleted.",
    result_metadata: {
      storageObjectsDeleted: deletedObjects,
      storageCleanupCompletedAt: completedAt,
      retainedEvidenceObjects: retainedReferences.length,
      appleRevocation,
    },
    retention_expires_at: privacyRecordExpiry(),
    locked_at: null,
    lock_expires_at: null,
    locked_by: null,
  }).eq("id", request.id);
  if (completeError) throw new Error(completeError.message);

  return { status: "completed" as const, deletedObjects };
}

export async function runPrivacyFulfillment(limit = 10) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: requests, error } = await admin.rpc("claim_privacy_deletion_requests", {
    p_limit: limit,
    p_worker_id: `privacy-${randomUUID()}`,
  });
  if (error) throw new Error(error.message);

  let completed = 0;
  let onHold = 0;
  let failed = 0;
  let deletedObjects = 0;

  for (const request of requests ?? []) {
    try {
      const result = await fulfillDeletion(request);
      if (result.status === "completed") completed += 1;
      else onHold += 1;
      deletedObjects += result.deletedObjects;
    } catch (fulfillmentError) {
      failed += 1;
      const attempts = request.processing_attempts;
      await admin.from("privacy_requests").update({
        status: "in_progress",
        processing_attempts: attempts,
        next_attempt_at: retryAt(attempts),
        last_error: fulfillmentError instanceof Error
          ? fulfillmentError.message.slice(0, 2000)
          : "Unknown deletion error",
        locked_at: null,
        lock_expires_at: null,
        locked_by: null,
      }).eq("id", request.id);
      console.error("privacy deletion fulfillment failed", fulfillmentError);
    }
  }

  const { error: retentionError } = await admin
    .from("privacy_requests")
    .delete()
    .in("status", ["completed", "denied", "cancelled"])
    .not("retention_expires_at", "is", null)
    .lte("retention_expires_at", now);
  if (retentionError) throw new Error(retentionError.message);

  return {
    claimed: requests?.length ?? 0,
    completed,
    onHold,
    failed,
    deletedObjects,
  };
}
