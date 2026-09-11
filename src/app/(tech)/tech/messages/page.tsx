import { requireRole } from "@/features/auth/guards";
import { getConversations, getMessageRecipientsDirectory, getMessageRequests } from "@/features/messages/queries";
import { MessagesCenter } from "@/components/shared/messages-center";

export default async function TechMessagesPage() {
  const profile = await requireRole(["technician", "org_manager"]);

  const [conversations, requests, recipients] = await Promise.all([
    getConversations(),
    getMessageRequests(),
    getMessageRecipientsDirectory(),
  ]);

  return (
    <MessagesCenter
      conversations={conversations}
      requests={requests}
      recipients={recipients}
      myProfileId={profile.id}
      routeBase="/tech/messages"
      title="Messages"
      description="Conversations with consumers and teammates."
    />
  );
}
