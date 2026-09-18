import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { StandardizedContent, StandardizedSection, StandardizedFinding } from "@/types/api";
import { AlertTriangle, CheckCircle2, Download, Info, XCircle } from "lucide-react";
import { t as uiText } from "@/lib/i18n";

interface StandardizedOutputViewProps {
  content: StandardizedContent;
  generatedAt: string;
  documentUrl?: string | null;
}

const ratingConfig: Record<
  StandardizedSection["condition_rating"],
  { label: string; color: string }
> = {
  excellent: { label: uiText("ui.excellent_0dc8ee555c"), color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  good: { label: uiText("ui.good_c939327ca1"), color: "bg-green-100 text-green-800 border-green-300" },
  fair: { label: uiText("ui.fair_f7b19afcde"), color: "bg-amber-100 text-amber-800 border-amber-300" },
  poor: { label: uiText("ui.poor_94dfd46d9d"), color: "bg-red-100 text-red-800 border-red-300" },
  not_applicable: { label: uiText("ui.n_a_e2f79e5b60"), color: "bg-slate-100 text-slate-600 border-slate-300" },
};

const severityConfig: Record<
  StandardizedFinding["severity"],
  { icon: typeof Info; color: string }
> = {
  info: { icon: Info, color: "text-slate-500" },
  minor: { icon: Info, color: "text-blue-500" },
  moderate: { icon: AlertTriangle, color: "text-amber-500" },
  major: { icon: AlertTriangle, color: "text-orange-600" },
  critical: { icon: XCircle, color: "text-red-600" },
};

export function StandardizedOutputView({ content, generatedAt, documentUrl }: StandardizedOutputViewProps) {
  const { vehicle, performer, sections, diagnostics, overall_summary, notable_findings } = content;

  const vehicleName = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ") || uiText("ui.unknown_vehicle_615ff95383");

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">{vehicleName}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{uiText("ui.pre_purchase_inspection_report_5ffc92ad89")}</p>
            </div>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="h-3 w-3 mr-1" />{uiText("ui.ai_generated_3049a7c3c5")}</Badge>
            {documentUrl ? (
              <a
                href={documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                <Download className="mr-1.5 h-3 w-3" />{uiText("ui.download_pdf_6183be0883")}</a>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {vehicle.vin && (
              <div>
                <p className="text-muted-foreground text-xs">{uiText("ui.vin_5e0211b12d")}</p>
                <p className="font-mono font-medium text-xs">{vehicle.vin}</p>
              </div>
            )}
            {vehicle.mileage && (
              <div>
                <p className="text-muted-foreground text-xs">{uiText("ui.mileage_ffe44a0179")}</p>
                <p className="font-medium">{vehicle.mileage.toLocaleString()}{uiText("ui.mi_3074dbe604")}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">{uiText("ui.inspector_da188e3b1c")}</p>
              <p className="font-medium">{performer.display_name ?? uiText("ui.self_85bc0f9585")}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{uiText("ui.generated_827ec8d9f9")}</p>
              <p className="font-medium">
                {new Date(generatedAt).toLocaleDateString(uiText("ui.en_us_5c49f88daf"), {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overall Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{uiText("ui.overall_summary_0224bd6aee")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">{overall_summary}</p>

          {notable_findings.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">{uiText("ui.notable_findings_d8c402ef3a")}</p>
                <ul className="space-y-1">
                  {notable_findings.map((finding, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                      <span>{finding}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {diagnostics?.obd_snapshot_present && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{uiText("ui.obd_ii_diagnostics_14e9eb5f82")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {diagnostics.vin && (
                <div>
                  <p className="text-muted-foreground text-xs">{uiText("ui.reported_vin_47e93994cb")}</p>
                  <p className="font-mono font-medium text-xs">{diagnostics.vin}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs">{uiText("ui.mil_a573ba6931")}</p>
                <p className="font-medium">
                  {diagnostics.mil_on === null ? uiText("ui.unknown_b764cdc0ea") : diagnostics.mil_on ? uiText("ui.on_1300117561") : uiText("ui.off_ca7981b46e")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{uiText("ui.stored_dtcs_ccca83de06")}</p>
                <p className="font-medium">
                  {diagnostics.stored_dtcs.length ? diagnostics.stored_dtcs.join(", ") : uiText("ui.none_dc937b5989")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{uiText("ui.pending_dtcs_fcfa4c0623")}</p>
                <p className="font-medium">
                  {diagnostics.pending_dtcs.length ? diagnostics.pending_dtcs.join(", ") : uiText("ui.none_dc937b5989")}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{diagnostics.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Section Cards */}
      {sections.map((section) => {
        const rating = ratingConfig[section.condition_rating];

        return (
          <Card key={section.section_type}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{section.section_label}</CardTitle>
                <Badge variant="outline" className={cn(rating.color)}>
                  {rating.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{section.summary}</p>

              {section.findings.length > 0 && (
                <div className="space-y-2">
                  {section.findings.map((finding, idx) => {
                    const sev = severityConfig[finding.severity];
                    const SevIcon = sev.icon;

                    return (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <SevIcon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", sev.color)} />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">{finding.prompt}</p>
                          <p className="font-medium">{finding.answer}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {section.notes && (
                <p className="text-xs text-muted-foreground italic">{uiText("ui.note_4ced86a042")}{section.notes}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
