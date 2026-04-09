import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { StandardizedContent, StandardizedSection, StandardizedFinding } from "@/types/api";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

interface StandardizedOutputViewProps {
  content: StandardizedContent;
  generatedAt: string;
}

const ratingConfig: Record<
  StandardizedSection["condition_rating"],
  { label: string; color: string }
> = {
  excellent: { label: "Excellent", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  good: { label: "Good", color: "bg-green-100 text-green-800 border-green-300" },
  fair: { label: "Fair", color: "bg-amber-100 text-amber-800 border-amber-300" },
  poor: { label: "Poor", color: "bg-red-100 text-red-800 border-red-300" },
  not_applicable: { label: "N/A", color: "bg-slate-100 text-slate-600 border-slate-300" },
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

export function StandardizedOutputView({ content, generatedAt }: StandardizedOutputViewProps) {
  const { vehicle, performer, sections, overall_summary, notable_findings } = content;

  const vehicleName = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ") || "Unknown Vehicle";

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">{vehicleName}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Pre-Purchase Inspection Report
              </p>
            </div>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              AI Generated
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {vehicle.vin && (
              <div>
                <p className="text-muted-foreground text-xs">VIN</p>
                <p className="font-mono font-medium text-xs">{vehicle.vin}</p>
              </div>
            )}
            {vehicle.mileage && (
              <div>
                <p className="text-muted-foreground text-xs">Mileage</p>
                <p className="font-medium">{vehicle.mileage.toLocaleString()} mi</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">Inspector</p>
              <p className="font-medium">{performer.display_name ?? "Self"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Generated</p>
              <p className="font-medium">
                {new Date(generatedAt).toLocaleDateString("en-US", {
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
          <CardTitle className="text-base">Overall Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">{overall_summary}</p>

          {notable_findings.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Notable Findings
                </p>
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
                <p className="text-xs text-muted-foreground italic">
                  Note: {section.notes}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
