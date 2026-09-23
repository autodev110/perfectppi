import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { InspectionReportV2 } from "@/features/ppi/inspection-report";
import { CORNERS, CORNER_LABELS } from "@/features/ppi/inspection-schema";
import { CATEGORY_TITLES } from "@/features/ppi/inspection-report";
import { AlertTriangle, CheckCircle2, CircleHelp, ShieldCheck } from "lucide-react";
import { t as uiText } from "@/lib/i18n";


// The complete digital detail behind the two-page report: every accepted
// finding with its next step, per-tire readings, limitations and the
// inspector's certification. Nothing here is capped for space.

const STATUS_STYLES: Record<string, string> = {
  urgent: "border-red-600 bg-red-50 text-red-900",
  service_recommended: "border-orange-500 bg-orange-50 text-orange-900",
  monitor: "border-amber-400 bg-amber-50 text-amber-900",
  none: "border-slate-300 bg-slate-50 text-slate-700",
};

const STATUS_LABEL: Record<string, string> = {
  urgent: uiText("ui.urgent_1b015904cc"),
  service_recommended: uiText("ui.service_recommended_0805ec6e68"),
  monitor: uiText("ui.monitor_4c2e1df457"),
  none: uiText("ui.recorded_c7175fa7a0"),
};

const CARD_STATUS: Record<string, string> = {
  checked: uiText("ui.checked_0efd92a335"),
  monitor: uiText("ui.monitor_4c2e1df457"),
  service: uiText("ui.service_d677190e0a"),
  urgent: uiText("ui.urgent_1b015904cc"),
  unknown: uiText("ui.unknown_b764cdc0ea"),
  not_inspected: uiText("ui.not_inspected_4b96e27390"),
  not_applicable: "N/A",
  outside_scope: uiText("ui.outside_scope_cce01708a4"),
};

export function ReportV2Findings({ report }: { report: InspectionReportV2 }) {
  const findings = report.assessment.findings;
  const categories = [...new Set(findings.map((finding) => finding.category))];
  const certification = report.facts.certification;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{uiText("ui.condition_findings_d6b4500b8e")}</CardTitle>
        <p className="text-sm text-muted-foreground">{report.priority_actions}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {CORNERS.map((corner) => {
            const card = report.assessment.tires[corner];
            return (
              <div key={corner} className="rounded-xl border p-3 text-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold">{CORNER_LABELS[corner]}</p>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {CARD_STATUS[card.status] ?? card.status}{card.partial ? "*" : ""}
                  </span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-muted-foreground">{uiText("ui.tread_5b4f5c8af6")}</dt><dd>{card.tread}</dd>
                  <dt className="text-muted-foreground">{uiText("ui.pressure_1f8407f9ee")}</dt><dd>{card.pressure}</dd>
                  <dt className="text-muted-foreground">{uiText("ui.size_1af8519073")}</dt><dd>{card.size}</dd>
                  <dt className="text-muted-foreground">{uiText("ui.load_speed_8ab95e671d")}</dt><dd>{card.load_speed}</dd>
                  <dt className="text-muted-foreground">{uiText("ui.dot_4bf03efe2e")}</dt><dd>{card.dot}{card.dot_age_years !== null ? ` (about ${card.dot_age_years} yr)` : ""}</dd>
                  <dt className="text-muted-foreground">{uiText("ui.cracking_26cd8a19b9")}</dt><dd>{card.cracking}</dd>
                  <dt className="text-muted-foreground">{uiText("ui.wear_39bb722018")}</dt><dd>{card.wear}</dd>
                  <dt className="text-muted-foreground">{uiText("ui.tire_wheel_damage_3b4724ee7c")}</dt><dd>{card.tire_damage} / {card.wheel_damage}</dd>
                  <dt className="text-muted-foreground">{uiText("ui.fitment_bfa875b34a")}</dt><dd>{card.fitment_label}</dd>
                </dl>
              </div>
            );
          })}
        </div>

        {categories.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />{uiText("ui.no_condition_findings_were_recorded_cbe57bb617")}</p>
        ) : (
          categories.map((category) => (
            <section key={category} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{CATEGORY_TITLES[category]}</h3>
              <ul className="space-y-2">
                {findings.filter((finding) => finding.category === category).map((finding) => (
                  <li key={finding.finding_id} className={cn("rounded-xl border-l-4 px-3 py-2 text-sm", STATUS_STYLES[finding.action])}>
                    <p className="font-semibold">
                      <span className="mr-2 text-xs opacity-70">{finding.ref}</span>
                      {finding.title}
                      <span className="ml-2 text-xs font-medium opacity-80">{STATUS_LABEL[finding.action]}</span>
                    </p>
                    <p>{finding.observation}</p>
                    <p className="text-xs opacity-80">{finding.significance} {finding.next_step}</p>
                    {finding.review_state === "needs_review" ? (
                      <p className="mt-1 flex items-center gap-1 text-xs"><CircleHelp className="h-3 w-3" />{uiText("ui.needs_confirmation_77c23c39b0")}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {report.assessment.limitations.length > 0 ? (
          <section className="space-y-1">
            <h3 className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />{uiText("ui.not_checked_or_unavailable_8c758ccc5c")}</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
              {report.assessment.limitations.map((limitation) => (
                <li key={limitation.key}>{limitation.text}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          {certification
            ? uiText("ui.the_inspector_certified_these_observations_o_c105fb2809", { arg0: String(new Date(certification.certified_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })) })
            : uiText("ui.certification_not_recorded_for_this_historic_12964faa2e")}
        </p>
      </CardContent>
    </Card>
  );
}
