import { CheckCircle2, ClipboardCheck, MessageCircleQuestion, Wrench } from "lucide-react";
import type { MemberContributionSummary } from "@/features/profiles/reputation";

export function MemberContributionSummaryCard({ summary }: { summary: MemberContributionSummary }) {
  const facts = [
    { label: "Accepted answers", value: summary.accepted_answers, icon: MessageCircleQuestion },
    { label: "Helpful marks", value: summary.helpful_marks, icon: Wrench },
    { label: "Issues fixed", value: summary.fixed_issues, icon: CheckCircle2 },
    { label: "Issues helped", value: summary.helped_issues, icon: Wrench },
    { label: "Inspections completed", value: summary.completed_inspections, icon: ClipboardCheck },
  ].filter((fact) => fact.value > 0);

  if (!facts.length) return null;

  return (
    <section aria-labelledby="community-contributions-heading">
      <div className="mb-5">
        <h2 id="community-contributions-heading" className="font-heading text-lg font-extrabold tracking-tight text-on-surface">
          Community contributions
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Current facts from active contributions visible to you, not a popularity score.
        </p>
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
