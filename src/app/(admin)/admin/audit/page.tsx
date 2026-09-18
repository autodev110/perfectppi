import { getAdminAuditLogs } from "@/features/admin/queries";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/formatting";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

const ACTION_LABELS: Record<string, string> = {
  inspection_edited: uiText("ui.inspection_edited_56d9e35ac6"),
  output_regenerated: uiText("ui.output_regenerated_5189df16b5"),
  contract_state_changed: uiText("ui.contract_state_changed_c6df381d4a"),
  payment_state_changed: uiText("ui.payment_state_changed_319dceb6f3"),
  submission_resubmitted: uiText("ui.submission_resubmitted_3e3e25284d"),
};

export default async function AuditLogPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);
  const { logs, total } = await getAdminAuditLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.audit_log_47751f88ed")}</h1>
        <p className="text-muted-foreground">{total}{uiText("ui.total_audit_entries_459de3eb04")}</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.time_33b93476cf")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.actor_449995c4fe")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.action_64cff1319d")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.target_978354db0c")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.metadata_9eddf573cb")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{uiText("ui.no_audit_log_entries_yet_1c349d7c04")}</td>
              </tr>
            ) : (
              logs.map((log) => {
                const actorName =
                  log.actor?.display_name ??
                  (log.actor?.username ? `@${log.actor.username}` : null) ??
                  log.actorId.slice(0, 8);

                return (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{actorName}</span>
                        {log.actor?.role && (
                          <Badge variant="outline">{log.actor.role}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">
                        {ACTION_LABELS[log.action] ?? log.action.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="capitalize">{log.targetType.replaceAll("_", " ")}</span>
                      <span className="mx-1">•</span>
                      <span className="font-mono text-xs">{log.targetId.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <code className="line-clamp-2 block max-w-[420px]">
                        {JSON.stringify(log.metadata)}
                      </code>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
