import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getObjectFromStoredUrl,
  isR2Configured,
  isPrivateR2Configured,
  publicUrlStillResolves,
} from "@/lib/storage/r2";
import { deleteStoredObjectOrQueue } from "@/features/uploads/cleanup";
import { isLegacyPublicCommunityUrl, publishCommunityMedia } from "@/lib/storage/community-media";
import { UPLOAD_LIMITS } from "@/config/constants";

// Legacy public-URL retirement (plan 19.2). Every Community object that still
// has a permanent public URL is copied into the private immutable keyspace,
// its database reference is switched, the public copy is deleted, and the old
// URL is then probed from the outside until it no longer resolves. Each step
// is idempotent: a crash between steps is picked up by the next run.

export type MediaMigrationReport = {
  migrated: number;
  verified: number;
  stillPublic: number;
  failed: Array<{ mediaId: string; error: string }>;
  remainingLegacy: number;
  status: Record<string, number>;
};

async function storageStatus(): Promise<Record<string, number>> {
  const { data } = await createAdminClient().rpc("community_media_storage_status");
  return data && typeof data === "object" && !Array.isArray(data)
    ? Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Number(value ?? 0)]))
    : {};
}

/** Retires public objects whose database reference already moved. */
async function verifyRetirements(limit: number, report: MediaMigrationReport) {
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("community_post_media")
    .select("id, legacy_public_url")
    .not("legacy_public_url", "is", null)
    .is("storage_migrated_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  for (const row of pending ?? []) {
    if (!row.legacy_public_url) continue;
    try {
      if (await publicUrlStillResolves(row.legacy_public_url)) {
        // Delete (again) and re-check next run; a CDN may lag the bucket.
        await deleteStoredObjectOrQueue(row.legacy_public_url, "legacy_public_media_retired");
        report.stillPublic += 1;
        continue;
      }
      const { error } = await admin
        .from("community_post_media")
        .update({ storage_migrated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      report.verified += 1;
    } catch (error) {
      report.failed.push({ mediaId: row.id, error: error instanceof Error ? error.message : "verify failed" });
    }
  }
}

async function migrateOne(row: {
  id: string;
  post_id: string;
  uploader_id: string;
  url: string;
  media_type: "image" | "video";
  content_type: string;
  moderation_status: string;
}) {
  const admin = createAdminClient();
  const object = await getObjectFromStoredUrl(row.url, { maxBytes: UPLOAD_LIMITS.maxVideoSize });

  // Only content that is actually approved gets a display variant; pending,
  // rejected, and held media move to private storage as originals only, so
  // nothing that was not public becomes public through the migration.
  const published = await publishCommunityMedia({
    mediaId: row.id,
    postId: row.post_id,
    ownerId: row.uploader_id,
    mediaType: row.media_type,
    contentType: row.content_type,
    sourceReference: row.url,
    bytes: object.bytes,
    withDisplayVariant: row.moderation_status === "active",
  });

  const { error } = await admin
    .from("community_post_media")
    .update({
      url: published.storageReference,
      display_reference: published.displayReference,
      content_sha256: published.sha256,
      legacy_public_url: row.url,
    })
    .eq("id", row.id)
    .eq("url", row.url);
  if (error) throw new Error(error.message);

  // Evidence pointers that named the public URL now name the private object.
  await admin
    .from("moderation_items")
    .update({ evidence_reference: published.storageReference })
    .eq("entity_type", "community_post_media")
    .eq("entity_id", row.id)
    .eq("evidence_reference", row.url);

  await deleteStoredObjectOrQueue(row.url, "legacy_public_media_retired");
}

export async function migrateLegacyCommunityMedia(limit = 10): Promise<MediaMigrationReport> {
  const report: MediaMigrationReport = {
    migrated: 0, verified: 0, stillPublic: 0, failed: [], remainingLegacy: 0, status: {},
  };
  if (!isR2Configured() || !isPrivateR2Configured()) {
    report.status = await storageStatus();
    report.remainingLegacy = report.status.legacyPublicObjects ?? 0;
    report.failed.push({ mediaId: "*", error: "R2 public and private storage must both be configured" });
    return report;
  }

  await verifyRetirements(limit, report);

  const admin = createAdminClient();
  const { data: legacy } = await admin
    .from("community_post_media")
    .select("id, post_id, uploader_id, url, media_type, content_type, moderation_status")
    .like("url", "https://%")
    .order("created_at", { ascending: true })
    .limit(limit);

  for (const row of legacy ?? []) {
    if (!isLegacyPublicCommunityUrl(row.url)) continue;
    try {
      await migrateOne(row);
      report.migrated += 1;
    } catch (error) {
      report.failed.push({ mediaId: row.id, error: error instanceof Error ? error.message : "migration failed" });
    }
  }

  report.status = await storageStatus();
  report.remainingLegacy = report.status.legacyPublicObjects ?? 0;
  return report;
}
