import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, LEGAL_CONTACT_EMAIL } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Support",
  description: "Contact PerfectPPI for account, inspection, safety, billing, accessibility, and privacy support.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/support` },
};

export default function SupportPage() {
  return (
    <LegalDocument title="Support" description="Contact the PerfectPPI team and include enough context for us to route your request safely.">
      <h2>Contact</h2>
      <p>
        Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. Include the account email and relevant inspection, vehicle, listing, order, conversation, or report identifier when available. Never send your password, full payment-card information, Apple private key, Google token, or OBD adapter secrets.
      </p>

      <h2>Urgent safety</h2>
      <p>
        PerfectPPI is not an emergency service. If a vehicle may be unsafe, stop operating it when safe to do so and contact emergency services, roadside assistance, the manufacturer, or a qualified repair facility as appropriate. Do not rely on an AI output or OBD scan to clear a safety concern.
      </p>

      <h2>Account and identity</h2>
      <p>
        Contact us for sign-in problems, suspected compromise, provider disconnect questions, identity linking, or account deletion. Revoking PerfectPPI in your Google or Apple account can stop provider access but does not delete your PerfectPPI account.
      </p>

      <h2>Report or content correction</h2>
      <p>
        Identify the output or content and explain what appears inaccurate. Inspection evidence and AI-assisted outputs may receive human review. Community moderation notices include an appeal route where available.
      </p>

      <h2>Privacy and accessibility</h2>
      <p>
        Privacy requests can be initiated from Your Privacy Choices. Accessibility barriers can be reported by email with the page or screen, device, assistive technology, and a description of the problem. Alternative assistance will be offered where reasonably available.
      </p>
    </LegalDocument>
  );
}

