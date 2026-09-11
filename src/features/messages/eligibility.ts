import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Why a pair may talk (plan 22.3, plus the product's own service contacts):
 * - friend: both are friends and allow friend messages (re-checked per send);
 * - marketplace: buyer → seller of an active listing;
 * - service: a listed technician with a public profile, an assigned
 *   inspection between the two, or colleagues in one organization;
 * - group_request: co-members of a live group, when the target accepts
 *   requests — the thread starts pending with one introduction.
 */
export type MessageContactKind = "friend" | "marketplace" | "service" | "group_request";

export type MessageEligibility =
  | { kind: "accepted"; groupId: null; contact: Exclude<MessageContactKind, "group_request"> }
  | { kind: "pending"; groupId: string; contact: "group_request" }
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
    return listing ? { kind: "accepted", groupId: null, contact: "marketplace" } : { error: "Listing unavailable" };
  }

  const lowId = actorId < targetId ? actorId : targetId;
  const highId = actorId < targetId ? targetId : actorId;
  const [{ data: profiles }, { data: friendship }, { data: actorMemberships }, { data: serviceContact }] = await Promise.all([
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
    admin.rpc("social_service_contact_allowed", { p_actor_id: actorId, p_target_id: targetId }),
  ]);

  const actor = profiles?.find((profile) => profile.id === actorId);
  const target = profiles?.find((profile) => profile.id === targetId);
  if (!actor || !target) return { error: "Profile unavailable" };

  if (friendship) {
    if (actor.allow_friend_messages && target.allow_friend_messages) {
      return { kind: "accepted", groupId: null, contact: "friend" };
    }
    if (serviceContact !== true) return { error: "Friend messages are disabled" };
  }

  if (serviceContact === true) return { kind: "accepted", groupId: null, contact: "service" };

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
    ? { kind: "pending", groupId: sharedMembership.group_id, contact: "group_request" }
    : { error: "Only friends and eligible group members can message this person" };
}
