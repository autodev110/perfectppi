import { MessageSquare, Users, MessagesSquare } from "lucide-react";
import { getAdminCommunications } from "@/features/messages/queries";

function shortPreview(value: string | null): string {
  if (!value) return "No messages yet";
  return value.length > 90 ? `${value.slice(0, 90)}...` : value;
}

export default async function CommunicationsPage() {
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
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-1">
          Communications
        </h1>
        <p className="text-on-surface-variant text-sm font-medium">
          Platform-wide conversations and message activity
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">
            Conversations
          </p>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-black text-on-surface">{totalConversations}</p>
            <div className="bg-secondary-container p-2 rounded-lg">
              <MessageSquare className="h-5 w-5 text-on-surface-variant" />
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">
            Messages
          </p>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-black text-on-surface">{totalMessages}</p>
            <div className="bg-tertiary-container p-2 rounded-lg">
              <MessagesSquare className="h-5 w-5 text-on-surface-variant" />
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">
            Avg Participants
          </p>
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
          <h2 className="font-bold text-on-surface">Recent Conversations</h2>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-on-surface-variant">
            No conversations yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10">
                <th className="px-6 py-3">Conversation ID</th>
                <th className="px-6 py-3">Participants</th>
                <th className="px-6 py-3">Messages</th>
                <th className="px-6 py-3 hidden lg:table-cell">Last Preview</th>
                <th className="px-6 py-3">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {rows.map((row) => (
                <tr key={row.conversation_id}>
                  <td className="px-6 py-3 font-mono text-xs text-on-surface-variant">
                    <span>{row.conversation_id.slice(0, 8)}...</span>
                    {row.raw_conversation_count > 1 ? (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        {row.raw_conversation_count} merged
                      </span>
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
                      : "No activity"}
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
