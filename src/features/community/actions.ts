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
  getCommunityRateLimit,
  moderateImage,
  moderateImageLaunchMode,
  moderateText,
  moderateVideo,
  moderationUserMessage,
  publicStatusForDecision,
  recordModeration,
  statusForDecision,
} from "@/lib/moderation";
import type { ModerationResult, ModerationStatus } from "@/lib/moderation";
import {
  blockedMediaResult,
  hasExpectedMediaSignature,
} from "@/lib/moderation/media-safety";
import {
  deleteStoredObject,
  getObjectFromStoredUrl,
} from "@/lib/storage/r2";
import { communityMediaDeliveryPath, publishCommunityMedia } from "@/lib/storage/community-media";
import {
  LAUNCH_POLICY_VERSION,
  PUBLICATION_OUTCOME_MESSAGES,
  evaluateDuplicates,
  evaluateTextForPublication,
  type PublicationOutcome,
} from "@/lib/moderation/launch-policy";
import { communityRateLimitMessage } from "@/lib/moderation/rate-limit";
import { friendlyDatabaseError } from "@/lib/moderation/friendly-errors";
import { FEATURE_UNAVAILABLE_MESSAGE, getFeatureFlags } from "@/lib/feature-flags";
import { notificationLink, pushAllowed } from "@/features/notifications/preferences";
import { pushToProfile } from "@/lib/push/dispatch";

const postSchema = z.object({
  content: z.string().trim().min(1, "Write something before posting").max(1200),
  postType: z.enum(["general", "question"]).default("general"),
  audience: z.enum(["public", "friends"]).optional(),
  vehicleId: z.string().uuid().optional().nullable(),
  listingId: z.string().uuid().optional().nullable(),
  groupId: z.string().uuid().optional().nullable(),
  expectedMediaCount: z.coerce.number().int().min(0).max(10).default(0),
  creationToken: z.string().uuid().optional().nullable(),
}).superRefine((value, context) => {
  if (value.expectedMediaCount > 0 && !value.creationToken) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["creationToken"], message: "Post retry token is required" });
  }
});

const MAX_POST_MEDIA = 10;

const postMediaSchema = z.object({
  postId: z.string().uuid(),
  creationToken: z.string().uuid().optional().nullable(),
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
    .select("id, role, is_public, default_post_audience, username_state")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" as const };
  // Server actions are reachable without the page guard, so a pending
  // (username-less) account must be refused here, not only by requireRole.
  if (profile.username_state !== "claimed") {
    return { error: "Choose a username before continuing" as const };
  }

  return {
    profileId: profile.id,
    role: profile.role,
    is_public: profile.is_public,
    default_post_audience: profile.default_post_audience,
  };
}

function nullableUuid(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

// Stable outcome + recovery copy (plan 21.1). Clients branch on `code`; the
// message is display-only and never carries the private rule that matched.
export type CommunityActionResult<T> =
  | { data: T; error?: undefined; code?: undefined }
  | {
      data?: undefined;
      error: string;
      code?: PublicationOutcome;
      retryAfterSeconds?: number;
    };

export type CommunityPublishData = {
  id: string;
  moderationStatus: ModerationStatus;
  moderationMessage: string | null;
};

export type CommunityFinalizeData = CommunityPublishData & { published: boolean };
export type CommunityLikeData = { postId: string; liked: boolean; likeCount: number };
export type CommunitySaveData = { postId: string; saved: boolean };

function rejected(
  code: PublicationOutcome,
  message?: string,
  retryAfterSeconds?: number,
): CommunityActionResult<never> {
  return {
    error: message ?? PUBLICATION_OUTCOME_MESSAGES[code],
    code,
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
  };
}

// Launch mode records the deterministic allow decision for audit without any
// provider dependency (plan 6.2 / 21.1).
function launchAllowResult(details: Record<string, unknown>): ModerationResult {
  return {
    decision: "allow",
    riskLevel: "none",
    reasonCodes: ["launch_autopublish"],
    provider: "launch_policy",
    modelName: null,
    modelVersion: LAUNCH_POLICY_VERSION,
    rawResult: { policyVersion: LAUNCH_POLICY_VERSION, ...details },
  };
}

async function recentAuthorContent(
  table: "community_posts" | "community_comments",
  authorId: string,
  windowMs: number,
) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data } = await createAdminClient()
    .from(table)
    .select("content, created_at")
    .eq("author_id", authorId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(25);
  return data ?? [];
}

export async function createCommunityPost(formData: FormData) {
  return createCommunityPostFromInput({
    content: formData.get("content"),
    postType: formData.get("post_type") || "general",
    audience: formData.get("audience") || undefined,
    vehicleId: nullableUuid(formData.get("vehicle_id")),
    listingId: nullableUuid(formData.get("listing_id")),
    groupId: nullableUuid(formData.get("group_id")),
    expectedMediaCount: formData.get("expected_media_count") || 0,
    creationToken: nullableUuid(formData.get("creation_token")),
  });
}

export async function createCommunityPostFromInput(
  input: unknown,
): Promise<CommunityActionResult<CommunityPublishData>> {
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return rejected("validation_failed", parsed.error.errors[0].message);

  const profile = await getCurrentProfileId();
  if (profile.error !== undefined) return { error: profile.error };

  // Server-authoritative kill switch (plan 20.3 / 30.2); old clients get the
  // same answer as new ones.
  const flags = await getFeatureFlags();
  if (!flags.flags.community_text_posts) {
    return rejected("posting_unavailable", FEATURE_UNAVAILABLE_MESSAGE.community_text_posts);
  }

  const restriction = await getActivePostingRestriction(profile.profileId);
  if (restriction) {
    return rejected("posting_restricted", restriction.ends_at
      ? `Community posting is unavailable until ${new Date(restriction.ends_at).toLocaleString()}`
      : undefined);
  }

  const admin = createAdminClient();
  if (parsed.data.expectedMediaCount > 0 && parsed.data.creationToken) {
    const { data: existingAssembly } = await admin
      .from("community_post_assemblies")
      .select("post_id")
      .eq("owner_id", profile.profileId)
      .eq("creation_token", parsed.data.creationToken)
      .maybeSingle();
    if (existingAssembly) {
      const { data: existingPost } = await admin
        .from("community_posts")
        .select("id, moderation_status")
        .eq("id", existingAssembly.post_id)
        .single();
      if (!existingPost) return { error: "Post draft is no longer available." };
      const moderationStatus = existingPost.moderation_status as ModerationStatus;
      return { data: {
        id: existingPost.id,
        moderationStatus,
        moderationMessage: moderationUserMessage(
          moderationStatus === "active" ? "allow" : moderationStatus === "rejected" ? "block" : "review",
        ),
      } };
    }
  }

  const postRateLimit = await getCommunityRateLimit(profile.profileId, "post");
  if (postRateLimit.limited) {
    return rejected(
      "rate_limited",
      communityRateLimitMessage("post", postRateLimit.retryAfterSeconds),
      postRateLimit.retryAfterSeconds,
    );
  }

  const groupId = parsed.data.groupId ?? null;
  if (groupId && !flags.flags.groups) {
    return rejected("posting_unavailable", FEATURE_UNAVAILABLE_MESSAGE.groups);
  }

  if (groupId) {
    const { data: membership } = await admin
      .from("community_group_memberships")
      .select("role, group:community_groups!community_group_memberships_group_id_fkey(id, status, visibility, join_policy, posting_policy)")
      .eq("group_id", groupId)
      .eq("profile_id", profile.profileId)
      .eq("status", "active")
      .maybeSingle();
    const group = membership?.group as unknown as {
      id: string;
      status: string;
      visibility: string;
      join_policy: string;
      posting_policy: string;
    } | null;
    if (!group || group.status !== "active" || group.visibility !== "public" || group.join_policy !== "open") {
      return { error: "Join this group before posting." };
    }
    if (group.posting_policy === "moderators" && membership?.role === "member") {
      return { error: "Only this group's moderators can post here. You can still comment." };
    }
  }

  const audience = groupId ? "public" : (parsed.data.audience ?? profile.default_post_audience);
  if (!groupId && audience === "public" && !profile.is_public) {
    return rejected("unauthorized_audience", "Make your profile public before publishing a Public post");
  }

  // Deterministic safety layer (plan 21.1): control characters, link volume
  // and schemes, high-confidence policy patterns, then duplicate throttling.
  const evaluated = evaluateTextForPublication(parsed.data.content, "post");
  if (!evaluated.ok) {
    console.warn("community post rejected by launch policy", { ruleId: evaluated.ruleId });
    return rejected(evaluated.outcome);
  }
  const duplicates = evaluateDuplicates(
    evaluated.fingerprint,
    await recentAuthorContent("community_posts", profile.profileId, 10 * 60 * 1000),
  );
  if (!duplicates.ok) return rejected(duplicates.outcome);

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

  const launchMode = !flags.flags.automated_post_moderation;
  const hasMediaAssembly = parsed.data.expectedMediaCount > 0;
  const initialModerationStatus = launchMode ? "active" : "pending_scan";
  let data: { id: string } | null = null;
  let createError: { message: string } | null = null;

  if (hasMediaAssembly && parsed.data.creationToken) {
    const assembled = await admin.rpc("create_community_post_assembly", {
      p_author_id: profile.profileId,
      p_creation_token: parsed.data.creationToken,
      p_expected_media_count: parsed.data.expectedMediaCount,
      p_audience: audience,
      p_vehicle_id: vehicleId,
      p_marketplace_listing_id: listingId,
      p_group_id: groupId,
      p_post_type: parsed.data.postType,
      p_content: evaluated.text,
      p_moderation_status: initialModerationStatus,
      p_moderation_reason: null,
      p_moderation_checked_at: launchMode ? new Date().toISOString() : null,
      p_moderation_version: launchMode ? LAUNCH_POLICY_VERSION : null,
    });
    data = assembled.data ? { id: assembled.data } : null;
    createError = assembled.error;
  } else {
    const created = await admin.from("community_posts").insert({
      author_id: profile.profileId,
      audience,
      vehicle_id: vehicleId,
      marketplace_listing_id: listingId,
      group_id: groupId,
      post_type: parsed.data.postType,
      content: evaluated.text,
      // Text-only posts preserve the launch-mode immediate publication path.
      status: launchMode ? "active" : "hidden",
      moderation_status: initialModerationStatus,
      ...(launchMode ? {
        moderation_reason: null,
        moderation_checked_at: new Date().toISOString(),
        moderation_version: LAUNCH_POLICY_VERSION,
      } : {}),
    }).select("id").single();
    data = created.data;
    createError = created.error;
  }

  if (createError || !data) {
    return { error: friendlyDatabaseError(createError, "Your post could not be created. Please try again.", "create post") };
  }

  if (launchMode) {
    // The content row is the visibility source of truth; the moderation item
    // is the compatibility aggregate (plan 29.7), so a recording failure is
    // logged rather than turned into a failed publish.
    await recordModeration({
      entityType: "community_post",
      entityId: data.id,
      authorId: profile.profileId,
      contentPreview: evaluated.text,
      result: launchAllowResult({ linkCount: evaluated.linkCount, fingerprint: evaluated.fingerprint }),
    }).catch((recordError) => console.error("launch moderation record failed", recordError));

    if (!hasMediaAssembly) {
      revalidatePath("/community");
      if (groupId) revalidatePath("/community/groups");
      revalidatePath("/dashboard/posts");
    }
    revalidatePath("/admin/community");
    revalidatePath("/admin/moderation");
    return { data: { ...data, moderationStatus: "active" as const, moderationMessage: null } };
  }

  const result = await moderateText(evaluated.text);
  try {
    await recordModeration({
      entityType: "community_post",
      entityId: data.id,
      authorId: profile.profileId,
      contentPreview: evaluated.text,
      result,
    });
    const { error: updateError } = await admin
      .from("community_posts")
      .update({
        status: hasMediaAssembly ? "hidden" : publicStatusForDecision(result.decision),
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
  if (groupId) revalidatePath("/community/groups");
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

const finalizePostAssemblySchema = z.object({ postId: z.string().uuid() });
const finalizePostAssemblyResultSchema = z.object({
  postId: z.string().uuid(),
  published: z.boolean(),
  moderationStatus: z.enum(["pending_scan", "active", "pending_review", "rejected", "legal_hold"]),
});

export async function finalizeCommunityPostAssembly(
  input: unknown,
): Promise<CommunityActionResult<CommunityFinalizeData>> {
  const parsed = finalizePostAssemblySchema.safeParse(input);
  if (!parsed.success) return rejected("validation_failed", "Invalid post draft");
  const profile = await getCurrentProfileId();
  if (profile.error !== undefined) return { error: profile.error };

  const { data, error } = await createAdminClient().rpc("finalize_community_post_assembly", {
    p_actor_profile_id: profile.profileId,
    p_post_id: parsed.data.postId,
  });
  if (error) return { error: "The photo upload is incomplete. Please retry the upload." };
  const result = finalizePostAssemblyResultSchema.safeParse(data);
  if (!result.success) return { error: "The post could not be finalized." };

  if (result.data.published) {
    revalidatePath("/community");
    revalidatePath("/community/groups");
    revalidatePath("/dashboard/posts");
  }
  revalidatePath("/admin/community");
  revalidatePath("/admin/moderation");
  return { data: {
    id: result.data.postId,
    published: result.data.published,
    moderationStatus: result.data.moderationStatus,
    moderationMessage: moderationUserMessage(
      result.data.moderationStatus === "active"
        ? "allow"
        : result.data.moderationStatus === "rejected"
          ? "block"
          : result.data.moderationStatus === "legal_hold"
            ? "legal_hold"
            : "review",
    ),
  } };
}

const postLikeSchema = z.object({
  postId: z.string().uuid(),
  liked: z.boolean(),
});
const postLikeResultSchema = z.object({
  postId: z.string().uuid(),
  liked: z.boolean(),
  likeCount: z.number().int().nonnegative(),
});

export async function setCommunityPostLike(
  input: unknown,
): Promise<CommunityActionResult<CommunityLikeData>> {
  const parsed = postLikeSchema.safeParse(input);
  if (!parsed.success) return rejected("validation_failed", "Invalid post reaction");
  const profile = await getCurrentProfileId();
  if (profile.error !== undefined) return { error: profile.error };

  const { data, error } = await createAdminClient().rpc("set_community_post_like", {
    p_actor_profile_id: profile.profileId,
    p_post_id: parsed.data.postId,
    p_liked: parsed.data.liked,
  });
  if (error) {
    return {
      error: error.message.includes("authors cannot")
        ? "You cannot like your own post."
        : "This post is no longer available.",
    };
  }
  const result = postLikeResultSchema.safeParse(data);
  if (!result.success) return { error: "The reaction could not be updated." };

  revalidatePath("/community");
  revalidatePath("/community/groups");
  return { data: result.data };
}

const postSaveSchema = z.object({
  postId: z.string().uuid(),
  saved: z.boolean(),
});
const postSaveResultSchema = z.object({
  postId: z.string().uuid(),
  saved: z.boolean(),
});

// Private bookmark (plan Phase 1B). Saving requires current visibility;
// unsaving always works so a member can clear something they lost access to.
export async function setCommunityPostSave(
  input: unknown,
): Promise<CommunityActionResult<CommunitySaveData>> {
  const parsed = postSaveSchema.safeParse(input);
  if (!parsed.success) return rejected("validation_failed", "Invalid save request");
  const profile = await getCurrentProfileId();
  if (profile.error !== undefined) return { error: profile.error };

  const { data, error } = await createAdminClient().rpc("set_community_post_save", {
    p_actor_profile_id: profile.profileId,
    p_post_id: parsed.data.postId,
    p_saved: parsed.data.saved,
  });
  if (error) return { error: "This post is no longer available." };
  const result = postSaveResultSchema.safeParse(data);
  if (!result.success) return { error: "The save could not be updated." };

  revalidatePath("/dashboard/saved");
  return { data: result.data };
}

export async function addCommunityPostMedia(input: unknown) {
  const parsed = postMediaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const profile = await getCurrentProfileId();
  if ("error" in profile) return { error: profile.error };

  // Plan 21.3: Community video is rejected at attachment time even when an
  // older client still offers it. Photos have their own kill switch.
  const flags = await getFeatureFlags();
  const includesVideo = parsed.data.items.some((item) =>
    item.mediaType === "video" || item.contentType.startsWith("video/"),
  );
  if (includesVideo && !flags.flags.community_video_uploads) {
    return rejected("unsupported_media");
  }
  if (!flags.flags.community_photo_uploads) {
    return rejected("posting_unavailable", FEATURE_UNAVAILABLE_MESSAGE.community_photo_uploads);
  }

  if (await getActivePostingRestriction(profile.profileId, true)) {
    return rejected("posting_restricted", "Media uploads are unavailable for this account");
  }

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .select("id, author_id, group_id, status, moderation_status")
    .eq("id", parsed.data.postId)
    .maybeSingle();

  const { data: assembly } = post ? await admin
    .from("community_post_assemblies")
    .select("state, expected_media_count, creation_token")
    .eq("post_id", post.id)
    .maybeSingle() : { data: null };
  const requestedAssembly = parsed.data.creationToken
    && assembly?.creation_token === parsed.data.creationToken ? assembly : null;
  const openAssembly = requestedAssembly?.state === "finalized" ? null : requestedAssembly;
  const editablePublishedPost = post?.status === "active" && post.moderation_status === "active";
  // The media trigger can mark a complete assembly submitted before the
  // client receives its response. Matching-token retries may read it back;
  // the expected-count check below still prevents extra attachments.
  const editableAssembly = post?.status === "hidden"
    && (openAssembly?.state === "assembling" || openAssembly?.state === "submitted");
  if (!post || post.author_id !== profile.profileId
    || (assembly && parsed.data.creationToken && !requestedAssembly)
    || (!editablePublishedPost && !editableAssembly)) {
    return { error: "Post not found" };
  }

  const quarantinePrefix = `r2-private:///quarantine/community_post/${profile.profileId}/${post.id}/`;
  if (parsed.data.items.some((item) => !item.url.startsWith(quarantinePrefix))) {
    return { error: "Community upload does not belong to this post" };
  }

  // Check the durable rows before reservations so a retry after a lost
  // response can return the original media even though those reservations
  // were already consumed by the successful request.
  const { count, error: countError } = await admin
    .from("community_post_media")
    .select("id", { count: "exact", head: true })
    .eq("post_id", post.id);
  if (countError) return { error: "Could not verify the post media limit" };

  const existing = count ?? 0;
  if (requestedAssembly && existing === requestedAssembly.expected_media_count) {
    const { data: existingMedia } = await admin
      .from("community_post_media")
      .select("*")
      .eq("post_id", post.id)
      .order("sort_order", { ascending: true });
    return { data: (existingMedia ?? []).map((item) => ({
      ...item,
      url: communityMediaDeliveryPath(item.id),
    })) };
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
  if (reservationError) {
    return { error: friendlyDatabaseError(reservationError, "Your uploads could not be verified. Please try again.", "read reservations") };
  }
  const reservationsByReference = new Map(
    (reservations ?? []).map((reservation) => [reservation.storage_reference, reservation]),
  );
  if (reservationsByReference.size !== references.length || parsed.data.items.some((item) =>
    reservationsByReference.get(item.url)?.content_type !== item.contentType
  )) {
    return { error: "One or more uploads are missing, expired, or do not match the selected media" };
  }

  if (openAssembly && existing + parsed.data.items.length > openAssembly.expected_media_count) {
    return { error: "The uploaded photo count does not match this post draft." };
  }
  if (existing + parsed.data.items.length > MAX_POST_MEDIA) {
    return { error: `Posts can include up to ${MAX_POST_MEDIA} photos` };
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
    return { error: friendlyDatabaseError(error, "The photos could not be attached to your post. Please try again.", "attach media") };
  }

  const scanned = (await Promise.all((data ?? []).map(async (media) => {
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
            : flags.flags.automated_post_moderation
              // Legacy: specialist safeguard, then the general AI classifier.
              ? await moderateImage(bytes, media.content_type)
              // Launch mode (plan 21.2): the specialist safeguard is the only
              // gate. Unavailable means not published, never bypassed.
              : await moderateImageLaunchMode(bytes, media.content_type, {
                  safeguardRequired: flags.flags.specialist_image_safeguard,
                });
      }

      await recordModeration({
        entityType: "community_post_media",
        entityId: media.id,
        authorId: profile.profileId,
        contentPreview: `${media.media_type} upload`,
        result,
        evidenceReference: result.decision === "legal_hold" ? media.url : null,
      });

      // Approved media moves to its immutable private home and gets a
      // metadata-stripped display variant (plan 19.2 / 21.2). No public URL
      // is ever written; viewers fetch through the status-aware endpoint.
      let storedUrl = media.url;
      let displayReference: string | null = null;
      if (result.decision === "allow") {
        const published = await publishCommunityMedia({
          mediaId: media.id,
          postId: post.id,
          ownerId: profile.profileId,
          mediaType: media.media_type,
          contentType: media.content_type,
          sourceReference: media.url,
          bytes,
        });
        storedUrl = published.storageReference;
        displayReference = published.displayReference;
      }

      const moderationStatus = statusForDecision(result.decision);
      const { data: updated, error: updateError } = await admin
        .from("community_post_media")
        .update({
          url: storedUrl,
          display_reference: displayReference,
          content_sha256: sha256,
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
        if (displayReference) await deleteOrQueue(displayReference, "failed_media_promotion_commit");
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
      return updated ?? null;
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
      console.error("community media moderation failed", scanError);
      return updated ?? null;
    }
  }))).filter((item): item is NonNullable<typeof item> => item !== null)
    .map((item) => ({ ...item, url: communityMediaDeliveryPath(item.id) }));

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  revalidatePath("/admin/moderation");
  return { data: scanned };
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
    .select("id, author_id, group_id, status, moderation_status")
    .eq("id", parsed.data.postId)
    .maybeSingle();

  if (!post || post.author_id !== profile.profileId
    || post.status !== "active" || post.moderation_status !== "active") {
    return { error: "Post not found" };
  }

  const { data: media } = await admin
    .from("community_post_media")
    .select("id, url, display_reference")
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

  // Plan 19.3: an object referenced by an open report, confirmed violation,
  // appeal, or hold is evidence and cannot be physically removed by its author.
  const { data: retainedCase } = await admin.from("moderation_cases")
    .select("id")
    .eq("entity_type", "community_post")
    .eq("entity_id", post.id)
    .or("state.in.(monitoring,open,claimed,escalated,appeal_open),resolution.eq.violation_removed,legal_hold.eq.true")
    .limit(1)
    .maybeSingle();
  if (retainedCase) return { error: "This media is part of a moderation case and cannot be removed right now" };

  const { data: deleted, error } = await admin
    .from("community_post_media")
    .delete()
    .eq("id", parsed.data.mediaId)
    .eq("post_id", post.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: friendlyDatabaseError(error, "The photo could not be removed. Please try again.", "remove media") };
  if (!deleted) return { error: "Media not found" };
  await deleteOrQueue(media.url, "community_media_deleted");
  if (media.display_reference) await deleteOrQueue(media.display_reference, "community_media_deleted");

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

// Push mirror of the in-app comment notice (plan 22.2). The database
// trigger decides whether a notice exists at all (self, mute, block,
// in-app preference); a push goes out only when it did, the push preference
// allows it, and never carries the comment text.
async function pushCommentNotice(postId: string, commenterId: string) {
  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .select("author_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post || post.author_id === commenterId) return;
  const { data: notice } = await admin
    .from("notifications")
    .select("id, data")
    .eq("user_id", post.author_id)
    .eq("type", "post_comment")
    .is("read_at", null)
    .contains("data", { post_id: postId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latest = (notice?.data as { latest_actor_id?: string } | null)?.latest_actor_id;
  if (!notice || latest !== commenterId) return;
  if (!(await pushAllowed(post.author_id, "post_comment"))) return;
  await pushToProfile(post.author_id, {
    title: "New comment on your post",
    body: "Open PerfectPPI to read it.",
    data: { type: "post_comment", post_id: postId, notification_id: notice.id, link: notificationLink(notice.id) },
  }).catch((error) => console.warn("[community] comment push failed", error instanceof Error ? error.message : error));
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

export async function createCommunityCommentFromInput(
  input: unknown,
): Promise<CommunityActionResult<CommunityPublishData>> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return rejected("validation_failed", "Invalid comment");

  const profile = await getCurrentProfileId();
  if (profile.error !== undefined) return { error: profile.error };

  const flags = await getFeatureFlags();
  if (!flags.flags.community_text_posts) {
    return rejected("posting_unavailable", FEATURE_UNAVAILABLE_MESSAGE.community_text_posts);
  }
  if (await getActivePostingRestriction(profile.profileId)) {
    return rejected("posting_restricted", "Community commenting is unavailable for this account");
  }
  const commentRateLimit = await getCommunityRateLimit(profile.profileId, "comment");
  if (commentRateLimit.limited) {
    return rejected(
      "rate_limited",
      communityRateLimitMessage("comment", commentRateLimit.retryAfterSeconds),
      commentRateLimit.retryAfterSeconds,
    );
  }

  const evaluated = evaluateTextForPublication(parsed.data.content, "comment");
  if (!evaluated.ok) {
    console.warn("community comment rejected by launch policy", { ruleId: evaluated.ruleId });
    return rejected(evaluated.outcome);
  }
  const duplicates = evaluateDuplicates(
    evaluated.fingerprint,
    await recentAuthorContent("community_comments", profile.profileId, 10 * 60 * 1000),
  );
  if (!duplicates.ok) return rejected(duplicates.outcome);

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .select("id, author_id, group_id, status, moderation_status")
    .eq("id", parsed.data.postId)
    .eq("status", "active")
    .maybeSingle();

  if (!post || post.moderation_status !== "active") return { error: "Post not found" };
  const { data: canView } = await admin.rpc("social_can_view_community_post", {
    p_viewer_id: profile.profileId,
    p_post_id: post.id,
    p_include_muted: false,
  });
  if (!canView) return { error: "Post not found" };
  if (post.group_id) {
    if (!flags.flags.groups) return rejected("posting_unavailable", FEATURE_UNAVAILABLE_MESSAGE.groups);
    const { data: membership } = await admin
      .from("community_group_memberships")
      .select("group:community_groups!community_group_memberships_group_id_fkey(status)")
      .eq("group_id", post.group_id)
      .eq("profile_id", profile.profileId)
      .eq("status", "active")
      .maybeSingle();
    const group = membership?.group as unknown as { status: string } | null;
    if (!group || group.status !== "active") return { error: "Join this group before commenting." };
  }

  const launchMode = !flags.flags.automated_post_moderation;
  const { data, error } = await admin.from("community_comments").insert({
    post_id: post.id,
    author_id: profile.profileId,
    content: evaluated.text,
    status: launchMode ? "active" : "hidden",
    moderation_status: launchMode ? "active" : "pending_scan",
    ...(launchMode ? {
      moderation_reason: null,
      moderation_checked_at: new Date().toISOString(),
      moderation_version: LAUNCH_POLICY_VERSION,
    } : {}),
  }).select("id").single();

  if (error) return { error: friendlyDatabaseError(error, "Your comment could not be posted. Please try again.", "create comment") };

  if (launchMode) {
    await recordModeration({
      entityType: "community_comment",
      entityId: data.id,
      authorId: profile.profileId,
      contentPreview: evaluated.text,
      result: launchAllowResult({ linkCount: evaluated.linkCount, fingerprint: evaluated.fingerprint }),
    }).catch((recordError) => console.error("launch moderation record failed", recordError));
    await pushCommentNotice(post.id, profile.profileId);

    revalidatePath("/community");
    revalidatePath("/admin/community");
    revalidatePath("/admin/moderation");
    return { data: { ...data, moderationStatus: "active" as const, moderationMessage: null } };
  }

  const moderation = await moderateText(evaluated.text);
  try {
    await recordModeration({
      entityType: "community_comment",
      entityId: data.id,
      authorId: profile.profileId,
      contentPreview: evaluated.text,
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
  if (statusForDecision(moderation.decision) === "active") {
    await pushCommentNotice(post.id, profile.profileId);
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

const acceptedAnswerSchema = z.object({
  postId: z.string().uuid(),
  commentId: z.string().uuid().nullable(),
});

const acceptedAnswerResultSchema = z.object({
  postId: z.string().uuid(),
  acceptedAnswerCommentId: z.string().uuid().nullable(),
  changed: z.boolean(),
});

export async function setAcceptedCommunityAnswerFromInput(input: unknown) {
  const parsed = acceptedAnswerSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid accepted answer selection." };

  const profile = await getCurrentProfileId();
  if (profile.error !== undefined) return { error: profile.error };

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .select("group_id")
    .eq("id", parsed.data.postId)
    .maybeSingle();
  if (!post) return { error: "Question not found." };
  if (post.group_id && !(await getFeatureFlags()).flags.groups) {
    return { error: FEATURE_UNAVAILABLE_MESSAGE.groups };
  }

  const { data, error } = await admin.rpc("set_accepted_community_answer", {
    p_actor_profile_id: profile.profileId,
    p_post_id: parsed.data.postId,
    p_comment_id: parsed.data.commentId,
  });
  if (error) {
    console.warn("accepted answer update failed", { message: error.message });
    return { error: "This answer is no longer available." };
  }
  const result = acceptedAnswerResultSchema.safeParse(data);
  if (!result.success) return { error: "The answer selection could not be confirmed." };

  revalidatePath("/community");
  revalidatePath("/community/groups");
  revalidatePath("/dashboard/posts");
  return { data: result.data };
}

export async function setAcceptedCommunityAnswer(formData: FormData): Promise<void> {
  await setAcceptedCommunityAnswerFromInput({
    postId: formData.get("post_id"),
    commentId: nullableUuid(formData.get("comment_id")),
  });
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
  const { data: post } = await admin
    .from("community_posts")
    .select("moderation_status")
    .eq("id", postId)
    .eq("author_id", profile.profileId)
    .maybeSingle();
  if (!post || post.moderation_status !== "active") {
    return { error: "This post cannot be changed while it is under review" };
  }

  const updates: { status: "active" | "archived"; updated_at?: string } = { status };
  if (status === "archived") updates.updated_at = new Date().toISOString();

  const { error } = await admin
    .from("community_posts")
    .update(updates)
    .eq("id", postId)
    .eq("author_id", profile.profileId);

  if (error) return { error: friendlyDatabaseError(error, "The post could not be updated. Please try again.", "update post status") };

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

  // Routine removal is always soft. Retention workers own physical deletion.
  const { data: post } = await admin
    .from("community_posts")
    .select("id, author_id, moderation_status")
    .eq("id", postId)
    .single();

  if (!post) return { error: "Post not found" };
  if (profile.role !== "admin" && post.author_id !== profile.profileId) {
    return { error: "Not authorized" };
  }
  if (post.moderation_status !== "active") {
    return { error: "This post cannot be removed while it is under review" };
  }

  const { error } = await admin.from("community_posts")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (error) return { error: friendlyDatabaseError(error, "The post could not be removed. Please try again.", "archive post") };

  revalidatePath("/community");
  revalidatePath("/dashboard/posts");
  revalidatePath("/admin/community");
  return { success: true, archived: true };
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
