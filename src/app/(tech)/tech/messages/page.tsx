import { requireRole } from "@/features/auth/guards";
import { getConversations, getMessageRecipientsDirectory } from "@/features/messages/queries";
import { MessagesCenter } from "@/components/shared/messages-center";

export default async function TechMessagesPage() {
  await requireRole(["technician"]);

  const [conversations, recipients] = await Promise.all([
    getConversations(),
    getMessageRecipientsDirectory(),
  ]);

  return (
    <MessagesCenter
      conversations={conversations}
      recipients={recipients}
      routeBase="/tech/messages"
      title="Messages"
      description="Conversations with consumers and teammates."
    />
  );
}
