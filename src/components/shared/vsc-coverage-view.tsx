import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VscCoverageData, VscComponentDetermination } from "@/types/api";
import { Shield, ShieldCheck, ShieldX, ShieldAlert } from "lucide-react";
import { t as uiText } from "@/lib/i18n";

interface VscCoverageViewProps {
  coverage: VscCoverageData;
  generatedAt: string;
}

const eligibilityConfig: Record<
  VscCoverageData["overall_eligibility"],
  { label: string; color: string; icon: typeof Shield; bgColor: string }
> = {
  eligible: {
    label: uiText("ui.eligible_for_coverage_b8cbd7a4cf"),
    color: "text-emerald-700",
    icon: ShieldCheck,
    bgColor: "bg-emerald-50 border-emerald-200",
  },
  conditional: {
    label: uiText("ui.conditional_eligibility_59177481cb"),
    color: "text-amber-700",
    icon: ShieldAlert,
    bgColor: "bg-amber-50 border-amber-200",
  },
  ineligible: {
    label: uiText("ui.not_eligible_5c2dfa1435"),
    color: "text-red-700",
    icon: ShieldX,
    bgColor: "bg-red-50 border-red-200",
  },
};

const determinationConfig: Record<
  VscComponentDetermination["determination"],
  { label: string; color: string }
> = {
  covered: { label: uiText("ui.covered_da69bf500e"), color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  limited: { label: uiText("ui.limited_e5125d9f63"), color: "bg-amber-100 text-amber-800 border-amber-300" },
  excluded: { label: uiText("ui.excluded_bef1fd9e5c"), color: "bg-red-100 text-red-800 border-red-300" },
};

export function VscCoverageView({ coverage, generatedAt }: VscCoverageViewProps) {
  const { overall_eligibility, eligibility_summary, components } = coverage;
  const eligibility = eligibilityConfig[overall_eligibility];
  const EligibilityIcon = eligibility.icon;

  // Group components by category
  const grouped = components.reduce<Record<string, VscComponentDetermination[]>>(
    (acc, comp) => {
      (acc[comp.category] ??= []).push(comp);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-4">
      {/* Eligibility Header */}
      <Card className={cn("border", eligibility.bgColor)}>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <EligibilityIcon className={cn("h-8 w-8 shrink-0", eligibility.color)} />
            <div>
              <h3 className={cn("text-lg font-semibold", eligibility.color)}>
                {eligibility.label}
              </h3>
              <p className="text-sm mt-1 leading-relaxed">{eligibility_summary}</p>
              <p className="text-xs text-muted-foreground mt-2">{uiText("ui.generated_827ec8d9f9")}{" "}
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

      {/* Component Breakdown by Category */}
      {Object.entries(grouped).map(([category, comps]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base capitalize">{category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {comps.map((comp, idx) => {
                const det = determinationConfig[comp.determination];

                return (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{comp.component}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {comp.reasoning}
                      </p>
                      {comp.conditions.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {comp.conditions.map((cond, ci) => (
                            <li
                              key={ci}
                              className="text-xs text-muted-foreground pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:h-1 before:w-1 before:rounded-full before:bg-muted-foreground/50"
                            >
                              {cond}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0", det.color)}
                    >
                      {det.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
