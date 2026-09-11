import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_UNAVAILABLE_MESSAGE, isFeatureEnabled } from "@/lib/feature-flags";
import type { Database } from "@/types/database";

export type GroupVisibility = Database["public"]["Enums"]["community_group_visibility"];
export type GroupJoinPolicy = Database["public"]["Enums"]["community_group_join_policy"];
/** The viewer's relationship to a group (plan 13.3 membership states). */
export type GroupMembershipStatus = "active" | "requested" | "invited" | null;

export type CommunityGroupSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  rules: string[];
  avatar_url: string | null;
  cover_url: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  year_start: number | null;
  year_end: number | null;
  member_count: number;
  is_member: boolean;
  membership_role: "owner" | "admin" | "moderator" | "member" | null;
  is_suggested: boolean;
  /** Directory badge only (plan 13.6 launch set); no longer a gate. */
  is_staff_curated: boolean;
  location_region: string | null;
  /** "members" (anyone posts) or "moderators" (announcement group). */
  posting_policy: string;
  created_by: string | null;
  visibility: GroupVisibility;
  join_policy: GroupJoinPolicy;
  membership_status: GroupMembershipStatus;
  /** Posts and the member list are readable: public group, or an active member. */
  can_view_content: boolean;
  /** Pending join requests; only populated for the group's owner/moderators. */
  pending_request_count: number;
};

export type GroupInvitation = {
  group_id: string;
  slug: string;
  name: string;
  description: string;
  visibility: GroupVisibility;
  invited_by_label: string | null;
  invited_at: string;
};

export const GROUP_MEMBERSHIP_ACTIONS = ["join", "leave", "request", "cancel_request", "accept_invite", "decline_invite"] as const;
export type GroupMembershipAction = (typeof GROUP_MEMBERSHIP_ACTIONS)[number];

const membershipSchema = z.object({
  groupId: z.string().uuid(),
  /** Legacy shape: `{ joined: true|false }`; superseded by `action`. */
  joined: z.boolean().nullable().optional(),
  action: z.enum(GROUP_MEMBERSHIP_ACTIONS).optional(),
  message: z.string().trim().max(300).optional(),
}).refine((value) => value.action !== undefined || typeof value.joined === "boolean", {
  message: "Choose a membership action",
});

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

export async function groupsEnabled() {
  return isFeatureEnabled("groups");
}

/**
 * Groups the viewer may see the shell of: public and private groups, plus
 * unlisted groups they belong to, were invited to, or asked to join. Content
 * for private/unlisted groups stays locked until `can_view_content`.
 */
export async function getCommunityGroups(): Promise<CommunityGroupSummary[]> {
  if (!(await groupsEnabled())) return [];
  const profileId = await currentProfileId();
  if (!profileId) return [];

  const admin = createAdminClient();
  const { data: visible, error: visibleError } = await admin.rpc("list_visible_group_ids", { p_viewer_id: profileId });
  if (visibleError) {
    console.error("community group directory failed", visibleError.message);
    return [];
  }
  const visibleIds = (visible ?? []).map((row) => row.group_id);
  if (visibleIds.length === 0) return [];

  const { data: groups, error } = await admin
    .from("community_groups")
    .select("id, slug, name, description, category, rules, avatar_url, cover_url, vehicle_make, vehicle_model, year_start, year_end, is_staff_curated, location_region, posting_policy, created_by, visibility, join_policy")
    .in("id", visibleIds)
    .eq("status", "active")
    .order("is_staff_curated", { ascending: false })
    .order("name");
  if (error || !groups?.length) {
    if (error) console.error("community group directory failed", error.message);
    return [];
  }

  const groupIds = groups.map((group) => group.id);
  const [{ data: memberships }, { data: vehicles }] = await Promise.all([
    admin
      .from("community_group_memberships")
      .select("group_id, profile_id, role, status")
      .in("group_id", groupIds)
      .in("status", ["active", "requested", "invited"]),
    admin
      .from("vehicles")
      .select("make, model")
      .eq("owner_id", profileId),
  ]);

  const memberCounts = new Map<string, number>();
  const pendingCounts = new Map<string, number>();
  const mine = new Map<string, { role: "owner" | "admin" | "moderator" | "member"; status: Exclude<GroupMembershipStatus, null> }>();
  for (const membership of memberships ?? []) {
    if (membership.status === "active") {
      memberCounts.set(membership.group_id, (memberCounts.get(membership.group_id) ?? 0) + 1);
    } else if (membership.status === "requested") {
      pendingCounts.set(membership.group_id, (pendingCounts.get(membership.group_id) ?? 0) + 1);
    }
    if (membership.profile_id === profileId && (membership.status === "active" || membership.status === "requested" || membership.status === "invited")) {
      mine.set(membership.group_id, { role: membership.role, status: membership.status });
    }
  }
  const garageTags = (vehicles ?? []).map((vehicle) => ({
    make: vehicle.make?.trim().toLowerCase() ?? "",
    model: vehicle.model?.trim().toLowerCase() ?? "",
  }));

  return groups.map((group) => {
    const own = mine.get(group.id);
    const isMember = own?.status === "active";
    const moderates = isMember && own.role !== "member";
    return {
      ...group,
      rules: group.rules ?? [],
      member_count: memberCounts.get(group.id) ?? 0,
      is_member: isMember,
      membership_role: isMember ? own.role : null,
      membership_status: own?.status ?? null,
      can_view_content: group.visibility === "public" || isMember,
      pending_request_count: moderates ? (pendingCounts.get(group.id) ?? 0) : 0,
      is_suggested: Boolean(group.vehicle_make) && garageTags.some((vehicle) =>
        vehicle.make === group.vehicle_make?.trim().toLowerCase()
        && (!group.vehicle_model || vehicle.model === group.vehicle_model.trim().toLowerCase()),
      ),
    };
  });
}

export async function getCommunityGroup(slug: string) {
  const safeSlug = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeSlug)) return null;
  const directoryMatch = (await getCommunityGroups()).find((group) => group.slug === safeSlug);
  if (directoryMatch) return directoryMatch;

  // Unlisted groups never appear in the directory, but plan 13.3 allows a
  // signed-in member who knows the exact link to see the group shell and ask
  // to join. Posts and members remain locked until membership is active.
  const profileId = await currentProfileId();
  if (!profileId || !(await groupsEnabled())) return null;
  const admin = createAdminClient();
  const { data: group, error } = await admin
    .from("community_groups")
    .select("id, slug, name, description, category, rules, avatar_url, cover_url, vehicle_make, vehicle_model, year_start, year_end, is_staff_curated, location_region, posting_policy, created_by, visibility, join_policy")
    .eq("slug", safeSlug)
    .eq("visibility", "unlisted")
    .eq("status", "active")
    .maybeSingle();
  if (error || !group) return null;

  const { data: shellVisible } = await admin.rpc("community_group_shell_visible", {
    p_viewer_id: profileId,
    p_group_id: group.id,
  });
  if (shellVisible !== true) return null;

  const [{ data: memberships }, { data: vehicles }] = await Promise.all([
    admin
      .from("community_group_memberships")
      .select("profile_id, role, status")
      .eq("group_id", group.id)
      .in("status", ["active", "requested", "invited"]),
    admin.from("vehicles").select("make, model").eq("owner_id", profileId),
  ]);
  const own = (memberships ?? []).find((membership) => membership.profile_id === profileId);
  const isMember = own?.status === "active";
  const moderates = isMember && (own.role === "owner" || own.role === "moderator");
  const garageTags = (vehicles ?? []).map((vehicle) => ({
    make: vehicle.make?.trim().toLowerCase() ?? "",
    model: vehicle.model?.trim().toLowerCase() ?? "",
  }));

  return {
    ...group,
    rules: group.rules ?? [],
    member_count: (memberships ?? []).filter((membership) => membership.status === "active").length,
    is_member: isMember,
    membership_role: isMember ? own.role : null,
    membership_status: own?.status === "active" || own?.status === "requested" || own?.status === "invited"
      ? own.status
      : null,
    can_view_content: isMember,
    pending_request_count: moderates
      ? (memberships ?? []).filter((membership) => membership.status === "requested").length
      : 0,
    is_suggested: Boolean(group.vehicle_make) && garageTags.some((vehicle) =>
      vehicle.make === group.vehicle_make?.trim().toLowerCase()
      && (!group.vehicle_model || vehicle.model === group.vehicle_model.trim().toLowerCase()),
    ),
  } satisfies CommunityGroupSummary;
}

/** Open invitations for the signed-in member (plan 13.3). */
export async function getMyGroupInvitations(): Promise<GroupInvitation[]> {
  if (!(await groupsEnabled())) return [];
  const profileId = await currentProfileId();
  if (!profileId) return [];
  const { data, error } = await createAdminClient().rpc("list_my_group_invitations", { p_actor_profile_id: profileId });
  if (error) {
    console.error("list_my_group_invitations failed", error.message);
    return [];
  }
  return data ?? [];
}

export async function getAdminCommunityGroups() {
  const admin = createAdminClient();
  const [{ data: groups }, { data: memberships }, { data: review }] = await Promise.all([
    admin.from("community_groups").select("*").order("created_at", { ascending: false }),
    admin.from("community_group_memberships").select("group_id, role, status"),
    admin.rpc("list_groups_needing_platform_review"),
  ]);
  const reviewReason = new Map((review ?? []).map((row) => [row.group_id, row.reason]));
  return (groups ?? []).map((group) => ({
    ...group,
    active_member_count: (memberships ?? []).filter((membership) =>
      membership.group_id === group.id && membership.status === "active").length,
    pending_request_count: (memberships ?? []).filter((membership) =>
      membership.group_id === group.id && membership.status === "requested").length,
    has_active_owner: (memberships ?? []).some((membership) =>
      membership.group_id === group.id && membership.status === "active" && membership.role === "owner"),
    /** Plan 13.4: "missing_owner" | "owner_unavailable" while the group waits for platform review. */
    review_reason: reviewReason.get(group.id) ?? null,
  }));
}

/** Groups the member still owns; account deletion waits for a transfer or archive (13.4). */
export async function getOwnedActiveGroups(profileId: string) {
  const { data, error } = await createAdminClient().rpc("list_owned_active_groups", { p_profile_id: profileId });
  if (error) {
    console.error("list_owned_active_groups failed", error.message);
    return [];
  }
  return data ?? [];
}

export type GroupMembershipOutcome =
  | "ok" | "invalid" | "feature_unavailable" | "group_unavailable" | "requires_request" | "invite_only" | "cooldown";

export const GROUP_MEMBERSHIP_MESSAGES: Record<Exclude<GroupMembershipOutcome, "ok">, string> = {
  invalid: "Invalid group request.",
  feature_unavailable: FEATURE_UNAVAILABLE_MESSAGE.groups ?? "Groups are not available yet.",
  group_unavailable: "This group is unavailable.",
  requires_request: "This group reviews join requests. Send a request and a moderator will take a look.",
  invite_only: "This group is invite-only. A moderator has to invite you.",
  cooldown: "Your last request was declined recently. You can ask again in a week.",
};

export type GroupMembershipResult =
  | { ok: true; status: Exclude<GroupMembershipStatus, null> | "none"; joined: boolean; changed: boolean }
  | { ok: false; outcome: Exclude<GroupMembershipOutcome, "ok">; message: string };

function membershipFailure(outcome: Exclude<GroupMembershipOutcome, "ok">): GroupMembershipResult {
  return { ok: false, outcome, message: GROUP_MEMBERSHIP_MESSAGES[outcome] };
}

/**
 * Join / leave, and the request and invitation flows (plan 13.3):
 * - join: Public/Open groups, or accepting an invitation;
 * - request: Request-approval groups (a message is optional);
 * - leave: also cancels a pending request or declines an invitation.
 */
export async function setCommunityGroupMembership(input: unknown): Promise<GroupMembershipResult> {
  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) return membershipFailure("invalid");
  const action: GroupMembershipAction = parsed.data.action ?? (parsed.data.joined ? "join" : "leave");
  const expanding = action === "join" || action === "request" || action === "accept_invite";
  // The kill switch prevents expansion, but members can always leave.
  if (expanding && !(await groupsEnabled())) return membershipFailure("feature_unavailable");
  const profileId = await currentProfileId();
  if (!profileId) return membershipFailure("group_unavailable");

  const admin = createAdminClient();
  const groupId = parsed.data.groupId;
  const finish = (result: GroupMembershipResult) => {
    revalidatePath("/community");
    revalidatePath("/community/groups");
    return result;
  };
  const join = async (): Promise<GroupMembershipResult> => {
    const { data, error } = await admin.rpc("join_curated_community_group", { p_actor_profile_id: profileId, p_group_id: groupId });
    if (error) {
      if (error.message.includes("group_requires_request")) return membershipFailure("requires_request");
      console.warn("community group join failed", { message: error.message });
      return membershipFailure("group_unavailable");
    }
    return finish({ ok: true, status: "active", joined: true, changed: data === true });
  };

  if (action === "join" || action === "accept_invite") return join();

  if (action === "request") {
    const { data, error } = await admin.rpc("request_group_membership", {
      p_actor_profile_id: profileId,
      p_group_id: groupId,
      p_message: parsed.data.message || null,
    });
    if (error) {
      if (error.message.includes("group_is_open")) return join();
      if (error.message.includes("group_invite_only")) return membershipFailure("invite_only");
      if (error.message.includes("group_request_cooldown")) return membershipFailure("cooldown");
      console.warn("community group request failed", { message: error.message });
      return membershipFailure("group_unavailable");
    }
    const result = (data ?? {}) as { status?: string; changed?: boolean };
    const status = result.status === "active" ? "active" : "requested";
    return finish({ ok: true, status, joined: status === "active", changed: result.changed === true });
  }

  const { data, error } = await admin.rpc("leave_curated_community_group", { p_actor_profile_id: profileId, p_group_id: groupId });
  if (error) {
    console.warn("community group leave failed", { action, message: error.message });
    return membershipFailure("group_unavailable");
  }
  return finish({ ok: true, status: "none", joined: false, changed: data === true });
}
