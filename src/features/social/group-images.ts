// Group avatar / cover images (plan 13.5). Same road as vehicle photos:
// quarantined upload → reservation claim → safety gate → promotion to a
// public object → audited RPC. Nothing the gate does not clear is applied;
// a held object is deleted (or preserved as evidence on a legal hold) and
// the member is told why in plain words.
import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UPLOAD_LIMITS } from "@/config/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildStorageKey, getObjectFromStoredUrl, promoteQuarantinedObject } from "@/lib/storage/r2";
import { deleteStoredObjectOrQueue } from "@/features/uploads/cleanup";
import { communityUploadReferenceSchema, isManagedUploadUrl } from "@/features/uploads/url";
import { extensionForContentType, moderateUploadedMedia } from "@/lib/moderation/media-safety";
import { getActivePostingRestriction, recordModeration } from "@/lib/moderation";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const GROUP_IMAGE_KINDS = ["avatar", "cover"] as const;
export type GroupImageKind = (typeof GROUP_IMAGE_KINDS)[number];

const setSchema = z.object({
  groupId: z.string().uuid(),
  kind: z.enum(GROUP_IMAGE_KINDS),
  url: communityUploadReferenceSchema,
  contentType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
});

export type GroupImageResult =
  | { ok: true; kind: GroupImageKind; url: string | null }
  | { ok: false; outcome: "invalid" | "feature_unavailable" | "forbidden" | "restricted" | "upload_invalid" | "not_allowed" | "held" | "failed"; message: string };

async function currentProfileId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username_state")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return profile?.username_state === "claimed" ? profile.id : null;
}

function fail(outcome: Exclude<GroupImageResult, { ok: true }>["outcome"], message: string): GroupImageResult {
  return { ok: false, outcome, message };
}

export async function setCommunityGroupImage(input: unknown): Promise<GroupImageResult> {
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "Choose a JPEG, PNG, or WebP image uploaded through PerfectPPI.");
  if (!(await isFeatureEnabled("groups"))) return fail("feature_unavailable", "Groups are not available right now.");
  const actorId = await currentProfileId();
  if (!actorId) return fail("forbidden", "Sign in to manage groups.");
  if (await getActivePostingRestriction(actorId, true)) {
    return fail("restricted", "Media uploads are unavailable for this account right now.");
  }

  const admin = createAdminClient();
  const { groupId, kind, url, contentType } = parsed.data;
  const expectedPrefix = `r2-private:///quarantine/community_group/${actorId}/${groupId}/`;
  if (!url.startsWith(expectedPrefix)) return fail("upload_invalid", "That upload does not belong to this group.");

  const now = new Date().toISOString();
  const { data: reservation } = await admin
    .from("community_upload_reservations")
    .select("id, expected_size, content_type")
    .eq("profile_id", actorId)
    .eq("group_id", groupId)
    .eq("storage_reference", url)
    .eq("status", "issued")
    .gt("expires_at", now)
    .maybeSingle();
  if (!reservation || reservation.content_type !== contentType) {
    return fail("upload_invalid", "The upload is missing, expired, or does not match the selected image.");
  }
  const { data: claimed } = await admin
    .from("community_upload_reservations")
    .update({ status: "attached", attached_at: now })
    .eq("id", reservation.id)
    .eq("status", "issued")
    .select("id")
    .maybeSingle();
  if (!claimed) return fail("upload_invalid", "This upload was already used. Please select the image again.");

  let bytes: Uint8Array;
  try {
    bytes = (await getObjectFromStoredUrl(url, { expectedBytes: reservation.expected_size, maxBytes: UPLOAD_LIMITS.maxImageSize })).bytes;
  } catch {
    await deleteStoredObjectOrQueue(url, "invalid_group_image_upload");
    return fail("upload_invalid", "The image could not be read. Please try again.");
  }

  let result;
  try {
    result = await moderateUploadedMedia(bytes, contentType, "image");
  } catch (error) {
    console.error("group image moderation failed", error);
    await deleteStoredObjectOrQueue(url, "group_image_scan_failed");
    return fail("failed", "The image safety check could not be completed. Please try again.");
  }
  if (result.decision !== "allow") {
    // Recorded for evidence handling; the object itself is not kept unless
    // the safeguard asked for a legal hold.
    await recordModeration({
      entityType: "community_group_image",
      entityId: reservation.id,
      authorId: actorId,
      contentPreview: `group ${kind} image`,
      evidenceReference: result.decision === "legal_hold" ? url : null,
      result,
    }).catch(() => undefined);
    if (result.decision !== "legal_hold") await deleteStoredObjectOrQueue(url, "group_image_not_cleared");
    const notConfigured = result.reasonCodes.includes("specialist_scan_not_configured");
    return result.decision === "review"
      ? fail("held", notConfigured
        ? "Group images cannot be checked right now because the image safety scanner is not configured. Try again later."
        : "This image could not be verified by the safety check. Try a different image.")
      : fail("not_allowed", "This image cannot be used because it may not follow the Community Guidelines.");
  }

  let publicUrl: string;
  try {
    const promoted = await promoteQuarantinedObject({
      storageReference: url,
      destinationKey: buildStorageKey({
        entity: "community_group",
        ownerId: groupId,
        recordId: kind,
        filename: `${reservation.id}.${extensionForContentType(contentType)}`,
      }),
    });
    publicUrl = promoted.publicUrl;
  } catch (error) {
    console.error("group image promotion failed", error);
    await deleteStoredObjectOrQueue(url, "failed_group_image_promotion");
    return fail("failed", "The image could not be saved. Please try again.");
  }

  const { data: existingGroup, error: existingError } = await admin
    .from("community_groups")
    .select("avatar_url, cover_url")
    .eq("id", groupId)
    .maybeSingle();
  if (existingError || !existingGroup) {
    await Promise.all([
      deleteStoredObjectOrQueue(publicUrl, "group_image_lookup_failed"),
      deleteStoredObjectOrQueue(url, "group_image_lookup_failed"),
    ]);
    return fail("failed", "The group could not be loaded. Please try again.");
  }
  const previousUrl = kind === "avatar" ? existingGroup.avatar_url : existingGroup.cover_url;
  const { data: group, error } = await admin.rpc("set_community_group_image", {
    p_actor_profile_id: actorId,
    p_group_id: groupId,
    p_kind: kind,
    p_url: publicUrl,
  });
  if (error || !group) {
    await Promise.all([
      deleteStoredObjectOrQueue(publicUrl, "group_image_apply_failed"),
      deleteStoredObjectOrQueue(url, "group_image_apply_failed"),
    ]);
    if (error?.code === "42501") return fail("forbidden", "Only the group owner or an admin can change group images.");
    console.warn("set_community_group_image failed", { code: error?.code, message: error?.message });
    return fail("failed", "The image could not be saved. Please try again.");
  }
  await recordModeration({
    entityType: "community_group_image",
    entityId: reservation.id,
    authorId: actorId,
    contentPreview: `group ${kind} image`,
    result,
  }).catch(() => undefined);
  const cleanup = [deleteStoredObjectOrQueue(url, "promoted_group_image_source")];
  if (previousUrl && previousUrl !== publicUrl && isManagedUploadUrl(previousUrl)) {
    cleanup.push(deleteStoredObjectOrQueue(previousUrl, "replaced_group_image"));
  }
  await Promise.all(cleanup);
  revalidatePath("/community/groups");
  revalidatePath(`/community/groups/${group.slug}`);
  return { ok: true, kind, url: publicUrl };
}

export async function clearCommunityGroupImage(groupId: string, kind: GroupImageKind): Promise<GroupImageResult> {
  if (!z.string().uuid().safeParse(groupId).success || !GROUP_IMAGE_KINDS.includes(kind)) {
    return fail("invalid", "Invalid image.");
  }
  const actorId = await currentProfileId();
  if (!actorId) return fail("forbidden", "Sign in to manage groups.");
  const admin = createAdminClient();
  const { data: existingGroup, error: existingError } = await admin
    .from("community_groups")
    .select("avatar_url, cover_url")
    .eq("id", groupId)
    .maybeSingle();
  if (existingError || !existingGroup) return fail("failed", "The group could not be loaded. Please try again.");
  const previousUrl = kind === "avatar" ? existingGroup.avatar_url : existingGroup.cover_url;
  const { data: group, error } = await admin.rpc("set_community_group_image", {
    p_actor_profile_id: actorId,
    p_group_id: groupId,
    p_kind: kind,
    p_url: null,
  });
  if (error || !group) {
    if (error?.code === "42501") return fail("forbidden", "Only the group owner or an admin can change group images.");
    return fail("failed", "The image could not be removed. Please try again.");
  }
  if (previousUrl && isManagedUploadUrl(previousUrl)) {
    await deleteStoredObjectOrQueue(previousUrl, "removed_group_image");
  }
  revalidatePath("/community/groups");
  revalidatePath(`/community/groups/${group.slug}`);
  return { ok: true, kind, url: null };
}
