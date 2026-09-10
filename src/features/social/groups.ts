import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_UNAVAILABLE_MESSAGE, isFeatureEnabled } from "@/lib/feature-flags";

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
  membership_role: "owner" | "moderator" | "member" | null;
  is_suggested: boolean;
};

const membershipSchema = z.object({
  groupId: z.string().uuid(),
  joined: z.boolean(),
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

export async function getCommunityGroups(): Promise<CommunityGroupSummary[]> {
  if (!(await groupsEnabled())) return [];
  const profileId = await currentProfileId();
  if (!profileId) return [];

  const admin = createAdminClient();
  const { data: groups, error } = await admin
    .from("community_groups")
    .select("id, slug, name, description, category, rules, avatar_url, cover_url, vehicle_make, vehicle_model, year_start, year_end")
    .eq("status", "active")
    .eq("visibility", "public")
    .eq("is_staff_curated", true)
    .order("name");
  if (error || !groups?.length) {
    if (error) console.error("community group directory failed", error.message);
    return [];
  }

  const groupIds = groups.map((group) => group.id);
  const [{ data: memberships }, { data: vehicles }] = await Promise.all([
    admin
      .from("community_group_memberships")
      .select("group_id, profile_id, role")
      .in("group_id", groupIds)
      .eq("status", "active"),
    admin
      .from("vehicles")
      .select("make, model")
      .eq("owner_id", profileId),
  ]);

  const memberCounts = new Map<string, number>();
  const mine = new Map<string, "owner" | "moderator" | "member">();
  for (const membership of memberships ?? []) {
    memberCounts.set(membership.group_id, (memberCounts.get(membership.group_id) ?? 0) + 1);
    if (membership.profile_id === profileId) mine.set(membership.group_id, membership.role);
  }
  const garageTags = (vehicles ?? []).map((vehicle) => ({
    make: vehicle.make?.trim().toLowerCase() ?? "",
    model: vehicle.model?.trim().toLowerCase() ?? "",
  }));

  return groups.map((group) => ({
    ...group,
    rules: group.rules ?? [],
    member_count: memberCounts.get(group.id) ?? 0,
    is_member: mine.has(group.id),
    membership_role: mine.get(group.id) ?? null,
    is_suggested: Boolean(group.vehicle_make) && garageTags.some((vehicle) =>
      vehicle.make === group.vehicle_make?.trim().toLowerCase()
      && (!group.vehicle_model || vehicle.model === group.vehicle_model.trim().toLowerCase()),
    ),
  }));
}

export async function getCommunityGroup(slug: string) {
  const safeSlug = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeSlug)) return null;
  return (await getCommunityGroups()).find((group) => group.slug === safeSlug) ?? null;
}

export async function getAdminCommunityGroups() {
  const admin = createAdminClient();
  const [{ data: groups }, { data: memberships }] = await Promise.all([
    admin.from("community_groups").select("*").order("created_at", { ascending: false }),
    admin.from("community_group_memberships").select("group_id, role, status"),
  ]);
  return (groups ?? []).map((group) => ({
    ...group,
    active_member_count: (memberships ?? []).filter((membership) =>
      membership.group_id === group.id && membership.status === "active").length,
    has_active_owner: (memberships ?? []).some((membership) =>
      membership.group_id === group.id && membership.status === "active" && membership.role === "owner"),
  }));
}

export type GroupMembershipOutcome = "ok" | "invalid" | "feature_unavailable" | "group_unavailable";

export async function setCommunityGroupMembership(input: unknown): Promise<
  | { ok: true; joined: boolean; changed: boolean }
  | { ok: false; outcome: Exclude<GroupMembershipOutcome, "ok">; message: string }
> {
  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, outcome: "invalid", message: "Invalid group request." };
  // The kill switch prevents expansion, but members can always leave.
  if (parsed.data.joined && !(await groupsEnabled())) {
    return {
      ok: false,
      outcome: "feature_unavailable",
      message: FEATURE_UNAVAILABLE_MESSAGE.groups ?? "Groups are not available yet.",
    };
  }
  const profileId = await currentProfileId();
  if (!profileId) {
    return { ok: false, outcome: "group_unavailable", message: "This group is unavailable." };
  }

  const rpc = parsed.data.joined ? "join_curated_community_group" : "leave_curated_community_group";
  const { data, error } = await createAdminClient().rpc(rpc, {
    p_actor_profile_id: profileId,
    p_group_id: parsed.data.groupId,
  });
  if (error) {
    console.warn("community group membership failed", { rpc, message: error.message });
    return { ok: false, outcome: "group_unavailable", message: "This group is unavailable." };
  }

  revalidatePath("/community");
  revalidatePath("/community/groups");
  return { ok: true, joined: parsed.data.joined, changed: data === true };
}
