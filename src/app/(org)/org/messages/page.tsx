import { requireRole } from "@/features/auth/guards";
import { getConversations, getMessageRecipientsDirectory, getMessageRequests } from "@/features/messages/queries";
import { MessagesCenter } from "@/components/shared/messages-center";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function OrgMessagesPage() {
  const uiText = await getRequestTranslator();
  const profile = await requireRole(["org_manager"]);

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
      routeBase="/org/messages"
      title={uiText("ui.messages_04d7b48339")}
      description={uiText("ui.conversations_with_technicians_consumers_and_39457e8fd2")}
    />
  );
}
