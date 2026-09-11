// Group owner/moderator tools and member lists (plan 13.4, 13.5, 13.7).
// Server-only: the RPCs are service-only and take the actor id, so this
// module authenticates, checks the groups capability, and maps outcomes.
import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_UNAVAILABLE_MESSAGE, isFeatureEnabled } from "@/lib/feature-flags";
import type { Database } from "@/types/database";

export type GroupRole = Database["public"]["Enums"]["community_group_role"];

export type GroupMember = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: GroupRole;
  joined_at: string;
};

export const GROUP_MODERATION_ACTIONS = [
  "pin",
  "unpin",
  "remove_post",
  "restore_post",
  "remove_member",
  "ban_member",
  "unban_member",
  "make_moderator",
  "make_member",
  "transfer_ownership",
  "archive",
] as const;
export type GroupModerationAction = (typeof GROUP_MODERATION_ACTIONS)[number];

const moderationSchema = z.object({
  groupId: z.string().uuid(),
  action: z.enum(GROUP_MODERATION_ACTIONS),
  postId: z.string().uuid().optional(),
  profileId: z.string().uuid().optional(),
  reason: z.string().trim().max(300).optional(),
});

export type GroupModerationResult =
  | { ok: true; action: GroupModerationAction; result: Record<string, unknown> }
  | { ok: false; outcome: "invalid" | "feature_unavailable" | "forbidden" | "not_found" | "conflict"; message: string };

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

export async function getGroupMembers(groupId: string, page = 1, perPage = 50): Promise<GroupMember[]> {
  const viewerId = await currentProfileId();
  if (!viewerId || !(await isFeatureEnabled("groups"))) return [];
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const { data, error } = await createAdminClient().rpc("list_group_members", {
    p_viewer_id: viewerId,
    p_group_id: groupId,
    p_limit: perPage,
    p_offset: (safePage - 1) * perPage,
  });
  if (error) {
    console.error("list_group_members failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.profile_id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    role: row.role,
    joined_at: row.joined_at,
  }));
}

export async function getViewerGroupRole(groupId: string): Promise<GroupRole | null> {
  const viewerId = await currentProfileId();
  if (!viewerId) return null;
  const { data } = await createAdminClient().rpc("community_group_role_of", {
    p_profile_id: viewerId,
    p_group_id: groupId,
  });
  return (data as GroupRole | null) ?? null;
}

function classify(error: { code?: string; message?: string }): Exclude<GroupModerationResult, { ok: true }> {
  const message = error.message ?? "";
  if (error.code === "42501") return { ok: false, outcome: "forbidden", message: "You do not have permission to do that in this group." };
  if (error.code === "P0002") return { ok: false, outcome: "not_found", message: "That post or member is not available." };
  if (error.code === "23514") return { ok: false, outcome: "conflict", message: message.replace(/^.*?:\s*/, "") || "That change is not allowed." };
  console.warn("group moderation failed", { code: error.code, message });
  return { ok: false, outcome: "conflict", message: "The change could not be applied." };
}

export async function moderateGroup(input: unknown): Promise<GroupModerationResult> {
  const parsed = moderationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, outcome: "invalid", message: "Invalid group action." };
  if (!(await isFeatureEnabled("groups"))) {
    return { ok: false, outcome: "feature_unavailable", message: FEATURE_UNAVAILABLE_MESSAGE.groups ?? "Groups are not available yet." };
  }
  const actorId = await currentProfileId();
  if (!actorId) return { ok: false, outcome: "forbidden", message: "Sign in to manage groups." };

  const { groupId, action, postId, profileId, reason } = parsed.data;
  const admin = createAdminClient();
  const needsPost = ["pin", "unpin", "remove_post", "restore_post"].includes(action);
  const needsProfile = ["remove_member", "ban_member", "unban_member", "make_moderator", "make_member", "transfer_ownership"].includes(action);
  if ((needsPost && !postId) || (needsProfile && !profileId)) {
    return { ok: false, outcome: "invalid", message: "Invalid group action." };
  }

  const call = (() => {
    switch (action) {
      case "pin":
      case "unpin":
        return admin.rpc("set_group_post_pinned", { p_actor_profile_id: actorId, p_post_id: postId!, p_pinned: action === "pin" });
      case "remove_post":
      case "restore_post":
        return admin.rpc("set_group_post_destination", {
          p_actor_profile_id: actorId,
          p_post_id: postId!,
          p_state: action === "remove_post" ? "group_removed" : "active",
          p_reason: reason ?? null,
        });
      case "remove_member":
      case "ban_member":
      case "unban_member":
        return admin.rpc("set_group_member_status", {
          p_actor_profile_id: actorId,
          p_group_id: groupId,
          p_target_profile_id: profileId!,
          p_status: action === "remove_member" ? "removed" : action === "ban_member" ? "banned" : "active",
          p_reason: reason ?? null,
        });
      case "make_moderator":
      case "make_member":
        return admin.rpc("set_group_member_role", {
          p_actor_profile_id: actorId,
          p_group_id: groupId,
          p_target_profile_id: profileId!,
          p_role: action === "make_moderator" ? "moderator" : "member",
        });
      case "transfer_ownership":
        return admin.rpc("transfer_group_ownership", {
          p_actor_profile_id: actorId,
          p_group_id: groupId,
          p_new_owner_profile_id: profileId!,
        });
      case "archive":
        return admin.rpc("archive_group", { p_actor_profile_id: actorId, p_group_id: groupId, p_reason: reason ?? null });
    }
  })();
  const { data, error } = await call;
  if (error) return classify(error);

  revalidatePath("/community");
  revalidatePath("/community/groups");
  revalidatePath("/dashboard/posts");
  return { ok: true, action, result: (data ?? {}) as Record<string, unknown> };
}
