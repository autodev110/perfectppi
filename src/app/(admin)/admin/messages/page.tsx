import { requireRole } from "@/features/auth/guards";
import { getConversations, getMessageRecipientsDirectory, getMessageRequests } from "@/features/messages/queries";
import { MessagesCenter } from "@/components/shared/messages-center";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function AdminMessagesPage() {
  const uiText = await getRequestTranslator();
  const profile = await requireRole(["admin"]);

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
      routeBase="/admin/messages"
      title={uiText("ui.messages_04d7b48339")}
      description={uiText("ui.direct_messages_across_platform_users_133a5472b9")}
    />
  );
}
