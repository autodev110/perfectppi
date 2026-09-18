import { formatDate } from "@/lib/utils/formatting";
import {
  formatAnswer,
  inspectionAge,
  inspectionCaveat,
  inspectionScopeLabel,
  sectionLabel,
  type InspectionReport,
} from "@/lib/marketplace/inspection-report";
import { AlertTriangle, EyeOff, ImageOff } from "lucide-react";
import { t as uiText } from "@/lib/i18n";

// The redacted inspection (plan 25.3). Scope and age come first so an old or
// limited inspection cannot be mistaken for a current comprehensive one;
// withheld items are named by prompt, never by value. No score, no pass/fail.
export function InspectionReportCard({ report, preview = false }: { report: InspectionReport; preview?: boolean }) {
  const age = inspectionAge(report.inspected_at);
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{uiText("ui.scope_b073f6c68e")}</dt>
          <dd className="font-semibold">{inspectionScopeLabel(report.scope)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{uiText("ui.inspected_f855b0a61e")}</dt>
          <dd className={`font-semibold ${age.stale ? "text-warning" : ""}`}>{formatDate(report.inspected_at)} · {age.label}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{uiText("ui.performed_by_6d8145caee")}</dt>
          <dd className="font-semibold">{report.performed_by}</dd>
        </div>
      </dl>
      <p className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${age.stale || report.scope === "dents_tires" ? "bg-warning/10 text-on-surface" : "bg-surface-container text-on-surface-variant"}`}>
        {age.stale || report.scope === "dents_tires" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" /> : null}
        <span>{inspectionCaveat(report.scope, age)}</span>
      </p>

      <div className="divide-y divide-outline-variant/40 rounded-2xl bg-surface-container-lowest ghost-border">
        {report.sections.map((section) => {
          const hidden = section.withheld.length + (section.notes_withheld ? 1 : 0);
          return (
            <details key={section.section_type} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold">
                <span>{sectionLabel(section.section_type)}</span>
                <span className="text-xs font-semibold text-on-surface-variant">
                  {section.completion_state !== "completed" ? uiText("ui.not_completed_66e2e816e4") : ""}
                  {section.items.length}{uiText("ui.finding_9d6bf81148")}{section.items.length === 1 ? "" : uiText("ui.s_043a718774")}
                  {hidden > 0 ? uiText("ui.withheld_361c035e19", { arg0: String(hidden) }) : ""}
                </span>
              </summary>
              <div className="mt-3 space-y-2">
                {section.items.length > 0 ? (
                  <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                    {section.items.map((item) => (
                      <div key={item.prompt} className="flex justify-between gap-4">
                        <dt className="text-on-surface-variant">{item.prompt}</dt>
                        <dd className="shrink-0 text-right font-semibold">{formatAnswer(item)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-on-surface-variant">{uiText("ui.no_structured_findings_were_recorded_in_this_0468b3a806")}</p>
                )}
                {section.withheld.length > 0 ? (
                  <p className="flex items-start gap-1.5 text-xs text-on-surface-variant">
                    <EyeOff className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{preview ? uiText("ui.withheld_from_buyers_1fb2c0827f") : uiText("ui.not_shared_f8a76298d2")}: {section.withheld.join("; ")}</span>
                  </p>
                ) : null}
                {section.notes_withheld ? (
                  <p className="flex items-center gap-1.5 text-xs text-on-surface-variant"><EyeOff className="h-3 w-3" />{uiText("ui.technician_notes_for_this_section_are_ceaca20a36")}{preview ? uiText("ui.withheld_from_buyers_132ee13713") : uiText("ui.not_shared_9f40a20e35")}.</p>
                ) : null}
                {section.media_count > 0 ? (
                  <p className="flex items-center gap-1.5 text-xs text-on-surface-variant"><ImageOff className="h-3 w-3" />{section.media_count}{uiText("ui.photo_c6d30c8447")}{section.media_count === 1 ? "" : uiText("ui.s_043a718774")} {preview ? uiText("ui.stay_private_aa5422d7af") : uiText("ui.not_shared_9f40a20e35")}.</p>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
      <p className="text-[11px] text-on-surface-variant">
        {report.withheld_count}{uiText("ui.item_a5f3c2e9f9")}{report.withheld_count === 1 ? "" : uiText("ui.s_043a718774")}{uiText("ui.and_e3ee915a8e")}{report.media_count}{uiText("ui.photo_c6d30c8447")}{report.media_count === 1 ? "" : uiText("ui.s_043a718774")}{uiText("ui.are_withheld_free_text_notes_media_the_vin_a_2715c41ca1")}</p>
    </div>
  );
}
