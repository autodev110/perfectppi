import type { Json } from "@/types/database";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
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
};

function metadata(value: Json): DeletionMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, Json | undefined>;
  return {
    profileId: typeof record.profileId === "string" ? record.profileId : undefined,
    storageReferences: Array.isArray(record.storageReferences)
      ? record.storageReferences.filter((item): item is string => typeof item === "string")
      : undefined,
  };
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
  if (!profileId || !request.auth_user_id) {
    throw new Error("Deletion request is missing its server-recorded account identity");
  }

  let storageReferences = stored.storageReferences ?? [];
  let accountDeletedAt = request.account_deleted_at;

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
        last_error: null,
        locked_at: null,
        lock_expires_at: null,
        locked_by: null,
      }).eq("id", request.id);
      return { status: "on_hold" as const, deletedObjects: 0 };
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(request.auth_user_id);
    if (userError && !isMissingAuthUser(userError.message)) throw userError;

    if (userData.user) {
      const exportData = await buildAccountDataExport(profileId, userData.user);
      storageReferences = [...collectStorageReferences(exportData)];
      const { error: metadataError } = await admin.from("privacy_requests").update({
        status: "in_progress",
        acknowledged_at: new Date().toISOString(),
        result_metadata: { profileId, storageReferences },
        last_error: null,
      }).eq("id", request.id);
      if (metadataError) throw new Error(metadataError.message);

      const { error: deleteError } = await admin.auth.admin.deleteUser(request.auth_user_id, false);
      if (deleteError && !isMissingAuthUser(deleteError.message)) throw deleteError;
    }

    accountDeletedAt = new Date().toISOString();
    const { error: minimizeError } = await admin.from("privacy_requests").update({
      auth_user_id: null,
      details: null,
    }).eq("auth_user_id", request.auth_user_id);
    if (minimizeError) throw new Error(minimizeError.message);

    const { error: checkpointError } = await admin.from("privacy_requests").update({
      account_deleted_at: accountDeletedAt,
      result_metadata: { profileId, storageReferences },
    }).eq("id", request.id);
    if (checkpointError) throw new Error(checkpointError.message);
  }

  const deletedObjects = await deleteOwnerStoredObjects(profileId, storageReferences);
  const completedAt = new Date().toISOString();
  const { error: completeError } = await admin.from("privacy_requests").update({
    status: "completed",
    completed_at: completedAt,
    last_error: null,
    resolution_summary: "Account, profile-owned application data, sessions, device registrations, share links, partner links, and managed media were deleted.",
    result_metadata: {
      storageObjectsDeleted: deletedObjects,
      storageCleanupCompletedAt: completedAt,
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
