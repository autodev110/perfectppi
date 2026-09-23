import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/features/auth/guards";
import { loadHeldReport, loadReleasedReport, reviewToken } from "@/features/outputs/report-review";
import {
  REVIEW_ATTESTATION,
  REVIEW_LIMITS,
  regionLabel,
  reviewDraft,
  urgentRefs,
} from "@/features/ppi/report-review";
import { CORNER_LABELS, PANEL_LABELS } from "@/features/ppi/inspection-schema";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/formatting";
import { getRequestTranslator } from "@/lib/i18n/server";
import { HeldReportEditor, type ReferenceFinding } from "./held-report-editor";

const ACTION_ORDER = { urgent: 0, service_recommended: 1, monitor: 2, none: 3 } as const;

export default async function HeldReportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);
  const { id } = await params;
  const held = await loadHeldReport(id);

  if (!held) {
    const released = await loadReleasedReport(id);
    return (
      <div className="space-y-4">
        <Link href="/admin/outputs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{uiText("ui.outputs_e7ce99764a")}</Link>
        {released ? (
          <section className="max-w-3xl space-y-2 rounded-lg border border-emerald-600/30 bg-emerald-50 p-4 text-sm dark:bg-emerald-950/30">
            <h1 className="font-heading text-xl font-bold">
              {`${released.vehicleLabel} · v${released.outputVersion}`}
            </h1>
            <p>
              {uiText("ui.released_rewritten_0eb0160db4", { arg0: String(formatDateTime(released.resolution.resolved_at)), arg1: String(released.resolution.edited_regions.map(regionLabel).join(", ") || uiText("ui.nothing_the_stored_text_already_fit_cc40361554")) })}
            </p>
            <p className="text-muted-foreground">
              {released.documentStored
                ? uiText("ui.the_report_files_are_stored_and_downloads_us_543b9ccb1b")
                : released.job?.status === "failed"
                  ? uiText("ui.storing_the_report_files_failed_downloads_re_d733cbc8f4", { arg0: String(released.job.error?.replace(/\.$/, "") ?? uiText("ui.unknown_error_3e4443e522")) })
                  : uiText("ui.the_report_files_are_being_generated_downloa_599e590816")}
            </p>
            <a href={`/api/outputs/${released.outputId}/pdf`} className="font-medium text-primary">{uiText("ui.download_the_released_pdf_61f0f069bc")}</a>
          </section>
        ) : (
          <p className="text-muted-foreground">{uiText("ui.this_report_is_not_held_for_review_it_may_al_f62241d741")}</p>
        )}
      </div>
    );
  }

  const report = held.report;
  const overflowing = report.review_reasons
    .filter((reason) => reason.startsWith("layout_overflow:"))
    .map((reason) => reason.replace("layout_overflow:", ""));
  const findings: ReferenceFinding[] = report.assessment.findings
    .filter((finding) => finding.review_state !== "rejected" && finding.action !== "none")
    .sort((a, b) => ACTION_ORDER[a.action] - ACTION_ORDER[b.action])
    .map((finding) => ({
      ref: finding.ref,
      title: finding.title,
      action: finding.action,
      observation: finding.observation,
      nextStep: finding.next_step,
      where: [
        ...finding.corners.map((corner) => CORNER_LABELS[corner]),
        ...finding.panels.map((panel) => PANEL_LABELS[panel]),
      ].join(", "),
    }));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/admin/outputs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{uiText("ui.outputs_e7ce99764a")}</Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-bold">{uiText("ui.review_held_report_7250386bb3")}</h1>
          <Badge variant="destructive">
            {held.hold === "needs_review" ? uiText("ui.text_does_not_fit_9ae08e0097") : uiText("ui.final_render_failed_bef2b817ff")}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {held.vehicleLabel} · {held.vin ?? uiText("ui.vin_unavailable_30b9362e98")}{uiText("ui.v_63e470a096")}{held.outputVersion} · {formatDateTime(held.generatedAt)}
        </p>
        <p className="max-w-3xl text-sm text-muted-foreground">{uiText("ui.this_version_did_not_fit_the_two_page_report_41088097d9")}</p>
      </div>

      <section className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <h2 className="text-sm font-semibold">{uiText("ui.why_it_was_held_16e65db58b")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {overflowing.map((region) => (
            <li key={region}>{regionLabel(region)}{uiText("ui.does_not_fit_its_space_on_the_page_2e0b21d95c")}</li>
          ))}
          {held.hold === "render_failed" && held.job?.error ? <li className="font-mono text-xs">{held.job.error}</li> : null}
        </ul>
        {held.hold === "render_failed" ? (
          <p className="text-sm text-muted-foreground">{uiText("ui.the_final_render_failed_after_the_text_was_f_e095c0d009")}</p>
        ) : null}
      </section>

      <HeldReportEditor
        outputId={held.outputId}
        token={reviewToken(held)}
        draft={reviewDraft(report)}
        overflowing={overflowing}
        urgentRefs={urgentRefs(report)}
        findings={findings}
        blockTitles={Object.fromEntries(report.overview.map((block) => [block.category, regionLabel(`overview.${block.category}`)]))}
        limits={REVIEW_LIMITS}
        attestation={REVIEW_ATTESTATION}
      />
    </div>
  );
}
