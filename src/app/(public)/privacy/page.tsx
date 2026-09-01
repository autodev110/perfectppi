import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PerfectPPI collects, uses, discloses, retains, and protects personal information.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/privacy` },
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      description="This policy explains PerfectPPI's data practices across the website, iOS application, inspections, marketplace, community, messaging, and related services."
    >
      <h2>1. Scope and our role</h2>
      <p>
        This policy applies when PerfectPPI determines how personal information is handled in its services. An organization, dealer, technician business, warranty or service-contract provider, payment provider, or integrated partner may separately control information it receives and must provide its own notices where required.
      </p>

      <h2>2. Information we collect</h2>
      <h3>Account and identity information</h3>
      <p>
        We collect account identifiers, name, email address, username, avatar, profile details, role, organization membership, authentication records, and account settings. If you use Google sign-in, we receive the basic profile information you authorize, currently your Google account identifier, name, email address, and profile image. We do not request Gmail, Google Drive, contacts, or other sensitive Google scopes.
      </p>
      <h3>Vehicle, inspection, and diagnostic information</h3>
      <p>
        We collect VIN, year, make, model, trim, mileage, vehicle photos and videos, inspection answers and notes, technician observations, report data, and OBD information such as adapter details, diagnostic trouble codes, warning-light status, readiness monitors, supported PIDs, and live readings. A VIN may identify a vehicle and can become personal information when linked to a person or account.
      </p>
      <h3>Marketplace, community, and communications</h3>
      <p>
        We collect listings, prices, approximate listing location, reviews, posts, comments, reports, appeals, messages, attachments, and media packages. Content marked public can be viewed by anyone. Messages are limited to conversation participants and authorized administrators, subject to safety, legal, and moderation needs.
      </p>
      <h3>Technician and organization information</h3>
      <p>
        We collect business and profile details, specialties, experience, service area, availability, organization relationships, inspection assignments, and verification status. Credential claims may be reviewed before PerfectPPI describes them as verified.
      </p>
      <h3>Transactions, contracts, and support</h3>
      <p>
        We process order, selected-plan, price, payment-status, Stripe reference, receipt, contract, signature-status, DocuSeal reference, warranty or vehicle-service-contract workflow, support request, and dispute information. Payment card details are entered with the payment provider and are not stored in the PerfectPPI application database.
      </p>
      <h3>Device and technical information</h3>
      <p>
        We receive IP address and request logs from hosting and security providers, necessary session cookies, device and app version information, APNs push tokens, error information, and security events. The iOS app asks for camera, photo-library, Bluetooth, notification, and optional Face ID access only when the related feature needs it. Bluetooth OBD data is available in the iOS app, not through browser Bluetooth.
      </p>
      <h3>Partner information</h3>
      <p>
        When an organization connects DealerSpace or another approved partner, we process partner installation and user identifiers, connection records, inspection references, vehicle snapshots, delivery events, webhook metadata, and deliverable access records.
      </p>

      <h2>3. Sources</h2>
      <p>
        Information comes from you; other participants in an inspection, organization, transaction, or conversation; a connected OBD adapter; vehicle and VIN decoding sources such as NHTSA vPIC; identity providers; processors; integrated partners; and activity generated when the services are used.
      </p>

      <h2>4. Why we use information</h2>
      <ul>
        <li>Authenticate users, maintain accounts, and secure sessions.</li>
        <li>Decode vehicles, conduct inspections, store evidence, and generate reports.</li>
        <li>Connect iOS to a supported OBD adapter and incorporate diagnostic results.</li>
        <li>Operate marketplace, community, messaging, reviews, notifications, organizations, and technician workflows.</li>
        <li>Process payments, signatures, contracts, receipts, and service-contract workflows.</li>
        <li>Generate and moderate content with the AI processing described below.</li>
        <li>Provide support, investigate abuse, maintain audit records, enforce rules, and comply with law.</li>
        <li>Debug, maintain, and improve reliability, accessibility, and security.</li>
      </ul>

      <h2>5. AI processing</h2>
      <p>
        PerfectPPI sends relevant vehicle, VIN, inspection-answer, diagnostic, and report context to Google Gemini to assist with structured inspection reports and coverage-related outputs. VIN images may also be sent to Gemini to read a VIN. Community text and still images are sent to OpenAI&apos;s moderation service to identify content requiring blocking or human review; video is held for manual review in the current implementation. We minimize inputs to what the feature needs and do not intentionally send account passwords or payment-card data to these models.
      </p>
      <p>
        AI output can be incomplete or wrong. It is not a substitute for a physical inspection, diagnostic procedure, safety decision, repair advice, appraisal, insurance decision, or the binding terms of a service contract. Users may request correction or human review through <Link href="/support">Support</Link>. See the <Link href="/ai-disclosure">AI Processing Disclosure</Link> for more detail.
      </p>

      <h2>6. When information is disclosed</h2>
      <p>
        We disclose information as needed to Supabase for authentication and database services; Vercel for application hosting; Cloudflare R2 for object storage; Google for sign-in, Gemini, and VIN/vehicle processing; OpenAI for content moderation; Apple for push delivery and platform services; Stripe for payment processing; DocuSeal for electronic-signature workflows; NHTSA vPIC for VIN decoding; connected organizations, technicians, and transaction participants; DealerSpace or another partner you or your organization connects; professional advisers; and authorities or other parties when required for law, safety, fraud prevention, or legal claims.
      </p>
      <p>
        Processor practices and contract terms require ongoing review. Each third party may process information under its own terms and privacy notice when acting independently.
      </p>

      <h2>7. Public content and sharing links</h2>
      <p>
        Public profiles, active public vehicle listings, community posts, comments, reviews, and their approved media can be available without signing in. A share link acts like a bearer link: anyone who receives it may access the linked package until it is revoked or expires. Do not post documents, faces, plates, location details, or other personal information you do not want disclosed. PerfectPPI may remove metadata from images, but you should not rely on metadata removal as your only privacy protection.
      </p>

      <h2>8. Cookies, analytics, sale, sharing, and opt-out signals</h2>
      <p>
        PerfectPPI uses necessary authentication and security cookies. As of this version, the reviewed application source and deployed public homepage do not include a third-party advertising or behavioral-analytics SDK. PerfectPPI does not exchange personal information for money or use it for cross-context behavioral advertising. If those practices change, we will update this notice and provide required choices before using information for the new purpose.
      </p>
      <p>
        Where applicable, we treat a recognized Global Privacy Control or other universal opt-out signal as a request to opt out of sale or targeted advertising for that browser or device. Because those activities are not currently enabled, honoring the signal does not change current application behavior. You may still submit a request through <Link href="/privacy-choices">Your Privacy Choices</Link>.
      </p>

      <h2>9. Retention and deletion</h2>
      <p>
        We keep each category only as long as reasonably necessary for the feature, account, transaction, security, moderation, dispute, contractual, and legal purposes described here. Relevant criteria include whether an account or transaction remains active, whether a share link remains active, whether records support a signed contract or payment, whether content is under appeal or legal hold, and applicable legal requirements. Backups and processor copies may persist after production deletion according to provider backup and deletion processes. Category-specific schedules and legal-hold rules are being finalized and will be published after business-owner and counsel approval rather than assigning unsupported periods.
      </p>

      <h2>10. Security</h2>
      <p>
        We use measures intended to protect information, including encrypted transport, access controls, row-level database security, server-only privileged credentials, signed access for private artifacts, audit and moderation records, and deletion queues for stored objects. No system can guarantee absolute security. Please report a suspected vulnerability or account compromise to the contact below.
      </p>

      <h2>11. Your choices and privacy rights</h2>
      <p>
        Depending on where you live and whether a law applies to PerfectPPI, you may have rights to know or access, correct, delete, obtain a portable copy, opt out of certain sale, targeted advertising, or profiling, limit certain sensitive-data uses, receive a list of third-party recipients, appeal a denial, and use an authorized agent. We provide the same request channel nationwide as a voluntary baseline and do not discriminate for exercising a privacy right.
      </p>
      <p>
        Submit and track requests through <Link href="/privacy-choices">Your Privacy Choices</Link> or email us. We will verify requests proportionately, respond within the time required by applicable law, explain a denial, and provide an appeal path when required. Authorized agents should identify the person represented and provide proof of authority; we may verify directly with the person.
      </p>

      <h2>12. Google API data</h2>
      <p>
        PerfectPPI uses Google identity data only to authenticate you, create or update your basic profile, prevent fraud, and provide account support. PerfectPPI&apos;s use of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements. You can disconnect an eligible linked Google identity in account settings, revoke PerfectPPI access in your Google Account, or request account deletion. Disconnecting Google does not delete your PerfectPPI account or content.
      </p>

      <h2>13. Children</h2>
      <p>
        PerfectPPI is not directed to children under 13 and does not knowingly collect personal information from a child under 13 without legally sufficient parental consent. If you believe a child provided information, contact us. Additional protections may apply to teens. The minimum-age and age-assurance approach for community and direct-messaging features remains subject to business-owner and licensed-counsel approval.
      </p>

      <h2>14. U.S. operation and updates</h2>
      <p>
        PerfectPPI is intended for the United States. Providers may process information from locations outside your state. We will post policy changes here, update the version and date, and provide additional notice or request renewed agreement when legally required or appropriate for a material change.
      </p>
    </LegalDocument>
  );
}
