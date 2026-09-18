import { getAdminOutputs } from "@/features/admin/queries";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/formatting";

import { getRequestTranslator } from "@/lib/i18n/server";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ready: "secondary",
  pending_vsc: "outline",
};

export default async function OutputsPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);
  const { outputs, totalStandardized, totalVsc, pendingVsc } = await getAdminOutputs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.outputs_e7ce99764a")}</h1>
        <p className="text-muted-foreground">
          {totalStandardized}{uiText("ui.standardized_outputs_d0bddd71c4")}{totalVsc}{uiText("ui.vsc_outputs_cbe01da5ea")}{pendingVsc}{uiText("ui.waiting_for_vsc_34b9633a5a")}</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.vehicle_a62394ba4a")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.ppi_type_18f86212e0")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.submission_8d11f7f3b3")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.version_dd167905de")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.standardized_59bf88ad05")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.vsc_85f1f3f6e0")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.status_920e413c7d")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.generated_827ec8d9f9")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {outputs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">{uiText("ui.no_outputs_generated_yet_8b93f4fe9f")}</td>
              </tr>
            ) : (
              outputs.map((output) => (
                <tr key={output.standardizedOutputId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{output.vehicleLabel}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {output.vin ?? uiText("ui.vin_unavailable_30b9362e98")}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {(output.ppiType ?? uiText("ui.unknown_b23a6a8439")).replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {output.submissionId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{uiText("ui.v_4c94485e0c")}{output.version}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {output.standardizedOutputId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {output.vscOutputId ? output.vscOutputId.slice(0, 8) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[output.status] ?? "outline"}>
                      {output.status === "ready" ? uiText("ui.ready_5fa7aac537") : uiText("ui.waiting_for_vsc_d1f5d85f18")}
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
