import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, LEGAL_CONTACT_EMAIL } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Copyright Complaints",
  description: "How to report alleged copyright infringement on PerfectPPI.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/copyright` },
};

export default function CopyrightPage() {
  return (
    <LegalDocument title="Copyright Complaints" description="A channel for reporting content you believe infringes your copyright.">
      <h2>Submit a notice</h2>
      <p>Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=Copyright%20complaint`}>{LEGAL_CONTACT_EMAIL}</a> with: your contact information; identification of the copyrighted work; the exact URL or content identifier for the material; a statement of good-faith belief that the use is unauthorized; a statement under penalty of perjury that the notice is accurate and you are authorized to act; and your physical or electronic signature.</p>

      <h2>Response and counter-notices</h2>
      <p>We may remove or restrict material while reviewing a sufficiently detailed complaint and may notify the submitting user. A user seeking restoration should email the same address and identify the removed material, explain in good faith why removal was mistaken, and provide the statements and consent required by applicable law. We may forward notices and counter-notices to the affected parties.</p>

      <h2>DMCA status</h2>
      <p>PerfectPPI has not yet published a designated agent&apos;s name, postal address, and phone number or confirmed registration in the U.S. Copyright Office directory. This page therefore does not claim DMCA safe-harbor qualification. The business owner and licensed counsel must complete and maintain that designation before such a claim is made.</p>
    </LegalDocument>
  );
}
