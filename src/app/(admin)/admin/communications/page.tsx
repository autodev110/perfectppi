import { MessageSquare, Users, MessagesSquare } from "lucide-react";
import { getAdminCommunications } from "@/features/messages/queries";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

function shortPreview(value: string | null): string {
  if (!value) return uiText("ui.no_messages_yet_f42e0f6601");
  return value.length > 90 ? `${value.slice(0, 90)}...` : value;
}

export default async function CommunicationsPage() {
  const uiText = await getRequestTranslator();
  const rows = await getAdminCommunications(100);

  const totalConversations = rows.length;
  const totalMessages = rows.reduce((sum, row) => sum + row.message_count, 0);
  const avgParticipants = totalConversations
    ? Math.round(
        rows.reduce((sum, row) => sum + row.participant_count, 0) / totalConversations,
      )
    : 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-1">{uiText("ui.communications_919a92533f")}</h1>
        <p className="text-on-surface-variant text-sm font-medium">{uiText("ui.platform_wide_conversations_and_message_acti_956a730a4d")}</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">{uiText("ui.conversations_1d432f5869")}</p>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-black text-on-surface">{totalConversations}</p>
            <div className="bg-secondary-container p-2 rounded-lg">
              <MessageSquare className="h-5 w-5 text-on-surface-variant" />
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">{uiText("ui.messages_04d7b48339")}</p>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-black text-on-surface">{totalMessages}</p>
            <div className="bg-tertiary-container p-2 rounded-lg">
              <MessagesSquare className="h-5 w-5 text-on-surface-variant" />
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">{uiText("ui.avg_participants_a8700e95bf")}</p>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-black text-on-surface">{avgParticipants}</p>
            <div className="bg-emerald-100 p-2 rounded-lg">
              <Users className="h-5 w-5 text-on-surface-variant" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10">
          <h2 className="font-bold text-on-surface">{uiText("ui.recent_conversations_8a2a072156")}</h2>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-on-surface-variant">{uiText("ui.no_conversations_yet_52a8737366")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10">
                <th className="px-6 py-3">{uiText("ui.conversation_id_ef8609709a")}</th>
                <th className="px-6 py-3">{uiText("ui.participants_0e27279b33")}</th>
                <th className="px-6 py-3">{uiText("ui.messages_04d7b48339")}</th>
                <th className="px-6 py-3 hidden lg:table-cell">{uiText("ui.last_preview_7fbda423a2")}</th>
                <th className="px-6 py-3">{uiText("ui.last_activity_2c68c3c796")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {rows.map((row) => (
                <tr key={row.conversation_id}>
                  <td className="px-6 py-3 font-mono text-xs text-on-surface-variant">
                    <span>{row.conversation_id.slice(0, 8)}...</span>
                    {row.raw_conversation_count > 1 ? (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        {row.raw_conversation_count}{uiText("ui.merged_899044b70f")}</span>
                    ) : null}
                  </td>
                  <td className="px-6 py-3 text-on-surface">{row.participant_count}</td>
                  <td className="px-6 py-3 text-on-surface">{row.message_count}</td>
                  <td className="px-6 py-3 text-on-surface-variant hidden lg:table-cell max-w-sm truncate">
                    {shortPreview(row.last_message_preview)}
                  </td>
                  <td className="px-6 py-3 text-on-surface-variant text-xs">
                    {row.last_message_at
                      ? new Date(row.last_message_at).toLocaleString()
                      : uiText("ui.no_activity_0cf9505f9f")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
