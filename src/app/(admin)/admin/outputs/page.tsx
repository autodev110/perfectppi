import Link from "next/link";
import { getAdminOutputs } from "@/features/admin/queries";
import { listHeldReports } from "@/features/outputs/report-review";
import { regionLabel } from "@/features/ppi/report-review";
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
  const [{ outputs, totalStandardized, totalVsc, pendingVsc }, held] = await Promise.all([getAdminOutputs(), listHeldReports()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.outputs_e7ce99764a")}</h1>
        <p className="text-muted-foreground">
          {totalStandardized}{uiText("ui.standardized_outputs_d0bddd71c4")}{totalVsc}{uiText("ui.vsc_outputs_cbe01da5ea")}{pendingVsc}{uiText("ui.waiting_for_vsc_34b9633a5a")}</p>
      </div>

      {held.length > 0 ? (
        <section className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div>
            <h2 className="font-semibold">{uiText("ui.held_for_review_a08b6757bc")}{held.length})</h2>
            <p className="text-sm text-muted-foreground">{uiText("ui.these_reports_did_not_fit_the_two_page_layou_e8e7afdb4c")}</p>
          </div>
          <ul className="divide-y rounded-md border bg-background">
            {held.map((report) => (
              <li key={report.outputId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">
                    {report.vehicleLabel}{uiText("ui.v_63e470a096")}{report.outputVersion}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {report.hold === "needs_review"
                      ? report.report.review_reasons
                          .filter((reason) => reason.startsWith("layout_overflow:"))
                          .map((reason) => regionLabel(reason.replace("layout_overflow:", "")))
                          .join(", ")
                      : report.job?.error ?? uiText("ui.final_render_failed_bef2b817ff")}
                    {" · "}
                    {formatDateTime(report.generatedAt)}
                  </p>
                </div>
                <Link href={`/admin/outputs/${report.outputId}/review`} className="font-medium text-primary">{uiText("ui.review_aff0766a52")}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
