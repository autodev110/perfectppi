import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { getConversation } from "@/features/messages/queries";
import { markConversationRead } from "@/features/messages/actions";
import { ConversationThread } from "@/components/shared/conversation-thread";

export default async function OrgConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const profile = await requireRole(["org_manager"]);
  const { conversationId } = await params;
  const { m: highlightMessageId } = await searchParams;

  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-2xl font-bold">Conversation not available</h1>
        <p className="text-sm text-muted-foreground">
          This thread was not found or you do not have access to it.
        </p>
        <Link href="/org/messages" className="text-sm font-medium text-primary hover:underline">
          Back to messages
        </Link>
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
      messages={conversation.messages}
      highlightMessageId={highlightMessageId}
    />
  );
}
