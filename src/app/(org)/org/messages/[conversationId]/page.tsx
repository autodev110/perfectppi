import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { getConversation } from "@/features/messages/queries";
import { markConversationRead } from "@/features/messages/actions";
import { ConversationThread } from "@/components/shared/conversation-thread";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function OrgConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const uiText = await getRequestTranslator();
  const profile = await requireRole(["org_manager"]);
  const { conversationId } = await params;
  const { m: highlightMessageId } = await searchParams;

  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.conversation_not_available_c36b915172")}</h1>
        <p className="text-sm text-muted-foreground">{uiText("ui.this_thread_was_not_found_or_you_do_not_have_d9ff8a9d08")}</p>
        <Link href="/org/messages" className="text-sm font-medium text-primary hover:underline">{uiText("ui.back_to_messages_ecf510349b")}</Link>
      </div>
    );
  }

  await markConversationRead(conversationId);

  return (
    <ConversationThread
      conversationId={conversationId}
      routeBase="/org/messages"
      myProfileId={profile.id}
      participants={conversation.participants}
      listingContext={conversation.listing_context}
      messages={conversation.messages}
      requestStatus={conversation.request_status}
      requestedBy={conversation.requested_by}
      initialCanSend={conversation.can_send}
      sendUnavailableReason={conversation.send_unavailable_reason}
      highlightMessageId={highlightMessageId}
    />
  );
}
