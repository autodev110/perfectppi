// Server-only helpers. This module is intentionally NOT a "use server" file:
// every export would otherwise become a client-callable action, and helpers
// such as getBlockedProfileIds()/canProfilesInteract() accept arbitrary
// profile IDs. Client components reach the mutations through
// /api/social/relationships, which authenticates the caller first.
import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const relationshipMutationSchema = z.object({
  profileId: z.string().uuid(),
  kind: z.enum(["block", "mute"]),
  enabled: z.boolean(),
});

export type SocialRelationshipState = {
  blockedByMe: boolean;
  mutedByMe: boolean;
  friends: boolean;
};

export type SafetyRelationship = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
};

async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username_state")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return profile?.username_state === "claimed" ? { supabase, profileId: profile.id } : null;
}

export async function getCurrentSocialProfileId() {
  return (await getCurrentProfile())?.profileId ?? null;
}

export async function canProfilesInteract(firstId: string, secondId: string) {
  if (firstId === secondId) return true;
  const { data, error } = await createAdminClient().rpc("social_profiles_are_blocked", {
    p_first_id: firstId,
    p_second_id: secondId,
  });
  return !error && data === false;
}

export async function getVisibleCommunityPostIds({
  viewerId,
  page = 1,
  perPage = 20,
  vehicleId = null,
  includeGroupPosts = true,
}: {
  viewerId: string;
  page?: number;
  perPage?: number;
  vehicleId?: string | null;
  includeGroupPosts?: boolean;
}) {
  const { data, error } = await createAdminClient().rpc("social_visible_community_post_ids", {
    p_viewer_id: viewerId,
    p_limit: perPage,
    p_offset: (Math.max(page, 1) - 1) * perPage,
    p_vehicle_id: vehicleId,
    p_include_group_posts: includeGroupPosts,
  });
  if (error) {
    console.error("getVisibleCommunityPostIds failed", error);
    return [];
  }
  return (data ?? []).map((row) => row.post_id);
}

export async function getVisibleCommunityGroupPostIds({
  viewerId,
  groupId,
  page = 1,
  perPage = 20,
}: {
  viewerId: string;
  groupId: string;
  page?: number;
  perPage?: number;
}) {
  const { data, error } = await createAdminClient().rpc("social_visible_community_group_post_ids", {
    p_viewer_id: viewerId,
    p_group_id: groupId,
    p_limit: perPage,
    p_offset: (Math.max(page, 1) - 1) * perPage,
  });
  if (error) {
    console.error("getVisibleCommunityGroupPostIds failed", error);
    return [];
  }
  return (data ?? []).map((row) => row.post_id);
}

export async function getBlockedProfileIds(viewerId: string, profileIds: string[]) {
  const candidates = [...new Set(profileIds.filter((id) => id !== viewerId))];
  if (candidates.length === 0) return new Set<string>();

  const admin = createAdminClient();
  const [{ data: outbound }, { data: inbound }] = await Promise.all([
    admin
      .from("profile_blocks")
      .select("blocked_id")
      .eq("blocker_id", viewerId)
      .in("blocked_id", candidates),
    admin
      .from("profile_blocks")
      .select("blocker_id")
      .eq("blocked_id", viewerId)
      .in("blocker_id", candidates),
  ]);

  return new Set([
    ...(outbound ?? []).map((row) => row.blocked_id),
    ...(inbound ?? []).map((row) => row.blocker_id),
  ]);
}

export async function getSocialRelationshipState(targetProfileId: string): Promise<SocialRelationshipState | null> {
  const auth = await getCurrentProfile();
  if (!auth || auth.profileId === targetProfileId) return null;

  const admin = createAdminClient();
  const lowId = auth.profileId < targetProfileId ? auth.profileId : targetProfileId;
  const highId = auth.profileId < targetProfileId ? targetProfileId : auth.profileId;
  const [{ data: block }, { data: mute }, { data: friendship }] = await Promise.all([
    admin
      .from("profile_blocks")
      .select("blocker_id")
      .eq("blocker_id", auth.profileId)
      .eq("blocked_id", targetProfileId)
      .maybeSingle(),
    admin
      .from("profile_mutes")
      .select("muter_id")
      .eq("muter_id", auth.profileId)
      .eq("muted_id", targetProfileId)
      .maybeSingle(),
    admin
      .from("friend_relationships")
      .select("status")
      .eq("profile_low_id", lowId)
      .eq("profile_high_id", highId)
      .eq("status", "friends")
      .maybeSingle(),
  ]);

  return { blockedByMe: !!block, mutedByMe: !!mute, friends: !!friendship };
}

export async function setSocialRelationship(input: unknown) {
  const parsed = relationshipMutationSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid relationship request" };

  const auth = await getCurrentProfile();
  if (!auth || auth.profileId === parsed.data.profileId) return { error: "Profile unavailable" };

  const rpc = parsed.data.kind === "block" ? "set_own_profile_block" : "set_own_profile_mute";
  const args = parsed.data.kind === "block"
    ? { p_target_profile_id: parsed.data.profileId, p_blocked: parsed.data.enabled }
    : { p_target_profile_id: parsed.data.profileId, p_muted: parsed.data.enabled };
  const { error } = await auth.supabase.rpc(rpc, args);

  if (error) return { error: "Profile unavailable" };

  revalidatePath("/community");
  revalidatePath("/dashboard/messages");
  revalidatePath("/dashboard/profile");
  return { data: { kind: parsed.data.kind, enabled: parsed.data.enabled } };
}

export async function getMySafetyRelationships() {
  const auth = await getCurrentProfile();
  if (!auth) return { blocked: [], muted: [] };

  const admin = createAdminClient();
  const [{ data: blocks }, { data: mutes }] = await Promise.all([
    admin.from("profile_blocks").select("blocked_id, created_at").eq("blocker_id", auth.profileId),
    admin.from("profile_mutes").select("muted_id, created_at").eq("muter_id", auth.profileId),
  ]);
  const ids = [...new Set([
    ...(blocks ?? []).map((row) => row.blocked_id),
    ...(mutes ?? []).map((row) => row.muted_id),
  ])];
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id, display_name, username, avatar_url").in("id", ids)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return {
    blocked: (blocks ?? []).flatMap((row) => {
      const profile = byId.get(row.blocked_id);
      return profile ? [{ ...profile, created_at: row.created_at }] : [];
    }),
    muted: (mutes ?? []).flatMap((row) => {
      const profile = byId.get(row.muted_id);
      return profile ? [{ ...profile, created_at: row.created_at }] : [];
    }),
  } satisfies { blocked: SafetyRelationship[]; muted: SafetyRelationship[] };
}
