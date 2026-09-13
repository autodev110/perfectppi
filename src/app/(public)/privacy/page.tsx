import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, DISCLOSURES_LAST_UPDATED } from "@/lib/legal/constants";

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
      updated={DISCLOSURES_LAST_UPDATED}
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
        We collect listings, prices, approximate listing location, reviews, posts, comments, reports, appeals, messages, attachments, and media packages. Active public listings can be viewed by anyone. Community posts, comments, profiles, and their media are available only to signed-in PerfectPPI members, subject to the audience and privacy settings described in section 7. Messages are limited to conversation participants and authorized administrators, subject to safety, legal, and moderation needs.
      </p>
      <h3>Social identity, relationships, and reports</h3>
      <p>
        Every account has a unique username, which is public and, in this release, cannot be changed by you after it is chosen; an existing account without one received a randomly generated username. We store your profile privacy setting (public inside PerfectPPI or private), default post audience, discoverability preferences, accepted friend relationships, and the members you block or mute. If you choose the contact-discovery feature, the app sends one-way hashes of the email addresses and phone numbers in the contacts you permit so we can identify discoverable PerfectPPI accounts; address-book names and unmatched raw contact details remain on your device, and the hashes are not used for advertising. Blocking and muting are visible only to you. When you report content we record the report reason, optional details, the exact version of the content you saw, and the time; your identity is stored with the report for abuse prevention and is never shown to the author or to other members.
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
        We receive IP address and request logs from hosting and security providers, necessary session cookies, device and app version information, APNs push tokens, error information, and security events. The iOS app asks for camera, photo-library, Bluetooth, notifications, contacts, and optional Face ID access only when the related feature needs it. Contact access is optional and may be limited to contacts you select. Bluetooth OBD data is available in the iOS app, not through browser Bluetooth.
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
        PerfectPPI sends relevant vehicle, VIN, inspection-answer, diagnostic, and report context to Google Gemini to assist with structured inspection reports and coverage-related outputs. VIN images may also be sent to Gemini to read a VIN. In the current release, ordinary Community text posts and comments are not sent to Gemini or another general-purpose AI classifier before they publish; they pass deterministic server checks and publish immediately. Still photos are checked through a configured specialist illegal-content scanning service and re-encoded with metadata removed before they publish; Community video uploads are disabled. A general-purpose AI publication gate for Community content exists as a server-controlled capability that is switched off and would be disclosed here before use. We minimize inputs to what the feature needs and do not intentionally send account passwords or payment-card data to these services.
      </p>
      <p>
        AI output can be incomplete or wrong. It is not a substitute for a physical inspection, diagnostic procedure, safety decision, repair advice, appraisal, insurance decision, or the binding terms of a service contract. Users may request correction or human review through <Link href="/support">Support</Link>. See the <Link href="/ai-disclosure">AI Processing Disclosure</Link> for more detail.
      </p>

      <h2>6. When information is disclosed</h2>
      <p>
        We disclose information as needed to Supabase for authentication and database services; Vercel for application hosting; Cloudflare R2 for object storage; Google for sign-in, Gemini AI processing, moderation, and VIN/vehicle processing; a configured specialist illegal-content scanning service for community media safety; Apple for push delivery and platform services; Stripe for payment processing; DocuSeal for electronic-signature workflows; NHTSA vPIC for VIN decoding; connected organizations, technicians, and transaction participants; DealerSpace or another partner you or your organization connects; professional advisers; and authorities or other parties when required for law, safety, fraud prevention, or legal claims.
      </p>
      <p>
        Processor practices and contract terms require ongoing review. Each third party may process information under its own terms and privacy notice when acting independently.
      </p>

      <h2>7. Public content and sharing links</h2>
      <p>
        Active public vehicle listings can be available without signing in. Community posts, comments, member profiles, and their media require a signed-in PerfectPPI account and are shown only to the audience you chose: a post is either visible to all signed-in members or to accepted friends only, a private profile can publish to friends only, and changing your profile to private immediately limits your earlier public posts to friends. Community content is not published to the open web or to search engines in this release. Community photos are stored privately and delivered only through an authenticated request that re-checks the post&apos;s status and audience each time; there is no permanent public image address. A share link for a media package acts like a bearer link: anyone who receives it may access the linked package until it is revoked or expires. Do not post documents, faces, plates, location details, or other personal information you do not want disclosed. PerfectPPI removes location and device metadata from published Community photos, but you should not rely on metadata removal as your only privacy protection, and PerfectPPI cannot recall copies that other members already saved.
      </p>
      <h3>Reports, moderation, and moderator access</h3>
      <p>
        A valid first report hides a post or comment from all members while a trained member of the PerfectPPI team reviews it. Moderators see the reported content, its version history, attached media, the report reasons, the author&apos;s prior moderation history, and internal notes; reporter identity is visible only to team members holding a separately granted permission. Every moderator view of restricted media and every decision, note, claim, and enforcement action is logged. Decisions are made by people, not by automated systems, and authors can appeal removals.
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
        We keep each category only as long as reasonably necessary for the feature, account, transaction, security, moderation, dispute, contractual, and legal purposes described here. Authenticated account deletion removes the account and account-owned application data and managed media, normally beginning within 24 hours, unless affected evidence is subject to a documented legal hold. We keep minimized privacy-request records for 24 months. Unattached quarantined uploads expire after 30 minutes and enter retryable cleanup. A post you archive yourself can be restored for 30 days and is then eligible for controlled disposal. Content that was reported keeps a restricted evidence record (the reported version, attached media, reports, and the decision history) after the case closes for the period set in our retention schedule and is then disposed of through an audited process; until a period is approved for a record class, that evidence stays under restricted access, and a legal hold keeps evidence for as long as the hold applies. Deleting your account removes your public identity immediately, but evidence tied to an open case, a confirmed violation, an appeal, or a legal hold is retained under restricted access until its period ends, with reporter identity minimized. Reported illegal-content evidence is preserved for the period required by law. Backups and independent processor copies may persist according to their deletion cycles; contract, payment, tax, and provider-specific periods remain subject to applicable requirements and approved schedules.
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
