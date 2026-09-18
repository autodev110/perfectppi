import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing use of PerfectPPI.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/terms` },
};

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Service" description="These terms govern access to and use of PerfectPPI's website, iOS application, inspections, marketplace, community, messaging, and related services.">
      <h2>1. Agreement and eligibility</h2>
      <p>
        By creating an account or affirmatively accepting these Terms, you agree to this version. You must be legally capable of entering this agreement and must provide accurate account information. If you use PerfectPPI for an organization, you confirm you are authorized to act for it. The final minimum-age policy remains subject to business-owner and licensed-counsel approval; PerfectPPI is not directed to children under 13.
      </p>

      <h2>2. Accounts and sign-in providers</h2>
      <p>
        Keep credentials and devices secure and notify us promptly of unauthorized access. Google or another identity provider may be used for authentication, but your PerfectPPI account is separate from that provider account. Disconnecting a provider can remove that sign-in method without deleting PerfectPPI data. Do not disconnect your only sign-in method unless another method is available.
      </p>

      <h2>3. Roles and organizations</h2>
      <p>
        Consumers, technicians, organization managers, administrators, and integrated partners have different permissions. A role or profile label does not by itself establish employment, agency, licensure, insurance, certification, or an endorsement by PerfectPPI. Technician and organization relationships, worker classification, licensing, insurance, and credential-verification requirements may require separate agreements and state-specific review.
      </p>

      <h2>4. Inspections and reports</h2>
      <p>
        A pre-purchase inspection records observations and data available at a point in time, within the selected inspection scope and access available to the person performing it. Conditions can be intermittent, concealed, inaccessible, inaccurately reported, or change after inspection. Photos, answers, diagnostic data, and AI-assisted summaries do not replace manufacturer procedures, a repair diagnosis, a recall check, a title or history search, or specialist testing.
      </p>
      <p>
        An inspection report is not a certification of safety, roadworthiness, legal compliance, future performance, market value, ownership, mileage accuracy, or absence of hidden defects. Users remain responsible for purchase, sale, repair, operation, and safety decisions and should obtain qualified human review for material concerns.
      </p>

      <h2>5. OBD and vehicle data</h2>
      <p>
        OBD scans can report only information exposed by a compatible vehicle, adapter, protocol, and scan session. No code result does not establish that a vehicle has no fault. Codes and readiness data require interpretation and may be cleared, pending, manufacturer-specific, stale, or incomplete. Use the OBD tool only when the vehicle is safely positioned and do not interact with it while driving.
      </p>

      <h2>6. AI-assisted features</h2>
      <p>
        PerfectPPI uses AI to assist with VIN reading, report structure, summaries, coverage-related outputs, and content moderation. AI output may be inaccurate or incomplete and must not be the sole basis for a safety, repair, insurance, warranty, eligibility, employment, or other significant decision. See the <Link href="/ai-disclosure">AI Processing Disclosure</Link> and use Support to request correction or human review.
      </p>

      <h2>7. Marketplace</h2>
      <p>
        Sellers are responsible for listing accuracy, authority to sell, required disclosures, vehicle condition, title, taxes, registration, recalls, liens, pricing, and compliance with applicable law. Buyers must independently verify listings and vehicle information. PerfectPPI provides the listing and communication tools but is not automatically the buyer, seller, dealer, escrow agent, title agent, or party to a vehicle sale.
      </p>

      <h2>8. Community, reviews, messages, and media</h2>
      <p>
        You retain ownership of content you submit. You grant PerfectPPI a nonexclusive, worldwide, royalty-free license to host, copy, resize, transcode, display, distribute, and moderate that content only as needed to operate, secure, improve, and promote the feature in which you submitted it. Public content can be seen and reshared by others. You represent that you have the rights and permissions needed for submitted content.
      </p>
      <p>
        Honest reviews, including negative reviews, are permitted. We do not require reviewers to transfer ownership of reviews or penalize a user merely for an honest opinion. We may restrict content that violates the <Link href="/community-guidelines">Community Guidelines</Link>, law, privacy, intellectual-property rights, safety requirements, or platform integrity. Automated moderation can be appealed and may receive human review.
      </p>

      <h2>9. Payments, signatures, and service contracts</h2>
      <p>
        Before a charge or signature, the applicable checkout or contract must identify the selected product, price, material terms, and provider roles. Stripe may process payments and DocuSeal may process signatures. A vehicle service contract, warranty, or similar product is governed by its issued provider contract and required state disclosures, not by an AI-generated option or preview. PerfectPPI&apos;s provider, obligor, administrator, producer, and compensation roles have not yet been approved for nationwide launch and require licensed-counsel review.
      </p>
      <p>
        Cancellation, refund, free-look, no-show, recurring-payment, claim, and dispute rights depend on the specific transaction and applicable law. PerfectPPI will not publish or apply a universal policy until the business facts and state requirements are approved. Do not complete a paid flow unless the transaction presents the applicable terms before payment.
      </p>

      <h2>10. Electronic records</h2>
      <p>
        When a transaction offers electronic records and signatures, you may be asked for separate E-SIGN consent describing hardware and software needs, paper-copy rights, and how to withdraw consent. Clicking these Terms alone does not replace a transaction-specific disclosure required by law.
      </p>

      <h2>11. Acceptable use</h2>
      <p>You may not:</p>
      <ul>
        <li>Use PerfectPPI unlawfully, deceptively, or to facilitate an unsafe act.</li>
        <li>Misrepresent identity, authority, credentials, vehicle facts, inspection results, reviews, or affiliations.</li>
        <li>Upload malware, stolen content, unlawful intimate material, child sexual abuse material, threats, or content that violates another person&apos;s rights.</li>
        <li>Harass users, send spam, scrape personal information, evade enforcement, or interfere with security and availability.</li>
        <li>Attempt to access another account, conversation, private artifact, organization, or bearer share link without authorization.</li>
        <li>Reverse engineer or misuse the service except where applicable law expressly permits it.</li>
      </ul>

      <h2>12. Moderation, suspension, and termination</h2>
      <p>
        We may hold, restrict, remove, or preserve content and may limit or suspend access to protect users, enforce these Terms, comply with law, investigate abuse, or maintain service integrity. Where appropriate, we provide notice and an appeal path. Legal holds can delay deletion. You may stop using the service and request account deletion through <Link href="/privacy-choices">Your Privacy Choices</Link>.
      </p>

      <h2>13. Intellectual property and feedback</h2>
      <p>
        PerfectPPI&apos;s software, design, branding, and original materials are protected by applicable intellectual-property law. These Terms do not transfer ownership. If you voluntarily provide product feedback, we may use it without restricting your ability to use the same ideas.
      </p>

      <h2>14. Third-party services</h2>
      <p>
        Third-party identity, payment, signature, storage, AI, vehicle-data, platform, and partner services have their own terms and availability. PerfectPPI is not authorized to modify those terms. Report an integration problem through Support before relying on an incomplete transaction or output.
      </p>

      <h2>15. Disputes and applicable rights</h2>
      <p>
        Contact <Link href="/support">Support</Link> so we can investigate and attempt to resolve a concern. These Terms do not select a governing law, require arbitration, waive class procedures, impose an indemnity, or state a liability cap. Those clauses require explicit business and licensed-counsel approval and, if adopted, a properly designed assent process. Rights and remedies that cannot lawfully be waived remain available.
      </p>

      <h2>16. Changes</h2>
      <p>
        We may update these Terms by publishing a new version and effective date. If a change materially affects the agreement, we will provide additional notice and request renewed acceptance when appropriate. Continued use does not replace affirmative acceptance where applicable law requires it.
      </p>
    </LegalDocument>
  );
}
