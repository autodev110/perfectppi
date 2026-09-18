import { CheckCircle2, ClipboardCheck, MessageCircleQuestion, Wrench } from "lucide-react";
import type { MemberContributionSummary } from "@/features/profiles/reputation";
import { t as uiText } from "@/lib/i18n";

export function MemberContributionSummaryCard({ summary }: { summary: MemberContributionSummary }) {
  const facts = [
    { label: uiText("ui.accepted_answers_6d0329f8c8"), value: summary.accepted_answers, icon: MessageCircleQuestion },
    { label: uiText("ui.helpful_marks_fa78fcc525"), value: summary.helpful_marks, icon: Wrench },
    { label: uiText("ui.issues_fixed_38d48dbf8e"), value: summary.fixed_issues, icon: CheckCircle2 },
    { label: uiText("ui.issues_helped_c4d8563175"), value: summary.helped_issues, icon: Wrench },
    { label: uiText("ui.inspections_completed_3974e215d5"), value: summary.completed_inspections, icon: ClipboardCheck },
  ].filter((fact) => fact.value > 0);

  if (!facts.length) return null;

  return (
    <section aria-labelledby="community-contributions-heading">
      <div className="mb-5">
        <h2 id="community-contributions-heading" className="font-heading text-lg font-extrabold tracking-tight text-on-surface">{uiText("ui.community_contributions_049d642460")}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{uiText("ui.current_facts_from_active_contributions_visi_4326eb9196")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {facts.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-[1.25rem] bg-surface-container-lowest p-4 ghost-border shadow-sm">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            <p className="mt-3 font-heading text-2xl font-extrabold text-on-surface">{value}</p>
            <p className="mt-1 text-xs font-semibold text-on-surface-variant">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
