import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

type ConversationProfile = Pick<
  ProfileRow,
  "id" | "display_name" | "username" | "avatar_url" | "role"
>;

export interface ConversationSummary {
  id: string;
  created_at: string;
  participants: ConversationProfile[];
  other_participants: ConversationProfile[];
  last_message: Pick<
    MessageRow,
    "id" | "sender_id" | "content" | "status" | "created_at" | "has_attachment"
  > | null;
  unread_count: number;
}

export interface ConversationThread {
  id: string;
  created_at: string;
  participants: ConversationProfile[];
  messages: MessageRow[];
}

export interface MessageRecipient {
  id: string;
  display_name: string | null;
  username: string | null;
  role: ProfileRow["role"];
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

export async function getConversations(limit = 50): Promise<ConversationSummary[]> {
  const { supabase, profileId } = await getMyProfileId();
  if (!profileId) return [];

  const { data: myMemberships } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("profile_id", profileId)
    .limit(limit);

  const conversationIds = (myMemberships ?? []).map((row) => row.conversation_id);
  if (conversationIds.length === 0) return [];

  const [{ data: conversations }, { data: memberships }, { data: messages }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, created_at")
      .in("id", conversationIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("conversation_participants")
      .select("conversation_id, profile_id")
      .in("conversation_id", conversationIds),
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, status, created_at, has_attachment")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
  ]);

  if (!conversations || conversations.length === 0) return [];

  const profileIds = Array.from(
    new Set((memberships ?? []).map((row) => row.profile_id)),
  );

  const { data: profiles } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, role")
        .in("id", profileIds)
    : { data: [] as ConversationProfile[] };

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

  const summaries = conversations.map((conversation) => {
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
      last_message: firstMessageByConversation.get(conversation.id) ?? null,
      unread_count: unreadCountByConversation.get(conversation.id) ?? 0,
    };
  });

  const dedupedByParticipantSet = new Map<string, ConversationSummary>();
  for (const summary of summaries) {
    const memberIds = membershipsByConversation.get(summary.id) ?? [];
    const key = [...memberIds].sort().join(":");
    const current = dedupedByParticipantSet.get(key);
    const currentActivityAt = current?.last_message?.created_at ?? current?.created_at ?? "";
    const nextActivityAt = summary.last_message?.created_at ?? summary.created_at;

    if (!current || nextActivityAt > currentActivityAt) {
      dedupedByParticipantSet.set(key, summary);
    }
  }

  return Array.from(dedupedByParticipantSet.values()).sort((a, b) => {
    const aActivityAt = a.last_message?.created_at ?? a.created_at;
    const bActivityAt = b.last_message?.created_at ?? b.created_at;
    return new Date(bActivityAt).getTime() - new Date(aActivityAt).getTime();
  });
}

export async function getMessageRecipientsDirectory(limit = 100): Promise<MessageRecipient[]> {
  const { profileId } = await getMyProfileId();
  if (!profileId) return [];

  // Use admin client so recipient directory is not restricted to only public profiles.
  // Messaging permissions are enforced later during conversation creation/sending flows.
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, display_name, username, role")
    .neq("id", profileId)
    .order("display_name", { ascending: true, nullsFirst: false })
    .limit(limit);

  return (data ?? []) as MessageRecipient[];
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

  const [{ data: conversation }, { data: participants }, { data: messages }] = await Promise.all([
    admin
      .from("conversations")
      .select("id, created_at")
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

  if (!conversation) return null;

  const participantIds = Array.from(new Set((participants ?? []).map((p) => p.profile_id)));
  const { data: profiles } = participantIds.length
    ? await admin
        .from("profiles")
        .select("id, display_name, username, avatar_url, role")
        .in("id", participantIds)
    : { data: [] as ConversationProfile[] };

  return {
    id: conversation.id,
    created_at: conversation.created_at,
    participants: (profiles ?? []) as ConversationProfile[],
    messages: (messages ?? []) as MessageRow[],
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
