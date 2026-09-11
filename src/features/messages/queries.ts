import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { generatePresignedGetUrl, isPrivateStorageReference } from "@/lib/storage/r2";
import { canProfilesInteract, getBlockedProfileIds } from "@/features/social/relationships";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

async function authorizeAttachment(message: MessageRow): Promise<MessageRow> {
  if (!message.attachment_url || !isPrivateStorageReference(message.attachment_url)) return message;
  return {
    ...message,
    attachment_url: await generatePresignedGetUrl(message.attachment_url, 900),
  };
}

type ConversationProfile = Pick<
  ProfileRow,
  "id" | "display_name" | "username" | "avatar_url" | "role"
>;

/**
 * The marketplace listing a thread is about, when it was started from a
 * "Contact Seller" click. Drives the "· 2019 Toyota Supra" half of a
 * conversation title on both web and iOS.
 */
export interface ConversationListingContext {
  listing_id: string;
  title: string | null;
  vehicle_id: string | null;
  vehicle_label: string | null;
}

export interface ConversationSummary {
  id: string;
  created_at: string;
  participants: ConversationProfile[];
  other_participants: ConversationProfile[];
  listing_context: ConversationListingContext | null;
  last_message: Pick<
    MessageRow,
    "id" | "sender_id" | "content" | "status" | "created_at" | "has_attachment"
  > | null;
  unread_count: number;
  request_status: "pending" | "accepted";
  requested_by: string | null;
}

export interface ConversationThread {
  id: string;
  created_at: string;
  participants: ConversationProfile[];
  listing_context: ConversationListingContext | null;
  messages: MessageRow[];
  request_status: "pending" | "accepted";
  requested_by: string | null;
}

export interface MessageRecipient {
  id: string;
  display_name: string | null;
  username: string | null;
  role: ProfileRow["role"];
  contact_mode: "message" | "request";
  shared_group_name: string | null;
}

async function getMyProfileId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, profileId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  return { supabase, profileId: profile?.id ?? null };
}

/**
 * Resolves listing id -> car label for conversation titles. Uses the admin
 * client because the buyer must still see which car a thread is about after
 * the seller marks the listing sold or archived, which the public
 * `listings_select_active` policy hides.
 */
async function getListingContexts(
  listingIds: string[],
): Promise<Map<string, ConversationListingContext>> {
  const byId = new Map<string, ConversationListingContext>();
  if (listingIds.length === 0) return byId;

  const admin = createAdminClient();
  const { data: listings } = await admin
    .from("marketplace_listings")
    .select("id, title, vehicle_id, vehicles(year, make, model, trim)")
    .in("id", listingIds);

  for (const listing of listings ?? []) {
    const vehicle = listing.vehicles as {
      year: number | null;
      make: string | null;
      model: string | null;
      trim: string | null;
    } | null;

    const vehicleLabel =
      [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim]
        .filter(Boolean)
        .join(" ") || null;

    byId.set(listing.id, {
      listing_id: listing.id,
      title: listing.title,
      vehicle_id: listing.vehicle_id,
      vehicle_label: vehicleLabel,
    });
  }

  return byId;
}

async function getConversationBox(
  box: "inbox" | "requests",
  limit = 50,
): Promise<ConversationSummary[]> {
  const { supabase, profileId } = await getMyProfileId();
  if (!profileId) return [];

  const { data: myMemberships } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("profile_id", profileId)
    .limit(Math.max(limit * 4, 100));

  const conversationIds = (myMemberships ?? []).map((row) => row.conversation_id);
  if (conversationIds.length === 0) return [];

  // Authorization is already settled above: `conversationIds` only contains
  // threads this profile is a participant of. Everything below reads with the
  // admin client because the `profiles` SELECT policy is own-or-public-only —
  // under the user client a counterparty with `is_public = false` returns no
  // row, the participant list comes back empty, and every thread in the list
  // renders as the generic "Conversation" instead of the people in it.
  const admin = createAdminClient();

  const [{ data: conversations }, { data: memberships }, { data: messages }] = await Promise.all([
    admin
      .from("conversations")
      .select("id, created_at, marketplace_listing_id, request_status, requested_by")
      .in("id", conversationIds)
      .order("created_at", { ascending: false }),
    admin
      .from("conversation_participants")
      .select("conversation_id, profile_id")
      .in("conversation_id", conversationIds),
    admin
      .from("messages")
      .select("id, conversation_id, sender_id, content, status, created_at, has_attachment")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
  ]);

  if (!conversations || conversations.length === 0) return [];
  const visibleConversations = conversations.filter((conversation) => (
    box === "requests"
      ? conversation.request_status === "pending" && conversation.requested_by !== profileId
      : conversation.request_status === "accepted"
        || (conversation.request_status === "pending" && conversation.requested_by === profileId)
  ));
  if (visibleConversations.length === 0) return [];
  const visibleConversationIds = new Set(visibleConversations.map((conversation) => conversation.id));

  const profileIds = Array.from(
    new Set((memberships ?? []).map((row) => row.profile_id)),
  );

  const [{ data: profiles }, listingContexts] = await Promise.all([
    profileIds.length
      ? admin
          .from("profiles")
          .select("id, display_name, username, avatar_url, role")
          .in("id", profileIds)
      : Promise.resolve({ data: [] as ConversationProfile[] }),
    getListingContexts(
      Array.from(
        new Set(
          conversations
            .map((conversation) => conversation.marketplace_listing_id)
            .filter((id): id is string => !!id),
        ),
      ),
    ),
  ]);

  const profileById = new Map<string, ConversationProfile>();
  for (const profile of profiles ?? []) {
    profileById.set(profile.id, profile);
  }

  const membershipsByConversation = new Map<string, string[]>();
  for (const membership of memberships ?? []) {
    const list = membershipsByConversation.get(membership.conversation_id) ?? [];
    list.push(membership.profile_id);
    membershipsByConversation.set(membership.conversation_id, list);
  }

  const firstMessageByConversation = new Map<string, Pick<
    MessageRow,
    "id" | "sender_id" | "content" | "status" | "created_at" | "has_attachment"
  >>();

  const unreadCountByConversation = new Map<string, number>();

  for (const message of messages ?? []) {
    if (!firstMessageByConversation.has(message.conversation_id)) {
      firstMessageByConversation.set(message.conversation_id, {
        id: message.id,
        sender_id: message.sender_id,
        content: message.content,
        status: message.status,
        created_at: message.created_at,
        has_attachment: message.has_attachment,
      });
    }

    if (message.status === "unread" && message.sender_id !== profileId) {
      const current = unreadCountByConversation.get(message.conversation_id) ?? 0;
      unreadCountByConversation.set(message.conversation_id, current + 1);
    }
  }

  const summaries = visibleConversations.map((conversation) => {
    const memberIds = membershipsByConversation.get(conversation.id) ?? [];
    const participants = memberIds
      .map((id) => profileById.get(id))
      .filter((p): p is ConversationProfile => !!p);

    const otherParticipants = participants.filter((p) => p.id !== profileId);

    return {
      id: conversation.id,
      created_at: conversation.created_at,
      participants,
      other_participants: otherParticipants,
      listing_context: conversation.marketplace_listing_id
        ? listingContexts.get(conversation.marketplace_listing_id) ?? null
        : null,
      last_message: firstMessageByConversation.get(conversation.id) ?? null,
      unread_count: unreadCountByConversation.get(conversation.id) ?? 0,
      request_status: conversation.request_status as "pending" | "accepted",
      requested_by: conversation.requested_by,
    };
  });

  const dedupedByParticipantSet = new Map<string, ConversationSummary>();
  for (const summary of summaries) {
    if (box === "requests" && !summary.last_message) continue;
    const memberIds = membershipsByConversation.get(summary.id) ?? [];
    const key = [...memberIds].sort().join(":");
    const current = dedupedByParticipantSet.get(key);
    const currentActivityAt = current?.last_message?.created_at ?? current?.created_at ?? "";
    const nextActivityAt = summary.last_message?.created_at ?? summary.created_at;

    if (!current || nextActivityAt > currentActivityAt) {
      dedupedByParticipantSet.set(key, summary);
    }
  }

  const blockedIds = await getBlockedProfileIds(
    profileId,
    Array.from(dedupedByParticipantSet.values()).flatMap((summary) => summary.other_participants.map((profile) => profile.id)),
  );

  return Array.from(dedupedByParticipantSet.values())
    .filter((summary) => visibleConversationIds.has(summary.id))
    .filter((summary) => summary.other_participants.every((profile) => !blockedIds.has(profile.id)))
    .sort((a, b) => {
    const aActivityAt = a.last_message?.created_at ?? a.created_at;
    const bActivityAt = b.last_message?.created_at ?? b.created_at;
    return new Date(bActivityAt).getTime() - new Date(aActivityAt).getTime();
    })
    .slice(0, limit);
}

export async function getConversations(limit = 50) {
  return getConversationBox("inbox", limit);
}

export async function getMessageRequests(limit = 50) {
  return getConversationBox("requests", limit);
}

export async function getMessageRecipientsDirectory(limit = 100): Promise<MessageRecipient[]> {
  const { profileId } = await getMyProfileId();
  if (!profileId) return [];

  const admin = createAdminClient();
  const [{ data }, { data: me }, { data: myFriendships }, { data: myGroups }] = await Promise.all([
    admin
    .from("profiles")
    .select("id, display_name, username, role, allow_friend_messages, allow_group_message_requests")
    .neq("id", profileId)
    .eq("discoverable", true)
    .eq("username_state", "claimed")
    .order("display_name", { ascending: true, nullsFirst: false })
    .limit(Math.max(limit * 3, 100)),
    admin.from("profiles").select("allow_friend_messages").eq("id", profileId).single(),
    admin
      .from("friend_relationships")
      .select("profile_low_id, profile_high_id")
      .eq("status", "friends")
      .or(`profile_low_id.eq.${profileId},profile_high_id.eq.${profileId}`),
    admin
      .from("community_group_memberships")
      .select("group_id")
      .eq("profile_id", profileId)
      .eq("status", "active"),
  ]);

  const rawProfiles = data ?? [];
  const friendIds = new Set((myFriendships ?? []).map((row) => (
    row.profile_low_id === profileId ? row.profile_high_id : row.profile_low_id
  )));
  const groupIds = (myGroups ?? []).map((row) => row.group_id);
  const [{ data: sharedMemberships }, { data: sharedGroups }] = await Promise.all([
    groupIds.length && rawProfiles.length
      ? admin
          .from("community_group_memberships")
          .select("profile_id, group_id")
          .in("profile_id", rawProfiles.map((profile) => profile.id))
          .in("group_id", groupIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] as Array<{ profile_id: string; group_id: string }> }),
    groupIds.length
      ? admin.from("community_groups").select("id, name").in("id", groupIds).eq("status", "active")
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  const groupNameById = new Map((sharedGroups ?? []).map((group) => [group.id, group.name]));
  const firstSharedGroupByProfile = new Map<string, string>();
  for (const membership of sharedMemberships ?? []) {
    if (!firstSharedGroupByProfile.has(membership.profile_id)) {
      firstSharedGroupByProfile.set(membership.profile_id, membership.group_id);
    }
  }
  const profiles = rawProfiles.flatMap<MessageRecipient>((profile) => {
    const isFriend = friendIds.has(profile.id);
    const sharedGroupId = firstSharedGroupByProfile.get(profile.id);
    if (isFriend && me?.allow_friend_messages && profile.allow_friend_messages) {
      return [{ ...profile, contact_mode: "message" as const, shared_group_name: null }];
    }
    if (sharedGroupId && profile.allow_group_message_requests) {
      return [{
        ...profile,
        contact_mode: "request" as const,
        shared_group_name: groupNameById.get(sharedGroupId) ?? "a shared group",
      }];
    }
    return [];
  });
  const [blockedIds, { data: enforcementActions }] = await Promise.all([
    getBlockedProfileIds(profileId, profiles.map((profile) => profile.id)),
    profiles.length
      ? admin
          .from("user_enforcement_actions")
          .select("profile_id, starts_at, ends_at")
          .in("profile_id", profiles.map((profile) => profile.id))
          .in("action_type", ["suspension", "ban"])
      : Promise.resolve({ data: [] as Array<{ profile_id: string; starts_at: string; ends_at: string | null }> }),
  ]);
  const now = Date.now();
  const unavailableIds = new Set((enforcementActions ?? [])
    .filter((action) => new Date(action.starts_at).getTime() <= now && (!action.ends_at || new Date(action.ends_at).getTime() > now))
    .map((action) => action.profile_id));
  return profiles
    .filter((profile) => !blockedIds.has(profile.id) && !unavailableIds.has(profile.id))
    .slice(0, limit);
}

export async function getConversation(conversationId: string): Promise<ConversationThread | null> {
  const { profileId } = await getMyProfileId();
  if (!profileId) return null;

  const admin = createAdminClient();

  // Authorize using explicit membership check against authenticated profile id.
  // This avoids false 404s when RLS policies on conversation tables are stricter
  // than expected during immediate post-create redirects.
  const { data: membership } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!membership) return null;

  const { data: counterpartRows } = await admin
    .from("conversation_participants")
    .select("profile_id")
    .eq("conversation_id", conversationId)
    .neq("profile_id", profileId);
  const canOpen = await Promise.all(
    (counterpartRows ?? []).map((row) => canProfilesInteract(profileId, row.profile_id)),
  );
  if (canOpen.some((allowed) => !allowed)) return null;

  const [{ data: conversation }, { data: participants }, { data: messages }] = await Promise.all([
    admin
      .from("conversations")
      .select("id, created_at, marketplace_listing_id, request_status, requested_by")
      .eq("id", conversationId)
      .maybeSingle(),
    admin
      .from("conversation_participants")
      .select("profile_id")
      .eq("conversation_id", conversationId),
    admin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
  ]);

  if (!conversation || conversation.request_status === "declined") return null;

  const participantIds = Array.from(new Set((participants ?? []).map((p) => p.profile_id)));
  const [{ data: profiles }, listingContexts] = await Promise.all([
    participantIds.length
      ? admin
          .from("profiles")
          .select("id, display_name, username, avatar_url, role")
          .in("id", participantIds)
      : Promise.resolve({ data: [] as ConversationProfile[] }),
    getListingContexts(
      conversation.marketplace_listing_id ? [conversation.marketplace_listing_id] : [],
    ),
  ]);

  return {
    id: conversation.id,
    created_at: conversation.created_at,
    participants: (profiles ?? []) as ConversationProfile[],
    listing_context: conversation.marketplace_listing_id
      ? listingContexts.get(conversation.marketplace_listing_id) ?? null
      : null,
    messages: await Promise.all(((messages ?? []) as MessageRow[]).map(authorizeAttachment)),
    request_status: conversation.request_status as "pending" | "accepted",
    requested_by: conversation.requested_by,
  };
}

export async function getConversationMessages(conversationId: string): Promise<MessageRow[]> {
  const thread = await getConversation(conversationId);
  return thread?.messages ?? [];
}

export async function getMessageRecipients(conversationId: string): Promise<string[]> {
  const { supabase, profileId } = await getMyProfileId();
  if (!profileId) return [];

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("profile_id")
    .eq("conversation_id", conversationId);

  return (participants ?? [])
    .map((p) => p.profile_id)
    .filter((id) => id !== profileId);
}

export interface AdminCommunicationRow {
  conversation_id: string;
  created_at: string;
  participant_count: number;
  message_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  raw_conversation_count: number;
}

export async function getAdminCommunications(limit = 100): Promise<AdminCommunicationRow[]> {
  const admin = createAdminClient();

  const [{ data: conversations }, { data: participantRows }, { data: messageRows }] = await Promise.all([
    admin
      .from("conversations")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("conversation_participants")
      .select("conversation_id, profile_id"),
    admin
      .from("messages")
      .select("conversation_id, content, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const participantsByConversation = new Map<string, string[]>();
  for (const row of participantRows ?? []) {
    const ids = participantsByConversation.get(row.conversation_id) ?? [];
    ids.push(row.profile_id);
    participantsByConversation.set(row.conversation_id, ids);
  }

  const messageCount = new Map<string, number>();
  const lastMessageAt = new Map<string, string>();
  const lastMessagePreview = new Map<string, string>();

  for (const row of messageRows ?? []) {
    messageCount.set(
      row.conversation_id,
      (messageCount.get(row.conversation_id) ?? 0) + 1,
    );

    if (!lastMessageAt.has(row.conversation_id)) {
      lastMessageAt.set(row.conversation_id, row.created_at);
      lastMessagePreview.set(row.conversation_id, row.content);
    }
  }

  const grouped = new Map<string, AdminCommunicationRow>();
  for (const conversation of conversations ?? []) {
    const participantIds = participantsByConversation.get(conversation.id) ?? [];
    const key = [...participantIds].sort().join(":");
    const row: AdminCommunicationRow = {
      conversation_id: conversation.id,
      created_at: conversation.created_at,
      participant_count: participantIds.length,
      message_count: messageCount.get(conversation.id) ?? 0,
      last_message_at: lastMessageAt.get(conversation.id) ?? null,
      last_message_preview: lastMessagePreview.get(conversation.id) ?? null,
      raw_conversation_count: 1,
    };

    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, row);
      continue;
    }

    const currentActivityAt = current.last_message_at ?? current.created_at;
    const rowActivityAt = row.last_message_at ?? row.created_at;
    grouped.set(key, {
      conversation_id: rowActivityAt > currentActivityAt
        ? row.conversation_id
        : current.conversation_id,
      created_at: rowActivityAt > currentActivityAt ? row.created_at : current.created_at,
      participant_count: Math.max(current.participant_count, row.participant_count),
      message_count: current.message_count + row.message_count,
      last_message_at: rowActivityAt > currentActivityAt
        ? row.last_message_at
        : current.last_message_at,
      last_message_preview: rowActivityAt > currentActivityAt
        ? row.last_message_preview
        : current.last_message_preview,
      raw_conversation_count: current.raw_conversation_count + row.raw_conversation_count,
    });
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const aActivityAt = a.last_message_at ?? a.created_at;
    const bActivityAt = b.last_message_at ?? b.created_at;
    return new Date(bActivityAt).getTime() - new Date(aActivityAt).getTime();
  });
}
