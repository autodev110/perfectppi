import { getAdminOutputs } from "@/features/admin/queries";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/formatting";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ready: "secondary",
  pending_vsc: "outline",
};

export default async function OutputsPage() {
  await requireRole(["admin"]);
  const { outputs, totalStandardized, totalVsc, pendingVsc } = await getAdminOutputs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Outputs</h1>
        <p className="text-muted-foreground">
          {totalStandardized} standardized outputs, {totalVsc} VSC outputs, {pendingVsc} waiting for VSC
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Vehicle</th>
              <th className="px-4 py-3 text-left font-medium">PPI Type</th>
              <th className="px-4 py-3 text-left font-medium">Submission</th>
              <th className="px-4 py-3 text-left font-medium">Version</th>
              <th className="px-4 py-3 text-left font-medium">Standardized</th>
              <th className="px-4 py-3 text-left font-medium">VSC</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Generated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {outputs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No outputs generated yet.
                </td>
              </tr>
            ) : (
              outputs.map((output) => (
                <tr key={output.standardizedOutputId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{output.vehicleLabel}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {output.vin ?? "VIN unavailable"}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {(output.ppiType ?? "unknown").replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {output.submissionId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">v{output.version}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {output.standardizedOutputId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {output.vscOutputId ? output.vscOutputId.slice(0, 8) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[output.status] ?? "outline"}>
                      {output.status === "ready" ? "Ready" : "Waiting for VSC"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateTime(output.standardizedGeneratedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
