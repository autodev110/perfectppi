import { requireRole } from "@/features/auth/guards";
import { getConversations, getMessageRecipientsDirectory } from "@/features/messages/queries";
import { MessagesCenter } from "@/components/shared/messages-center";

export default async function AdminMessagesPage() {
  const profile = await requireRole(["admin"]);

  const [conversations, recipients] = await Promise.all([
    getConversations(),
    getMessageRecipientsDirectory(),
  ]);

  return (
    <MessagesCenter
      conversations={conversations}
      recipients={recipients}
      myProfileId={profile.id}
      routeBase="/admin/messages"
      title="Messages"
      description="Direct messages across platform users."
    />
  );
}

