import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Service Contract Disclosure",
  description: "Important information about PerfectPPI vehicle service-contract workflows.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/warranty-disclosure` },
};

export default function WarrantyDisclosurePage() {
  return (
    <LegalDocument title="Service Contract Disclosure" description="Important limitations while vehicle service-contract roles and state approvals are under legal review.">
      <h2>No coverage from a preview</h2>
      <p>An inspection report, AI-generated eligibility indication, option card, or price preview is not a warranty, insurance policy, service contract, promise to reimburse, or confirmation of coverage. Coverage exists only under a completed, issued agreement from an authorized provider after all required disclosures, signatures, payment, eligibility checks, and approvals.</p>

      <h2>The issued contract controls</h2>
      <p>The provider or obligor, administrator, covered components, exclusions, waiting periods, term, mileage, claims procedure, cancellation, free-look, refund rights, transfer rules, and state notices must appear in the issued contract. If a screen conflicts with that contract, stop and contact Support before paying or relying on coverage.</p>

      <h2>Launch limitation</h2>
      <p>PerfectPPI&apos;s role, compensation, licenses, registrations, financial-security arrangements, provider relationships, approved forms, taxes, and state availability have not been established in this repository. Vehicle service-contract sales must not launch in a jurisdiction until qualified counsel and the responsible provider approve the flow and state-specific documents.</p>
    </LegalDocument>
  );
}
