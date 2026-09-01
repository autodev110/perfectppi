import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Notice at Collection",
  description: "The information PerfectPPI collects and why it is used.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/notice-at-collection` },
};

export default function NoticeAtCollectionPage() {
  return (
    <LegalDocument title="Notice at Collection" description="A short notice about the information collected when you create an account or use PerfectPPI.">
      <h2>Categories collected</h2>
      <p>Depending on the features you use, we collect account identifiers and contact information; vehicle and VIN data; inspection answers, diagnostic codes, photos, video, and reports; profile, community, marketplace, review, and message content; transaction and service-contract records; device, log, network, and approximate location information; and inferences produced to organize inspection findings.</p>

      <h2>Purposes</h2>
      <p>We use this information to authenticate users, provide inspections and reports, support marketplace and community features, process transactions, connect approved integrations, prevent fraud and abuse, moderate content, communicate with users, comply with law, and improve product reliability. AI-assisted features process submitted inspection context as described in the <Link href="/ai-disclosure">AI Disclosure</Link>.</p>

      <h2>Sale, sharing, and retention</h2>
      <p>PerfectPPI does not currently sell personal information for money or use cross-context behavioral advertising. Information is retained only as reasonably needed for the disclosed purposes, security, disputes, contracts, and legal obligations. Authenticated account deletion normally begins within 24 hours unless a documented legal hold applies; minimized privacy-request records are kept for 24 months; and unattached quarantined uploads expire after 30 minutes. Other contract, payment, tax, moderation, backup, and provider periods depend on applicable requirements and approved schedules.</p>

      <h2>Your choices</h2>
      <p>See the <Link href="/privacy">Privacy Policy</Link> for complete disclosures and use <Link href="/privacy-choices">Your Privacy Choices</Link> to request access, correction, export, opt-out, appeal, or deletion before or after creating an account.</p>
    </LegalDocument>
  );
}
