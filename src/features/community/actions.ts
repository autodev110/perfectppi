"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { UPLOAD_LIMITS } from "@/config/constants";
import { communityUploadReferenceSchema } from "@/features/uploads/url";
import {
  getActivePostingRestriction,
  isCommunityRateLimited,
  moderateImage,
  moderateText,
  moderateVideo,
  moderationUserMessage,
  publicStatusForDecision,
  recordModeration,
  statusForDecision,
} from "@/lib/moderation";
import type { ModerationResult } from "@/lib/moderation";
import {
  buildStorageKey,
  deleteStoredObject,
  getObjectFromStoredUrl,
  promoteQuarantinedObject,
} from "@/lib/storage/r2";

const postSchema = z.object({
  content: z.string().trim().min(1, "Write something before posting").max(1200),
  vehicleId: z.string().uuid().optional().nullable(),
  listingId: z.string().uuid().optional().nullable(),
});

const MAX_POST_MEDIA = 10;

const postMediaSchema = z.object({
  postId: z.string().uuid(),
  items: z.array(z.object({
    url: communityUploadReferenceSchema,
    mediaType: z.enum(["image", "video"]),
    contentType: z.string().regex(/^(image|video)\//),
    sortOrder: z.number().int().min(0).max(MAX_POST_MEDIA - 1),
  })).min(1).max(MAX_POST_MEDIA).refine(
    (items) => new Set(items.map((item) => item.url)).size === items.length,
    "The same upload cannot be attached more than once",
  ),
});

const removePostMediaSchema = z.object({
  postId: z.string().uuid(),
  mediaId: z.string().uuid(),
});

const commentSchema = z.object({
  postId: z.string().uuid(),
  content: z.string().trim().min(1, "Write a comment first").max(600),
});

const statusSchema = z.enum(["active", "archived"]);

async function getCurrentProfileId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" as const };

  return { profileId: profile.id, role: profile.role };
}

function nullableUuid(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function createCommunityPost(formData: FormData) {
  return createCommunityPostFromInput({
    content: formData.get("content"),
    vehicleId: nullableUuid(formData.get("vehicle_id")),
    listingId: nullableUuid(formData.get("listing_id")),
  });
}

export async function createCommunityPostFromInput(input: unknown) {
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  const restriction = await getActivePostingRestriction(profile.profileId);
  if (restriction) {
    return { error: restriction.ends_at
      ? `Community posting is unavailable until ${new Date(restriction.ends_at).toLocaleString()}`
      : "Community posting is unavailable for this account" };
  }
  if (await isCommunityRateLimited(profile.profileId, "post")) {
    return { error: "You are posting too quickly. Please wait a few minutes and try again." };
  }

  const admin = createAdminClient();
  let vehicleId = parsed.data.vehicleId ?? null;
  const listingId = parsed.data.listingId ?? null;

  if (listingId) {
    const { data: listing } = await admin
      .from("marketplace_listings")
      .select("id, seller_id, vehicle_id, status")
      .eq("id", listingId)
      .single();

    if (!listing || listing.seller_id !== profile.profileId || listing.status !== "active") {
      return { error: "You can only share your own active listings" };
    }

    vehicleId = listing.vehicle_id;
  }

  if (vehicleId) {
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("id, owner_id, visibility")
      .eq("id", vehicleId)
      .single();

    if (!vehicle || vehicle.owner_id !== profile.profileId || vehicle.visibility !== "public") {
      return { error: "Only your public vehicles can be attached to community posts" };
    }
  }

  const { data, error } = await admin.from("community_posts").insert({
    author_id: profile.profileId,
    vehicle_id: vehicleId,
    marketplace_listing_id: listingId,
    content: parsed.data.content,
    status: "hidden",
    moderation_status: "pending_scan",
  }).select("id").single();

  if (error || !data) return { error: error?.message ?? "Could not create post" };

  const result = await moderateText(parsed.data.content);
  try {
    await recordModeration({
      entityType: "community_post",
      entityId: data.id,
      authorId: profile.profileId,
      contentPreview: parsed.data.content,
      result,
    });
    const { error: updateError } = await admin
      .from("community_posts")
      .update({
        status: publicStatusForDecision(result.decision),
        moderation_status: statusForDecision(result.decision),
        moderation_reason: result.reasonCodes[0] ?? null,
        moderation_checked_at: new Date().toISOString(),
        moderation_version: result.modelVersion,
      })
      .eq("id", data.id);
    if (updateError) throw updateError;
  } catch {
    // The row remains hidden/pending_scan if persistence fails.
    return { error: "Your post could not be checked yet. Please try again." };
  }

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  revalidatePath("/admin/moderation");

  return {
    data: {
      ...data,
      moderationStatus: statusForDecision(result.decision),
      moderationMessage: moderationUserMessage(result.decision),
    },
  };
}

export async function addCommunityPostMedia(input: unknown) {
  const parsed = postMediaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  if (await getActivePostingRestriction(profile.profileId, true)) {
    return { error: "Media uploads are unavailable for this account" };
  }

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .select("id, author_id")
    .eq("id", parsed.data.postId)
    .maybeSingle();

  if (!post || post.author_id !== profile.profileId) {
    return { error: "Post not found" };
  }

  const quarantinePrefix = `r2-private:///quarantine/community_post/${profile.profileId}/${post.id}/`;
  if (parsed.data.items.some((item) => !item.url.startsWith(quarantinePrefix))) {
    return { error: "Community upload does not belong to this post" };
  }

  const references = parsed.data.items.map((item) => item.url);
  const { data: reservations, error: reservationError } = await admin
    .from("community_upload_reservations")
    .select("id, storage_reference, expected_size, content_type")
    .eq("profile_id", profile.profileId)
    .eq("post_id", post.id)
    .eq("status", "issued")
    .gt("expires_at", new Date().toISOString())
    .in("storage_reference", references);
  if (reservationError) return { error: reservationError.message };
  const reservationsByReference = new Map(
    (reservations ?? []).map((reservation) => [reservation.storage_reference, reservation]),
  );
  if (reservationsByReference.size !== references.length || parsed.data.items.some((item) =>
    reservationsByReference.get(item.url)?.content_type !== item.contentType
  )) {
    return { error: "One or more uploads are missing, expired, or do not match the selected media" };
  }

  // Check the post-wide cap before claiming reservations. A rejected request
  // must not consume uploads that the user can still remove or retry.
  const { count, error: countError } = await admin
    .from("community_post_media")
    .select("id", { count: "exact", head: true })
    .eq("post_id", post.id);
  if (countError) return { error: "Could not verify the post media limit" };

  const existing = count ?? 0;
  if (existing + parsed.data.items.length > MAX_POST_MEDIA) {
    return { error: `Posts can include up to ${MAX_POST_MEDIA} photos or videos` };
  }

  const claimedReservationIds: string[] = [];
  for (const reservation of reservations ?? []) {
    const { data: claimed } = await admin
      .from("community_upload_reservations")
      .update({ status: "attached", attached_at: new Date().toISOString() })
      .eq("id", reservation.id)
      .eq("status", "issued")
      .select("id")
      .maybeSingle();
    if (!claimed) {
      if (claimedReservationIds.length) {
        await admin.from("community_upload_reservations")
          .update({ status: "issued", attached_at: null })
          .in("id", claimedReservationIds);
      }
      return { error: "An upload was already attached. Please select the file again." };
    }
    claimedReservationIds.push(claimed.id);
  }

  // `sort_order` is unique per post, so derive the slot server-side instead
  // of trusting client indexes, which would collide on a second call.
  const rows = [...parsed.data.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({
      post_id: post.id,
      uploader_id: profile.profileId,
      url: item.url,
      media_type: item.mediaType,
      content_type: item.contentType,
      sort_order: existing + index,
      moderation_status: "pending_scan",
    }));

  const { data, error } = await admin
    .from("community_post_media")
    .insert(rows)
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    await admin.from("community_upload_reservations")
      .update({ status: "issued", attached_at: null })
      .in("id", claimedReservationIds);
    return { error: error.message };
  }

  const scanned = [];
  for (const media of data ?? []) {
    let result: ModerationResult;
    let bytes: Uint8Array | null = null;
    let sha256: string | null = null;

    try {
      const reservation = reservationsByReference.get(media.url);
      if (!reservation) throw new Error("Upload reservation not found");
      const object = await getObjectFromStoredUrl(media.url, {
        expectedBytes: reservation.expected_size,
        maxBytes: UPLOAD_LIMITS.maxVideoSize,
      });
      bytes = object.bytes;
      sha256 = createHash("sha256").update(bytes).digest("hex");

      if (!hasExpectedMediaSignature(bytes, media.content_type)) {
        result = blockedMediaResult("invalid_media_signature");
      } else {
        const { data: duplicate } = await admin
          .from("moderation_hashes")
          .select("scan_status")
          .eq("sha256", sha256)
          .in("scan_status", ["rejected", "legal_hold"])
          .limit(1)
          .maybeSingle();

        result = duplicate
          ? duplicate.scan_status === "legal_hold"
            ? blockedMediaResult("legal_hold_duplicate", "legal_hold")
            : blockedMediaResult("blocked_duplicate")
          : media.media_type === "video"
            ? await moderateVideo(bytes, media.content_type)
            : await moderateImage(bytes, media.content_type);
      }

      await recordModeration({
        entityType: "community_post_media",
        entityId: media.id,
        authorId: profile.profileId,
        contentPreview: `${media.media_type} upload`,
        result,
        evidenceReference: result.decision === "legal_hold" ? media.url : null,
      });

      let storedUrl = media.url;
      if (result.decision === "allow") {
        const extension = extensionForContentType(media.content_type);
        const promoted = await promoteQuarantinedObject({
          storageReference: media.url,
          destinationKey: buildStorageKey({
            entity: "community_post",
            ownerId: profile.profileId,
            recordId: post.id,
            filename: `${media.id}.${extension}`,
          }),
        });
        storedUrl = promoted.publicUrl;
      }

      const moderationStatus = statusForDecision(result.decision);
      const { data: updated, error: updateError } = await admin
        .from("community_post_media")
        .update({
          url: storedUrl,
          moderation_status: moderationStatus,
          moderation_reason: result.reasonCodes[0] ?? null,
          moderation_checked_at: new Date().toISOString(),
          moderation_version: result.modelVersion,
        })
        .eq("id", media.id)
        .select("*")
        .single();
      if (updateError) {
        if (storedUrl !== media.url) await deleteOrQueue(storedUrl, "failed_media_promotion_commit");
        throw new Error(updateError.message);
      }
      if (storedUrl !== media.url) await deleteOrQueue(media.url, "promoted_quarantine_source");

      if (sha256 && bytes) {
        await admin.from("moderation_hashes").upsert({
          entity_type: "community_post_media",
          entity_id: media.id,
          sha256,
          mime_type: media.content_type,
          file_size: bytes.byteLength,
          scan_status: hashStatusForDecision(result.decision),
        }, { onConflict: "entity_type,entity_id" });
      }
      if (updated) scanned.push(updated);
    } catch (scanError) {
      const fallback = blockedMediaResult("media_scan_failed", "review");
      await recordModeration({
        entityType: "community_post_media",
        entityId: media.id,
        authorId: profile.profileId,
        contentPreview: `${media.media_type} upload`,
        result: fallback,
      }).catch(() => undefined);
      const { data: updated } = await admin
        .from("community_post_media")
        .update({
          moderation_status: "pending_review",
          moderation_reason: "media_scan_failed",
          moderation_checked_at: new Date().toISOString(),
          moderation_version: fallback.modelVersion,
        })
        .eq("id", media.id)
        .select("*")
        .single();
      if (updated) scanned.push(updated);
      console.error("community media moderation failed", scanError);
    }
  }

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  revalidatePath("/admin/moderation");
  return { data: scanned };
}

function hasExpectedMediaSignature(bytes: Uint8Array, contentType: string): boolean {
  if (bytes.byteLength < 12) return false;
  if (contentType === "image/jpeg" || contentType === "image/jpg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  if (["image/heic", "image/heif", "video/mp4", "video/quicktime"].includes(contentType)) {
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  }
  return false;
}

function extensionForContentType(contentType: string) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };
  return extensions[contentType] ?? "bin";
}

function blockedMediaResult(
  reason: string,
  decision: "block" | "review" | "legal_hold" = "block",
): ModerationResult {
  return {
    decision,
    riskLevel: decision === "legal_hold" ? "critical" : decision === "block" ? "high" : "medium",
    reasonCodes: [reason],
    provider: "native_rules",
    modelName: null,
    modelVersion: "perfectppi-moderation-v1",
    rawResult: { reason },
  };
}

function hashStatusForDecision(decision: ModerationResult["decision"]) {
  if (decision === "allow") return "approved";
  if (decision === "legal_hold") return "legal_hold";
  if (decision === "block") return "rejected";
  return "review";
}

export async function removeCommunityPostMedia(input: unknown) {
  const parsed = removePostMediaSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid media" };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .select("id, author_id")
    .eq("id", parsed.data.postId)
    .maybeSingle();

  if (!post || post.author_id !== profile.profileId) {
    return { error: "Post not found" };
  }

  const { data: media } = await admin
    .from("community_post_media")
    .select("id, url")
    .eq("id", parsed.data.mediaId)
    .eq("post_id", post.id)
    .maybeSingle();
  if (!media) return { error: "Media not found" };

  const { data: held } = await admin.from("moderation_items")
    .select("id")
    .eq("entity_type", "community_post_media")
    .eq("entity_id", media.id)
    .eq("status", "legal_hold")
    .maybeSingle();
  if (held) return { error: "This media is preserved for legal review and cannot be deleted" };

  const { data: deleted, error } = await admin
    .from("community_post_media")
    .delete()
    .eq("id", parsed.data.mediaId)
    .eq("post_id", post.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!deleted) return { error: "Media not found" };
  await deleteOrQueue(media.url, "community_media_deleted");

  // `sort_order` has to stay contiguous 0..n-1: it is unique per post and
  // capped at 9, so a gap would eventually push a later insert past the check
  // constraint. Compacting in ascending order can never collide — each row
  // only moves down into a slot an earlier step already vacated.
  const { data: remaining } = await admin
    .from("community_post_media")
    .select("id, sort_order")
    .eq("post_id", post.id)
    .order("sort_order", { ascending: true });

  for (const [index, item] of (remaining ?? []).entries()) {
    if (item.sort_order === index) continue;
    await admin
      .from("community_post_media")
      .update({ sort_order: index })
      .eq("id", item.id);
  }

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  return { data: { id: deleted.id } };
}

export async function createCommunityComment(formData: FormData) {
  const result = await createCommunityCommentFromInput({
    postId: formData.get("post_id"),
    content: formData.get("content"),
  });

  if ("error" in result && result.error === "Not authenticated") {
    redirect("/login?redirect=/community");
  }
}

export async function createCommunityCommentFromInput(input: unknown) {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid comment" };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  if (await getActivePostingRestriction(profile.profileId)) {
    return { error: "Community commenting is unavailable for this account" };
  }
  if (await isCommunityRateLimited(profile.profileId, "comment")) {
    return { error: "You are commenting too quickly. Please wait a few minutes and try again." };
  }

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .select("id, status, moderation_status")
    .eq("id", parsed.data.postId)
    .eq("status", "active")
    .maybeSingle();

  if (!post || post.moderation_status !== "active") return { error: "Post not found" };

  const { data, error } = await admin.from("community_comments").insert({
    post_id: post.id,
    author_id: profile.profileId,
    content: parsed.data.content,
    status: "hidden",
    moderation_status: "pending_scan",
  }).select("id").single();

  if (error) return { error: error.message };

  const moderation = await moderateText(parsed.data.content);
  try {
    await recordModeration({
      entityType: "community_comment",
      entityId: data.id,
      authorId: profile.profileId,
      contentPreview: parsed.data.content,
      result: moderation,
    });
    const { error: updateError } = await admin.from("community_comments").update({
      status: publicStatusForDecision(moderation.decision),
      moderation_status: statusForDecision(moderation.decision),
      moderation_reason: moderation.reasonCodes[0] ?? null,
      moderation_checked_at: new Date().toISOString(),
      moderation_version: moderation.modelVersion,
    }).eq("id", data.id);
    if (updateError) throw updateError;
  } catch {
    return { error: "Your comment could not be checked yet. Please try again." };
  }

  revalidatePath("/community");
  revalidatePath("/admin/community");
  revalidatePath("/admin/moderation");
  return {
    data: {
      ...data,
      moderationStatus: statusForDecision(moderation.decision),
      moderationMessage: moderationUserMessage(moderation.decision),
    },
  };
}

export async function archiveMyCommunityPost(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;

  await updateMyCommunityPostStatus(postId, "archived");
}

export async function restoreMyCommunityPost(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;

  await updateMyCommunityPostStatus(postId, "active");
}

export async function updateMyCommunityPostStatus(postId: string, status: "active" | "archived") {
  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  const admin = createAdminClient();
  if (status === "active") {
    const { data: post } = await admin
      .from("community_posts")
      .select("moderation_status")
      .eq("id", postId)
      .eq("author_id", profile.profileId)
      .maybeSingle();
    if (!post || post.moderation_status !== "active") {
      return { error: "This post must be approved before it can be restored" };
    }
  }

  const updates: { status: "active" | "archived"; updated_at?: string } = { status };
  if (status === "archived") updates.updated_at = new Date().toISOString();

  const { error } = await admin
    .from("community_posts")
    .update(updates)
    .eq("id", postId)
    .eq("author_id", profile.profileId);

  if (error) return { error: error.message };

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  return { success: true };
}

export async function deleteCommunityPost(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;

  await deleteCommunityPostById(postId);
}

export async function deleteCommunityPostById(postId: string) {
  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  const admin = createAdminClient();

  // Allow if admin or author
  const { data: post } = await admin
    .from("community_posts")
    .select("id, author_id")
    .eq("id", postId)
    .single();

  if (!post) return { error: "Post not found" };
  if (profile.role !== "admin" && post.author_id !== profile.profileId) {
    return { error: "Not authorized" };
  }

  const { data: media } = await admin.from("community_post_media")
    .select("id, url")
    .eq("post_id", postId);
  const { data: heldPost } = await admin.from("moderation_items")
    .select("id")
    .eq("entity_type", "community_post")
    .eq("entity_id", postId)
    .eq("status", "legal_hold")
    .maybeSingle();
  const mediaIds = (media ?? []).map((item) => item.id);
  const { data: heldMedia } = mediaIds.length
    ? await admin.from("moderation_items").select("id")
      .eq("entity_type", "community_post_media")
      .in("entity_id", mediaIds)
      .eq("status", "legal_hold")
      .limit(1)
      .maybeSingle()
    : { data: null };
  if (heldPost || heldMedia) {
    return { error: "This post contains evidence preserved for legal review and cannot be deleted" };
  }

  const { error } = await admin.from("community_posts").delete().eq("id", postId);
  if (error) return { error: error.message };
  await Promise.all((media ?? []).map((item) => deleteOrQueue(item.url, "community_post_deleted")));

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  return { success: true };
}

async function deleteOrQueue(storageReference: string, reason: string) {
  try {
    await deleteStoredObject(storageReference);
  } catch (error) {
    await createAdminClient().from("storage_cleanup_jobs").upsert({
      storage_reference: storageReference,
      reason,
      status: "pending",
      last_error: error instanceof Error ? error.message.slice(0, 1000) : "Storage deletion failed",
      next_attempt_at: new Date().toISOString(),
    }, { onConflict: "storage_reference" });
  }
}

export async function updateCommunityPostStatus(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const parsedStatus = statusSchema.safeParse(formData.get("status"));
  if (!postId || !parsedStatus.success) return;

  const profile = await getCurrentProfileId();
  if ("error" in profile || profile.role !== "admin") return;

  const admin = createAdminClient();
  if (parsedStatus.data === "active") {
    const { data: post } = await admin
      .from("community_posts")
      .select("moderation_status")
      .eq("id", postId)
      .maybeSingle();
    if (!post || post.moderation_status !== "active") return;
  }

  const updates: { status: "active" | "archived"; updated_at?: string } = { status: parsedStatus.data };
  if (parsedStatus.data === "archived") updates.updated_at = new Date().toISOString();

  await admin
    .from("community_posts")
    .update(updates)
    .eq("id", postId);

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
}
