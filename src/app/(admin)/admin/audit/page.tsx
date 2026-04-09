import { getAdminAuditLogs } from "@/features/admin/queries";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/formatting";

const ACTION_LABELS: Record<string, string> = {
  inspection_edited: "Inspection Edited",
  output_regenerated: "Output Regenerated",
  contract_state_changed: "Contract State Changed",
  payment_state_changed: "Payment State Changed",
  submission_resubmitted: "Submission Resubmitted",
};

export default async function AuditLogPage() {
  await requireRole(["admin"]);
  const { logs, total } = await getAdminAuditLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">{total} total audit entries</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">Actor</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
              <th className="px-4 py-3 text-left font-medium">Target</th>
              <th className="px-4 py-3 text-left font-medium">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No audit log entries yet.
                </td>
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
