import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import {
  CANONICAL_ORIGIN,
  DISCLOSURES_LAST_UPDATED,
  LEGAL_CONTACT_EMAIL,
  MODERATION_RESPONSE_TARGETS,
} from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Support & Safety",
  description: "Contact PerfectPPI for account, inspection, safety, Community reports and appeals, billing, accessibility, and privacy support.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/support` },
};

// Plan section 31.4: the Help & Safety surface. This page is also the App
// Store support URL, so it must carry a monitored contact method, response
// expectations, report/block guidance, appeals, the emergency disclaimer,
// and the copyright process.
export default function SupportPage() {
  return (
    <LegalDocument
      title="Support & Safety"
      description="Contact the PerfectPPI team, learn how reporting, blocking, and appeals work, and find help for account, inspection, billing, accessibility, and privacy questions."
      updated={DISCLOSURES_LAST_UPDATED}
      version="support-2026-09-10"
    >
      <h2>Contact</h2>
      <p>
        Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. This inbox is monitored by the PerfectPPI team. Include the account email and the relevant inspection, vehicle, listing, order, conversation, post, or case identifier when available. Never send your password, full payment-card information, Apple or Google credentials, or OBD adapter secrets.
      </p>

      <h2>Urgent safety</h2>
      <p>
        PerfectPPI is not an emergency service and does not monitor Community content in real time. If a person is in immediate danger, contact local emergency services. If a vehicle may be unsafe, stop operating it when safe to do so and contact roadside assistance, the manufacturer, or a qualified repair facility. Do not rely on a Community answer, an AI output, or an OBD scan to clear a safety concern.
      </p>

      <h2>Reporting Community content</h2>
      <p>
        Every post and comment you did not write has a report control in the app and on the website. Choose the reason that best matches what you saw and add details when asked. A first valid report hides the content from all members while our team reviews it, and you receive an in-app confirmation. The author is never told who reported them, and you will not be told the outcome beyond a neutral notice that the review is complete. Reports are rate-limited, and reports found to be knowingly false may lead to enforcement. See the <Link href="/community-guidelines">Community Guidelines</Link> for what is and is not allowed.
      </p>

      <h2>Blocking and muting</h2>
      <p>
        Block a member from their profile or from any of their posts. Blocking removes each of you from the other&apos;s posts, comments, search, and messages, cancels pending requests, and is not announced. Mute hides a member&apos;s posts from you only. Review and reverse both from Privacy &amp; Safety in your settings.
      </p>

      <h2>Response expectations</h2>
      <p>
        We aim to complete a first human review of urgent reports (threats, exposed personal information, suspected illegal content) within {MODERATION_RESPONSE_TARGETS.urgentHours} hours and of other hidden content within {MODERATION_RESPONSE_TARGETS.ordinaryHours} hours. Support email is answered on business days; account-security and privacy requests are prioritized. These are targets, not guarantees.
      </p>

      <h2>Appeals</h2>
      <p>
        If your post or comment was removed, the notice in the app names the policy that applied and offers an appeal from My Posts. Write a short statement of why you believe the decision was wrong. Appeals are normally reviewed within {MODERATION_RESPONSE_TARGETS.appealHours} hours by someone other than the original reviewer when staffing permits, and you are notified of the result. Account restrictions and suspensions can be appealed by email using the case identifier from your notice.
      </p>

      <h2>Account and identity</h2>
      <p>
        Contact us for sign-in problems, suspected compromise, provider disconnect questions, identity linking, or a username that must be corrected for security, impersonation, or legal reasons (usernames are otherwise permanent in this release). Revoking PerfectPPI in your Google or Apple account stops provider access but does not delete your PerfectPPI account; delete your account from <Link href="/privacy-choices">Your Privacy Choices</Link> or the app&apos;s Privacy &amp; Account screen. If you signed in with Apple, we revoke your Apple token as part of deletion.
      </p>

      <h2>Report or content correction</h2>
      <p>
        Identify the output or content and explain what appears inaccurate. Inspection evidence and AI-assisted outputs receive human review on request.
      </p>

      <h2>Copyright and intellectual property</h2>
      <p>
        Use the <Link href="/copyright">Copyright Complaints</Link> page for infringement notices, or choose the intellectual-property reason when reporting a post and include the required details. We remove infringing material and act on repeat infringement; formal DMCA safe-harbor procedures depend on designating a registered agent, which requires business-owner and counsel approval.
      </p>

      <h2>Privacy and accessibility</h2>
      <p>
        Privacy requests can be initiated from <Link href="/privacy-choices">Your Privacy Choices</Link>. Accessibility barriers can be reported by email with the page or screen, device, assistive technology, and a description of the problem. Alternative assistance will be offered where reasonably available.
      </p>
    </LegalDocument>
  );
}
