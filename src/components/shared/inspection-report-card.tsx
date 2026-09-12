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

// The redacted inspection (plan 25.3). Scope and age come first so an old or
// limited inspection cannot be mistaken for a current comprehensive one;
// withheld items are named by prompt, never by value. No score, no pass/fail.
export function InspectionReportCard({ report, preview = false }: { report: InspectionReport; preview?: boolean }) {
  const age = inspectionAge(report.inspected_at);
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Scope</dt>
          <dd className="font-semibold">{inspectionScopeLabel(report.scope)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Inspected</dt>
          <dd className={`font-semibold ${age.stale ? "text-warning" : ""}`}>{formatDate(report.inspected_at)} · {age.label}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Performed by</dt>
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
                  {section.completion_state !== "completed" ? "Not completed · " : ""}
                  {section.items.length} finding{section.items.length === 1 ? "" : "s"}
                  {hidden > 0 ? ` · ${hidden} withheld` : ""}
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
                  <p className="text-xs text-on-surface-variant">No structured findings were recorded in this section.</p>
                )}
                {section.withheld.length > 0 ? (
                  <p className="flex items-start gap-1.5 text-xs text-on-surface-variant">
                    <EyeOff className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{preview ? "Withheld from buyers" : "Not shared"}: {section.withheld.join("; ")}</span>
                  </p>
                ) : null}
                {section.notes_withheld ? (
                  <p className="flex items-center gap-1.5 text-xs text-on-surface-variant"><EyeOff className="h-3 w-3" />Technician notes for this section are {preview ? "withheld from buyers" : "not shared"}.</p>
                ) : null}
                {section.media_count > 0 ? (
                  <p className="flex items-center gap-1.5 text-xs text-on-surface-variant"><ImageOff className="h-3 w-3" />{section.media_count} photo{section.media_count === 1 ? "" : "s"} {preview ? "stay private" : "not shared"}.</p>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
      <p className="text-[11px] text-on-surface-variant">
        {report.withheld_count} item{report.withheld_count === 1 ? "" : "s"} and {report.media_count} photo{report.media_count === 1 ? "" : "s"} are withheld: free-text notes, media, the VIN, and anything naming people, plates, addresses, or phones. PerfectPPI does not summarize inspections into a score or a pass/fail.
      </p>
    </div>
  );
}
