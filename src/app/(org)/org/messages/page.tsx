import { requireRole } from "@/features/auth/guards";
import { getConversations, getMessageRecipientsDirectory } from "@/features/messages/queries";
import { MessagesCenter } from "@/components/shared/messages-center";

export default async function OrgMessagesPage() {
  const profile = await requireRole(["org_manager"]);

  const [conversations, recipients] = await Promise.all([
    getConversations(),
    getMessageRecipientsDirectory(),
  ]);

  return (
    <MessagesCenter
      conversations={conversations}
      recipients={recipients}
      myProfileId={profile.id}
      routeBase="/org/messages"
      title="Messages"
      description="Conversations with technicians, consumers, and teammates."
    />
  );
}
