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
  posting_restricted_until: string | null;
};

export type GroupFaqEntry = Database["public"]["Tables"]["community_group_faq_entries"]["Row"];

export type GroupJoinRequest = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  requested_at: string;
  message: string | null;
};

export const GROUP_MODERATION_ACTIONS = [
  "pin",
  "unpin",
  "remove_post",
  "restore_post",
  "remove_member",
  "ban_member",
  "unban_member",
  "make_admin",
  "make_moderator",
  "make_member",
  "transfer_ownership",
  "archive",
  "approve_request",
  "decline_request",
  "invite",
  "set_slow_mode",
  "restrict_posting",
  "restore_posting",
] as const;
export type GroupModerationAction = (typeof GROUP_MODERATION_ACTIONS)[number];

const moderationSchema = z.object({
  groupId: z.string().uuid(),
  action: z.enum(GROUP_MODERATION_ACTIONS),
  postId: z.string().uuid().optional(),
  profileId: z.string().uuid().optional(),
  /** `invite` may name the member by username instead of id. */
  username: z.string().trim().min(1).max(64).optional(),
  reason: z.string().trim().max(300).optional(),
  seconds: z.number().int().refine((value) => [0, 30, 60, 300, 900, 3600, 21600, 86400].includes(value)).optional(),
  durationSeconds: z.number().int().refine((value) => [3600, 86400, 604800, 2592000].includes(value)).optional(),
}).superRefine((value, context) => {
  if (value.action === "set_slow_mode" && value.seconds === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a slow-mode interval.", path: ["seconds"] });
  }
  if (value.action === "restrict_posting") {
    if (value.durationSeconds === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose how long posting should be paused.", path: ["durationSeconds"] });
    }
    if (!value.reason) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Add a reason for the temporary restriction.", path: ["reason"] });
    }
  }
});

const faqSchema = z.object({
  groupId: z.string().uuid(),
  entryId: z.string().uuid().optional().nullable(),
  question: z.string().trim().min(3).max(200).optional().nullable(),
  answer: z.string().trim().min(3).max(2000).optional().nullable(),
  sourcePostId: z.string().uuid().optional().nullable(),
}).refine((value) => value.sourcePostId || (value.question && value.answer), {
  message: "Add a question and answer, or choose an accepted answer.",
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
    posting_restricted_until: row.posting_restricted_until,
  }));
}

/** Pending join requests, moderators only (plan 13.3); empty for everyone else. */
export async function getGroupJoinRequests(groupId: string): Promise<GroupJoinRequest[]> {
  const viewerId = await currentProfileId();
  if (!viewerId || !(await isFeatureEnabled("groups"))) return [];
  const { data, error } = await createAdminClient().rpc("list_group_join_requests", {
    p_actor_profile_id: viewerId,
    p_group_id: groupId,
  });
  if (error) {
    if (error.code !== "42501") console.error("list_group_join_requests failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.profile_id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    requested_at: row.requested_at,
    message: row.request_message,
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
  if (message.includes("group under review")) {
    return { ok: false, outcome: "conflict", message: "This group is paused while PerfectPPI reviews its ownership." };
  }
  if (error.code === "42501") return { ok: false, outcome: "forbidden", message: "You do not have permission to do that in this group." };
  if (message.includes("request unavailable")) return { ok: false, outcome: "not_found", message: "That request is no longer pending." };
  if (message.includes("member unavailable")) return { ok: false, outcome: "not_found", message: "That member could not be found." };
  if (error.code === "P0002") return { ok: false, outcome: "not_found", message: "That post or member is not available." };
  if (message.includes("group_invite_rate_limited")) {
    return { ok: false, outcome: "conflict", message: "You have sent a lot of invitations today. Try again tomorrow." };
  }
  if (message.includes("accepted answer already in faq")) {
    return { ok: false, outcome: "conflict", message: "That accepted answer is already in this group's FAQ." };
  }
  if (message.includes("accepted answer unavailable") || message.includes("faq unavailable")) {
    return { ok: false, outcome: "not_found", message: "That FAQ resource is no longer available." };
  }
  if (error.code === "23514") return { ok: false, outcome: "conflict", message: message.replace(/^.*?:\s*/, "") || "That change is not allowed." };
  console.warn("group moderation failed", { code: error.code, message });
  return { ok: false, outcome: "conflict", message: "The change could not be applied." };
}

async function resolveProfileId(admin: ReturnType<typeof createAdminClient>, username?: string) {
  if (!username) return null;
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("username_normalized", username.replace(/^@/, "").toLowerCase())
    .eq("username_state", "claimed")
    .eq("allow_exact_username_lookup", true)
    .maybeSingle();
  return data?.id ?? null;
}

export async function moderateGroup(input: unknown): Promise<GroupModerationResult> {
  const parsed = moderationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, outcome: "invalid", message: "Invalid group action." };
  if (!(await isFeatureEnabled("groups"))) {
    return { ok: false, outcome: "feature_unavailable", message: FEATURE_UNAVAILABLE_MESSAGE.groups ?? "Groups are not available yet." };
  }
  const actorId = await currentProfileId();
  if (!actorId) return { ok: false, outcome: "forbidden", message: "Sign in to manage groups." };

  const { groupId, action, postId, reason, username, seconds, durationSeconds } = parsed.data;
  const admin = createAdminClient();
  const needsPost = ["pin", "unpin", "remove_post", "restore_post"].includes(action);
  const needsProfile = [
    "remove_member", "ban_member", "unban_member", "make_admin", "make_moderator", "make_member", "transfer_ownership",
    "approve_request", "decline_request", "invite",
    "restrict_posting", "restore_posting",
  ].includes(action);
  const profileId = action === "invite"
    // Invitations are username-only so callers cannot bypass the member's
    // exact-lookup privacy preference with a raw profile id.
    ? await resolveProfileId(admin, username)
    : parsed.data.profileId;
  if (action === "invite" && !profileId) {
    return { ok: false, outcome: "not_found", message: "No member with that username could be found." };
  }
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
      case "make_admin":
      case "make_moderator":
      case "make_member":
        return admin.rpc("set_group_member_role", {
          p_actor_profile_id: actorId,
          p_group_id: groupId,
          p_target_profile_id: profileId!,
          p_role: action === "make_admin" ? "admin" : action === "make_moderator" ? "moderator" : "member",
        });
      case "transfer_ownership":
        return admin.rpc("transfer_group_ownership", {
          p_actor_profile_id: actorId,
          p_group_id: groupId,
          p_new_owner_profile_id: profileId!,
        });
      case "archive":
        return admin.rpc("archive_group", { p_actor_profile_id: actorId, p_group_id: groupId, p_reason: reason ?? null });
      case "approve_request":
      case "decline_request":
        return admin.rpc("decide_group_join_request", {
          p_actor_profile_id: actorId,
          p_group_id: groupId,
          p_target_profile_id: profileId!,
          p_approve: action === "approve_request",
        });
      case "invite":
        return admin.rpc("invite_to_group", { p_actor_profile_id: actorId, p_group_id: groupId, p_target_profile_id: profileId! });
      case "set_slow_mode":
        return admin.rpc("set_community_group_slow_mode", {
          p_actor_profile_id: actorId,
          p_group_id: groupId,
          p_seconds: seconds ?? -1,
        });
      case "restrict_posting":
      case "restore_posting":
        return admin.rpc("set_group_member_posting_restriction", {
          p_actor_profile_id: actorId,
          p_group_id: groupId,
          p_target_profile_id: profileId!,
          p_restricted_until: action === "restore_posting"
            ? null
            : new Date(Date.now() + (durationSeconds ?? 0) * 1000).toISOString(),
          p_reason: action === "restore_posting" ? null : reason ?? null,
        });
    }
  })();
  const { data, error } = await call;
  if (error) return classify(error);

  revalidatePath("/community");
  revalidatePath("/community/groups");
  revalidatePath("/dashboard/posts");
  return { ok: true, action, result: (data ?? {}) as Record<string, unknown> };
}

export async function acknowledgeGroupRules(groupId: string) {
  const actorId = await currentProfileId();
  if (!actorId || !(await isFeatureEnabled("groups"))) {
    return { ok: false as const, message: "Sign in to accept group rules." };
  }
  const { data, error } = await createAdminClient().rpc("acknowledge_community_group_rules", {
    p_actor_profile_id: actorId,
    p_group_id: groupId,
  });
  if (error) return { ok: false as const, message: classify(error).message };
  revalidatePath("/community/groups");
  return { ok: true as const, data: (data ?? {}) as Record<string, unknown> };
}

export async function getGroupFaqEntries(groupId: string, query = "", page = 1, perPage = 50): Promise<GroupFaqEntry[]> {
  const viewerId = await currentProfileId();
  if (!viewerId || !(await isFeatureEnabled("groups"))) return [];
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const { data, error } = await createAdminClient().rpc("list_community_group_faq", {
    p_viewer_id: viewerId,
    p_group_id: groupId,
    p_query: query.trim() || null,
    p_limit: Math.min(Math.max(perPage, 1), 100),
    p_offset: (safePage - 1) * perPage,
  });
  if (error) {
    console.error("list_community_group_faq failed", error.message);
    return [];
  }
  return data ?? [];
}

export async function saveGroupFaq(input: unknown) {
  const parsed = faqSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, outcome: "invalid" as const, message: parsed.error.issues[0]?.message ?? "Invalid FAQ resource." };
  const actorId = await currentProfileId();
  if (!actorId || !(await isFeatureEnabled("groups"))) {
    return { ok: false as const, outcome: "forbidden" as const, message: "Sign in to manage group resources." };
  }
  const value = parsed.data;
  const { data, error } = await createAdminClient().rpc("upsert_community_group_faq", {
    p_actor_profile_id: actorId,
    p_group_id: value.groupId,
    p_entry_id: value.entryId ?? null,
    p_question: value.question ?? null,
    p_answer: value.answer ?? null,
    p_source_post_id: value.sourcePostId ?? null,
  });
  if (error) return classify(error);
  revalidatePath("/community/groups");
  return { ok: true as const, data };
}

export async function deleteGroupFaq(groupId: string, entryId: string) {
  const parsed = z.object({ groupId: z.string().uuid(), entryId: z.string().uuid() }).safeParse({ groupId, entryId });
  if (!parsed.success) return { ok: false as const, outcome: "invalid" as const, message: "Invalid FAQ resource." };
  const actorId = await currentProfileId();
  if (!actorId || !(await isFeatureEnabled("groups"))) {
    return { ok: false as const, outcome: "forbidden" as const, message: "Sign in to manage group resources." };
  }
  const { error } = await createAdminClient().rpc("delete_community_group_faq", {
    p_actor_profile_id: actorId,
    p_group_id: groupId,
    p_entry_id: entryId,
  });
  if (error) return classify(error);
  revalidatePath("/community/groups");
  return { ok: true as const };
}
