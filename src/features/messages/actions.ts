"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uploadedUrlSchema } from "@/features/uploads/url";
import { generatePresignedGetUrl, isPrivateStorageReference } from "@/lib/storage/r2";
import { canProfilesInteract } from "@/features/social/relationships";
import { resolveMessageEligibility } from "@/features/messages/eligibility";

const createConversationSchema = z.object({
  participantId: z.string().uuid(),
  // Set when the thread is started from a marketplace "Contact Seller" click,
  // so the conversation can be titled with the car being discussed.
  marketplaceListingId: z.string().uuid().optional(),
});

const messageRequestDecisionSchema = z.object({
  conversationId: z.string().uuid(),
  decision: z.enum(["accept", "decline"]),
});

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().max(4000),
  attachmentUrl: uploadedUrlSchema.optional(),
  attachmentType: z.string().trim().min(1).max(255).optional(),
}).superRefine((value, context) => {
  if (!value.content && !value.attachmentUrl) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Add a message or attachment" });
  }
  if (value.attachmentUrl && !value.attachmentType) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Attachment type is required" });
  }
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

export type CreateConversationResult =
  | { error: string; data?: undefined }
  | {
      error?: undefined;
      data: {
        conversationId: string;
        existing: boolean;
        /** True when this call pointed the thread at a different listing. */
        listingChanged: boolean;
        requestStatus: "pending" | "accepted";
      };
    };

export async function createConversation(input: {
  participantId: string;
  marketplaceListingId?: string;
}): Promise<CreateConversationResult> {
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

  if (!await canProfilesInteract(profile.id, participantId)) {
    return { error: "Profile unavailable" };
  }

  const [{ data: participant }, { data: participantAvailable }] = await Promise.all([
    admin.from("profiles").select("id").eq("id", participantId).maybeSingle(),
    admin.rpc("social_profile_is_available", { p_profile_id: participantId }),
  ]);

  if (!participant || !participantAvailable) return { error: "Profile unavailable" };

  const eligibility = await resolveMessageEligibility(
    profile.id,
    participantId,
    parsed.data.marketplaceListingId,
  );
  if ("error" in eligibility) return { error: eligibility.error };

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

  const listingId = parsed.data.marketplaceListingId ?? null;

  if (sharedConversationIds.length > 0) {
    const [{ data: existingConversations }, { data: existingMessages }] = await Promise.all([
      admin
        .from("conversations")
        .select("id, created_at, marketplace_listing_id, participant_low_id, participant_high_id, request_status, requested_by, request_context_group_id")
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

    const canonicalConversations = (existingConversations ?? []).filter(
      (conversation) => conversation.participant_low_id && conversation.participant_high_id,
    );
    const candidateConversationIds = canonicalConversations.length > 0
      ? canonicalConversations.map((conversation) => conversation.id)
      : sharedConversationIds;
    const existingConversationId = [...candidateConversationIds].sort((a, b) => {
      const aActivityAt = latestMessageAt.get(a) ?? conversationCreatedAt.get(a) ?? "";
      const bActivityAt = latestMessageAt.get(b) ?? conversationCreatedAt.get(b) ?? "";
      return new Date(bActivityAt).getTime() - new Date(aActivityAt).getTime();
    })[0];

    // Threads are deduped per pair of people, so re-contacting the same seller
    // about a different car lands in the existing thread. Repoint it at the
    // listing now being discussed so the title stays accurate, and tell the
    // caller it moved so it can post a fresh intro message.
    const existingConversation = existingConversations?.find(
      (conversation) => conversation.id === existingConversationId,
    );
    const previousListingId = existingConversation?.marketplace_listing_id ?? null;

    const listingChanged = !!listingId && listingId !== previousListingId;
    const eligibilityPromoted = eligibility.kind === "accepted"
      && existingConversation?.request_status !== "accepted";
    if (listingChanged || eligibilityPromoted) {
      const { error: updateError } = await admin
        .from("conversations")
        .update({
          ...(listingChanged ? { marketplace_listing_id: listingId } : {}),
          request_status: "accepted",
          request_context_group_id: null,
          request_resolved_at: new Date().toISOString(),
        })
        .eq("id", existingConversationId);
      if (updateError) return { error: "Failed to update conversation" };
    }

    if (existingConversation?.request_status === "declined" && !eligibilityPromoted && !listingId) {
      return { error: "This message request was declined" };
    }

    return {
      data: {
        conversationId: existingConversationId,
        existing: true,
        listingChanged,
        requestStatus: listingChanged || eligibilityPromoted
          ? "accepted"
          : existingConversation?.request_status === "pending"
            ? "pending"
            : "accepted",
      },
    };
  }

  // This internal RPC locks the profile pair and creates the conversation and
  // both participants atomically. That prevents concurrent devices from
  // manufacturing multiple one-introduction request threads.
  const { data: conversationRows, error: convoErr } = await admin.rpc(
    "create_direct_conversation_internal",
    {
      p_actor_id: profile.id,
      p_target_id: participantId,
      p_marketplace_listing_id: listingId,
      p_request_status: eligibility.kind,
      p_request_context_group_id: eligibility.groupId,
    },
  );
  const conversation = conversationRows?.[0];

  if (convoErr || !conversation) {
    console.error("createConversation: failed to create conversation", convoErr);
    return { error: "Failed to create conversation" };
  }

  if (!conversation.was_created) {
    const { data: racedConversation } = await admin
      .from("conversations")
      .select("marketplace_listing_id, request_status")
      .eq("id", conversation.conversation_id)
      .single();
    if (!racedConversation) return { error: "Failed to load conversation" };

    const listingChanged = !!listingId
      && racedConversation.marketplace_listing_id !== listingId;
    const eligibilityPromoted = eligibility.kind === "accepted"
      && racedConversation.request_status !== "accepted";
    if (listingChanged || eligibilityPromoted) {
      const { error: updateError } = await admin
        .from("conversations")
        .update({
          ...(listingChanged ? { marketplace_listing_id: listingId } : {}),
          request_status: "accepted",
          request_context_group_id: null,
          request_resolved_at: new Date().toISOString(),
        })
        .eq("id", conversation.conversation_id);
      if (updateError) return { error: "Failed to update conversation" };
    } else if (racedConversation.request_status === "declined" && !listingId) {
      return { error: "This message request was declined" };
    }

    return {
      data: {
        conversationId: conversation.conversation_id,
        existing: true,
        listingChanged,
        requestStatus: listingChanged || eligibilityPromoted
          ? "accepted"
          : racedConversation.request_status === "pending"
            ? "pending"
            : "accepted",
      },
    };
  }

  revalidatePath("/dashboard/messages");
  revalidatePath("/tech/messages");
  revalidatePath("/org/messages");
  revalidatePath("/admin/messages");

  return {
    data: {
      conversationId: conversation.conversation_id,
      existing: false,
      listingChanged: !!listingId,
      requestStatus: eligibility.kind,
    },
  };
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
    .select("conversation_id, conversations(request_status, requested_by, marketplace_listing_id, request_context_group_id)")
    .eq("conversation_id", parsed.data.conversationId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!membership) return { error: "Not authorized for this conversation" };

  const conversation = membership.conversations as {
    request_status: string;
    requested_by: string | null;
    marketplace_listing_id: string | null;
    request_context_group_id: string | null;
  } | null;
  if (!conversation || conversation.request_status === "declined") {
    return { error: "Conversation unavailable" };
  }
  if (conversation.request_status === "pending") {
    if (conversation.requested_by !== profile.id) {
      return { error: "Accept the message request before replying" };
    }
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", parsed.data.conversationId);
    if ((count ?? 0) > 0) return { error: "Your message request is awaiting a response" };
  }

  const { data: participants } = await admin
    .from("conversation_participants")
    .select("profile_id")
    .eq("conversation_id", parsed.data.conversationId)
    .neq("profile_id", profile.id);
  if (!participants?.length) return { error: "Conversation unavailable" };
  const allowed = await Promise.all(
    participants.map((participant) => canProfilesInteract(profile.id, participant.profile_id)),
  );
  if (allowed.some((value) => !value)) return { error: "Conversation unavailable" };

  if (conversation.request_status === "pending") {
    const eligibility = await resolveMessageEligibility(
      profile.id,
      participants[0].profile_id,
    );
    if (
      "error" in eligibility
      || eligibility.kind !== "pending"
      || eligibility.groupId !== conversation.request_context_group_id
    ) {
      return { error: "This message request is no longer available" };
    }
  }

  // New direct friend conversations remain subject to both participants'
  // current privacy settings. Marketplace, accepted group requests, and
  // legacy conversations keep their established access rules.
  if (
    conversation.request_status === "accepted"
    && conversation.requested_by
    && !conversation.marketplace_listing_id
    && !conversation.request_context_group_id
  ) {
    const eligibility = await resolveMessageEligibility(
      profile.id,
      participants[0].profile_id,
    );
    if ("error" in eligibility || eligibility.kind !== "accepted") {
      return { error: "Friend messages are disabled" };
    }
  }

  const hasAttachment = !!parsed.data.attachmentUrl;
  if (parsed.data.attachmentUrl) {
    const expectedPrefix = `r2-private:///message_attachment/${profile.id}/${parsed.data.conversationId}/`;
    if (!parsed.data.attachmentUrl.startsWith(expectedPrefix)) {
      return { error: "Attachment upload is invalid" };
    }
  }

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

  const recipients = participants;

  if (recipients && recipients.length > 0) {
    const senderName = profile.display_name || "New message";
    const isRequest = conversation.request_status === "pending";
    const notificationText = isRequest
      ? "Sent you a message request"
      : parsed.data.content || "Sent an attachment";
    const preview = notificationText.length > 100
      ? `${notificationText.slice(0, 100)}...`
      : notificationText;

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

  const attachmentUrl = message.attachment_url && isPrivateStorageReference(message.attachment_url)
    ? await generatePresignedGetUrl(message.attachment_url, 900)
    : message.attachment_url;
  return { data: { ...message, attachment_url: attachmentUrl } };
}

export async function markConversationRead(conversationId: string) {
  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const { supabase, profile } = auth;

  const { data: membership } = await supabase
    .from("conversation_participants")
    .select("conversation_id, conversations(request_status, requested_by)")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!membership) return { error: "Not authorized" };
  const conversation = membership.conversations as {
    request_status: string;
    requested_by: string | null;
  } | null;
  if (!conversation || conversation.request_status === "declined") return { error: "Not authorized" };
  if (conversation.request_status === "pending" && conversation.requested_by !== profile.id) {
    return { success: true };
  }

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

export async function decideMessageRequest(input: {
  conversationId: string;
  decision: "accept" | "decline";
}) {
  const parsed = messageRequestDecisionSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid message request decision" };

  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };
  const { profile } = auth;
  const admin = createAdminClient();

  const { data: conversation } = await admin
    .from("conversations")
    .select("id, request_status, requested_by, request_context_group_id, conversation_participants(profile_id)")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  const participants = (conversation?.conversation_participants ?? []) as Array<{ profile_id: string }>;
  if (
    !conversation
    || conversation.request_status !== "pending"
    || conversation.requested_by === profile.id
    || !participants.some((participant) => participant.profile_id === profile.id)
  ) {
    return { error: "Message request unavailable" };
  }

  if (parsed.data.decision === "accept" && conversation.requested_by) {
    if (!await canProfilesInteract(profile.id, conversation.requested_by)) {
      return { error: "Message request unavailable" };
    }
    const eligibility = await resolveMessageEligibility(
      conversation.requested_by,
      profile.id,
    );
    const stillEligible = !("error" in eligibility) && (
      eligibility.kind === "accepted"
      || (
        eligibility.kind === "pending"
        && eligibility.groupId === conversation.request_context_group_id
      )
    );
    if (!stillEligible) return { error: "This message request is no longer available" };
  }

  const nextStatus = parsed.data.decision === "accept" ? "accepted" : "declined";
  const { data: updated, error } = await admin
    .from("conversations")
    .update({ request_status: nextStatus, request_resolved_at: new Date().toISOString() })
    .eq("id", parsed.data.conversationId)
    .eq("request_status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !updated) return { error: "Message request was already handled" };

  if (nextStatus === "accepted" && conversation.requested_by) {
    await admin.from("notifications").insert({
      user_id: conversation.requested_by,
      type: "message_received",
      title: profile.display_name || "Message request accepted",
      body: "Accepted your message request",
      data: { conversation_id: conversation.id },
    });
  }

  await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", profile.id)
    .eq("type", "message_received")
    .is("read_at", null)
    .contains("data", { conversation_id: conversation.id });

  revalidatePath("/dashboard/messages");
  revalidatePath("/tech/messages");
  revalidatePath("/org/messages");
  revalidatePath("/admin/messages");
  return { data: { conversationId: conversation.id, status: nextStatus } };
}
