import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, LEGAL_CONTACT_EMAIL } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Your Privacy Choices",
  description: "Request access, correction, export, deletion, appeal, or other privacy choices from PerfectPPI.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/privacy-choices` },
};

export default function PrivacyChoicesPage() {
  return (
    <LegalDocument title="Your Privacy Choices" description="A nationwide request channel for access, correction, export, deletion, appeals, and authorized-agent requests.">
      <h2>Available requests</h2>
      <ul>
        <li>Know or access the information associated with you.</li>
        <li>Correct inaccurate account or vehicle information.</li>
        <li>Receive a portable copy of applicable information.</li>
        <li>Delete your account and associated information, subject to required retention and legal holds.</li>
        <li>Opt out of sale, targeted advertising, or qualifying profiling.</li>
        <li>Appeal a privacy-request decision.</li>
        <li>Submit a request as an authorized agent.</li>
      </ul>

      <h2>Submit securely</h2>
      <p>
        If you have an account, sign in and open <Link href="/dashboard/settings#privacy">Account Settings</Link>. The authenticated request record lets you track status without emailing identity documents. If you cannot sign in, email{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=PerfectPPI%20privacy%20request`}>{LEGAL_CONTACT_EMAIL}</a>
        {" "}with the request type and the email associated with your account. Do not email passwords, full payment-card details, or government identification unless we specifically request a secure verification method.
      </p>

      <h2>Verification, timing, and appeals</h2>
      <p>
        We verify requests in proportion to their sensitivity and may ask an authorized agent for proof of authority. We respond within the period required by applicable law and explain any extension or denial. To appeal, reply to the decision or submit an appeal request from Account Settings. We do not discriminate against users for exercising privacy rights.
      </p>

      <h2>Global Privacy Control</h2>
      <p>
        Where applicable, PerfectPPI recognizes Global Privacy Control as an opt-out request for sale or targeted advertising for the browser or device sending it. Those activities are not enabled in the current product, so a signal does not change current behavior. Account-level requests can still be recorded through Account Settings.
      </p>

      <h2>Account deletion</h2>
      <p>
        An authenticated deletion request schedules removal of the account, account-owned application data, public content, private messages and attachments, inspections, managed media, share links, push tokens, and partner links. Processing normally begins within 24 hours and retries transient failures. A documented legal preservation hold pauses deletion of the affected account and is shown in request status while the account remains available. Minimized request evidence is retained for 24 months. Removing the app or disconnecting Google does not itself delete the PerfectPPI account.
      </p>
    </LegalDocument>
  );
}
