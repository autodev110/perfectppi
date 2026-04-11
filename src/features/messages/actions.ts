"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createConversationSchema = z.object({
  participantId: z.string().uuid(),
});

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
  attachmentUrl: z.string().url().optional(),
  attachmentType: z.string().trim().min(1).max(255).optional(),
});

async function getAuthProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return null;
  return { supabase, profile };
}

export async function createConversation(input: { participantId: string }) {
  const parsed = createConversationSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid participant" };

  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const { profile } = auth;
  const admin = createAdminClient();
  const participantId = parsed.data.participantId;

  if (participantId === profile.id) {
    return { error: "Cannot start a conversation with yourself" };
  }

  const { data: participant } = await admin
    .from("profiles")
    .select("id")
    .eq("id", participantId)
    .maybeSingle();

  if (!participant) return { error: "Participant not found" };

  // Use the admin client for the existence check so recursive RLS policies
  // on conversation_participants don't mask existing threads and cause
  // duplicate conversations between the same pair of users.
  const [{ data: mine }, { data: theirs }] = await Promise.all([
    admin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("profile_id", profile.id),
    admin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("profile_id", participantId),
  ]);

  const mineSet = new Set((mine ?? []).map((row) => row.conversation_id));
  const sharedConversationIds = (theirs ?? [])
    .map((row) => row.conversation_id)
    .filter((id) => mineSet.has(id));

  if (sharedConversationIds.length > 0) {
    const [{ data: existingConversations }, { data: existingMessages }] = await Promise.all([
      admin
        .from("conversations")
        .select("id, created_at")
        .in("id", sharedConversationIds),
      admin
        .from("messages")
        .select("conversation_id, created_at")
        .in("conversation_id", sharedConversationIds)
        .order("created_at", { ascending: false }),
    ]);

    const conversationCreatedAt = new Map(
      (existingConversations ?? []).map((conversation) => [
        conversation.id,
        conversation.created_at,
      ]),
    );
    const latestMessageAt = new Map<string, string>();
    for (const message of existingMessages ?? []) {
      if (!latestMessageAt.has(message.conversation_id)) {
        latestMessageAt.set(message.conversation_id, message.created_at);
      }
    }

    const existingConversationId = [...sharedConversationIds].sort((a, b) => {
      const aActivityAt = latestMessageAt.get(a) ?? conversationCreatedAt.get(a) ?? "";
      const bActivityAt = latestMessageAt.get(b) ?? conversationCreatedAt.get(b) ?? "";
      return new Date(bActivityAt).getTime() - new Date(aActivityAt).getTime();
    })[0];

    return { data: { conversationId: existingConversationId, existing: true } };
  }

  // Create both conversation + participants with admin client.
  // Reason: conversations SELECT policy requires participant membership,
  // so insert(...).select() with user client can fail before participants exist.
  const { data: conversation, error: convoErr } = await admin
    .from("conversations")
    .insert({})
    .select("id")
    .single();

  if (convoErr || !conversation) {
    console.error("createConversation: failed to insert conversation", convoErr);
    return { error: "Failed to create conversation" };
  }

  const { error: participantErr } = await admin
    .from("conversation_participants")
    .insert([
      { conversation_id: conversation.id, profile_id: profile.id },
      { conversation_id: conversation.id, profile_id: participantId },
    ]);

  if (participantErr) {
    console.error("createConversation: failed to add participants", participantErr);
    return { error: "Failed to add participants" };
  }

  revalidatePath("/dashboard/messages");
  revalidatePath("/tech/messages");
  revalidatePath("/org/messages");
  revalidatePath("/admin/messages");

  return { data: { conversationId: conversation.id, existing: false } };
}

export async function sendMessage(input: {
  conversationId: string;
  content: string;
  attachmentUrl?: string;
  attachmentType?: string;
}) {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid message payload" };

  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const { profile } = auth;
  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", parsed.data.conversationId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!membership) return { error: "Not authorized for this conversation" };

  const hasAttachment = !!parsed.data.attachmentUrl;

  const { data: message, error: msgErr } = await admin
    .from("messages")
    .insert({
      conversation_id: parsed.data.conversationId,
      sender_id: profile.id,
      content: parsed.data.content,
      has_attachment: hasAttachment,
      attachment_url: parsed.data.attachmentUrl ?? null,
      attachment_type: parsed.data.attachmentType ?? null,
      status: "unread",
    })
    .select("*")
    .single();

  if (msgErr || !message) {
    console.error("sendMessage: failed to insert message", msgErr);
    return { error: "Failed to send message" };
  }

  const { data: recipients } = await admin
    .from("conversation_participants")
    .select("profile_id")
    .eq("conversation_id", parsed.data.conversationId)
    .neq("profile_id", profile.id);

  if (recipients && recipients.length > 0) {
    const senderName = profile.display_name || "New message";
    const preview = parsed.data.content.length > 100
      ? `${parsed.data.content.slice(0, 100)}...`
      : parsed.data.content;

    await admin.from("notifications").insert(
      recipients.map((r) => ({
        user_id: r.profile_id,
        type: "message_received" as const,
        title: `${senderName}`,
        body: preview,
        data: {
          conversation_id: parsed.data.conversationId,
          message_id: message.id,
        },
      })),
    );
  }

  revalidatePath(`/dashboard/messages/${parsed.data.conversationId}`);
  revalidatePath(`/tech/messages/${parsed.data.conversationId}`);
  revalidatePath(`/org/messages/${parsed.data.conversationId}`);
  revalidatePath(`/admin/messages/${parsed.data.conversationId}`);
  revalidatePath("/dashboard/messages");
  revalidatePath("/tech/messages");
  revalidatePath("/org/messages");
  revalidatePath("/admin/messages");

  return { data: message };
}

export async function markConversationRead(conversationId: string) {
  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const { supabase, profile } = auth;

  const { data: membership } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!membership) return { error: "Not authorized" };

  const admin = createAdminClient();
  const readAt = new Date().toISOString();
  const { error } = await admin
    .from("messages")
    .update({ status: "read" })
    .eq("conversation_id", conversationId)
    .neq("sender_id", profile.id)
    .eq("status", "unread");

  if (error) return { error: "Failed to update messages" };

  const { error: notificationErr } = await admin
    .from("notifications")
    .update({ read_at: readAt })
    .eq("user_id", profile.id)
    .eq("type", "message_received")
    .is("read_at", null)
    .contains("data", { conversation_id: conversationId });

  if (notificationErr) {
    console.error("markConversationRead: failed to mark message notifications read", notificationErr);
  }

  // Intentionally no revalidatePath: this action is called from server
  // components during render (ConversationPage), where revalidatePath is
  // unsupported. The thread refreshes itself via realtime/polling, and
  // the messages list re-renders on next navigation.

  return { success: true };
}
