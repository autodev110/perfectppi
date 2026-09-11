import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type MessageEligibility =
  | { kind: "accepted"; groupId: null }
  | { kind: "pending"; groupId: string }
  | { error: string };

export async function resolveMessageEligibility(
  actorId: string,
  targetId: string,
  marketplaceListingId?: string,
): Promise<MessageEligibility> {
  const admin = createAdminClient();

  if (marketplaceListingId) {
    const { data: listing } = await admin
      .from("marketplace_listings")
      .select("id")
      .eq("id", marketplaceListingId)
      .eq("seller_id", targetId)
      .eq("status", "active")
      .maybeSingle();
    return listing ? { kind: "accepted", groupId: null } : { error: "Listing unavailable" };
  }

  const lowId = actorId < targetId ? actorId : targetId;
  const highId = actorId < targetId ? targetId : actorId;
  const [{ data: profiles }, { data: friendship }, { data: actorMemberships }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, allow_friend_messages, allow_group_message_requests")
      .in("id", [actorId, targetId]),
    admin
      .from("friend_relationships")
      .select("status")
      .eq("profile_low_id", lowId)
      .eq("profile_high_id", highId)
      .eq("status", "friends")
      .maybeSingle(),
    admin
      .from("community_group_memberships")
      .select("group_id")
      .eq("profile_id", actorId)
      .eq("status", "active"),
  ]);

  const actor = profiles?.find((profile) => profile.id === actorId);
  const target = profiles?.find((profile) => profile.id === targetId);
  if (!actor || !target) return { error: "Profile unavailable" };

  if (friendship) {
    return actor.allow_friend_messages && target.allow_friend_messages
      ? { kind: "accepted", groupId: null }
      : { error: "Friend messages are disabled" };
  }

  if (!target.allow_group_message_requests || !actorMemberships?.length) {
    return { error: "This member is not accepting message requests" };
  }

  const { data: activeGroups } = await admin
    .from("community_groups")
    .select("id")
    .in("id", actorMemberships.map((row) => row.group_id))
    .eq("status", "active");
  const activeGroupIds = (activeGroups ?? []).map((group) => group.id);
  if (activeGroupIds.length === 0) {
    return { error: "Only friends and eligible group members can message this person" };
  }

  const { data: sharedMembership } = await admin
    .from("community_group_memberships")
    .select("group_id")
    .eq("profile_id", targetId)
    .eq("status", "active")
    .in("group_id", activeGroupIds)
    .limit(1)
    .maybeSingle();

  return sharedMembership
    ? { kind: "pending", groupId: sharedMembership.group_id }
    : { error: "Only friends and eligible group members can message this person" };
}
