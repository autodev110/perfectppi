import { requireRole } from "@/features/auth/guards";
import { getConversations, getMessageRecipientsDirectory, getMessageRequests } from "@/features/messages/queries";
import { MessagesCenter } from "@/components/shared/messages-center";

export default async function MessagesPage() {
  const profile = await requireRole(["consumer"]);

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
      routeBase="/dashboard/messages"
      title="Messages"
      description="Direct messages with technicians and other users."
    />
  );
}
