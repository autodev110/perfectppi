import { requireRole } from "@/features/auth/guards";
import { getConversations, getMessageRecipientsDirectory, getMessageRequests } from "@/features/messages/queries";
import { MessagesCenter } from "@/components/shared/messages-center";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function MessagesPage() {
  const uiText = await getRequestTranslator();
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
      title={uiText("ui.messages_04d7b48339")}
      description={uiText("ui.direct_messages_with_technicians_and_other_u_4beda644e2")}
    />
  );
}
