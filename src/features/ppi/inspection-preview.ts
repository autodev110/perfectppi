import { buildInspectionFacts, type FactsInput } from "./inspection-facts.ts";
import { evaluateInspection, actionRank } from "./inspection-rules.ts";

export function inspectionPreview(input: FactsInput, inspectionDate = new Date()) {
  const facts = buildInspectionFacts(input);
  return {
    revision: input.submission.revision ?? 0,
    findings: input.catalogVersion < 2 ? [] : evaluateInspection(facts, { inspectionDate }).findings
      .filter((finding) => finding.action === "urgent" || finding.action === "service_recommended")
      .sort((a, b) => actionRank(b.action) - actionRank(a.action))
      .map((finding) => ({
        id: finding.finding_id,
        title: finding.title,
        nextStep: finding.next_step,
        action: finding.action,
      })),
  };
}
