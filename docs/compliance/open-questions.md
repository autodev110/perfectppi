# Blocking Open Questions

Do not treat the legal drafts or product as approved for nationwide launch until the responsible owner and licensed counsel resolve the applicable items below.

## Company and contract facts

- [ ] Confirm legal entity name, formation state, principal and required postal addresses, registered agent, and authorized signer. A physical postal address is required before commercial email campaigns.
- [ ] Decide governing law, forum, arbitration/class procedures, indemnification, disclaimer and liability terms. None were invented in the Terms.
- [ ] Approve minimum age: strictly 18+, another threshold, or a feature-specific child/teen design. Define age assurance and parental processes.
- [ ] Approve inspection scope, state addenda, technician/organization agreements, fees, cancellation, refund, no-show, test-drive, estimate/invoice and record-delivery terms.
- [ ] Confirm whether subscriptions or recurring billing will exist. If yes, approve ROSCA and state auto-renewal disclosures, consent records and simple cancellation.
- [ ] Confirm whether marketing email, SMS, calls or push campaigns will occur; provide consent language, suppression ownership, postal address, quiet hours and vendor configuration.

## Regulated roles and claims

- [ ] Complete 50-state vehicle inspection/repair/mobile mechanic/appraisal/license analysis.
- [ ] Complete technician worker-classification, background-check/FCRA, insurance and credential-verification analysis.
- [ ] Determine marketplace seller/dealer, tax, payment/payout, facilitator and title responsibilities.
- [ ] Determine VSC/warranty provider, obligor, administrator, producer and compensation roles in every state; approve licenses, forms, financial security, reimbursement insurance, cancellation/free-look/refunds, claims and taxes. Keep the paid flow disabled until approved.
- [ ] Decide whether any inspection guarantee, reimbursement or coverage recommendation creates a warranty, service contract, insurance or regulated decision.

## Privacy, records and security

- [ ] Approve the still-open contract, payment, tax, ordinary moderation, provider-log, and backup periods. Engineering now enforces account deletion, 24-month privacy-request logs, 30-minute unattached-upload expiry, and legal-hold preservation.
- [ ] Confirm statutory applicability thresholds using actual annual user, household, revenue and sale/share data.
- [ ] Approve whether precise location, face/voice processing, plate extraction, biometrics or age assurance will be used. Current code should not be described as biometric identification.
- [ ] Approve authorized-agent proof, state deadlines/extensions, exceptional verification, appeals, independent-processor propagation, and completion notices. Authenticated direct export and deletion processing are implemented.
- [ ] Run seeded acceptance tests for Supabase Auth/tables, sessions, public/private R2, share links and APNs; decide propagation for any enabled Stripe, DocuSeal, Gemini, DealerSpace, logs, and backups.
- [ ] Assign security owner, incident commander, privacy lead, counsel, forensic vendor, cyber insurer contact and notification authority.
- [ ] Designate and register a Copyright Office DMCA agent before claiming Section 512 safe harbor.

## Identity and stores

- [ ] Configure Sign in with Apple: Team ID, bundle/App ID, Services ID, entitlement, Supabase client IDs, key/JWT rotation, relay email, revocation and test accounts. Google login on iOS makes this an App Store launch blocker under current review rules.
  - Implemented (Sep 10, 2026): native iOS Sign in with Apple through Supabase's id_token grant with a per-attempt nonce; the `com.apple.developer.applesignin` entitlement; server-side custody of the Apple refresh token (`/api/auth/apple/link`, encrypted at rest) and revocation before account deletion. Still operational: enable the Apple provider on the hosted Supabase project with the bundle ID as client ID, create the Sign in with Apple key, set `APPLE_SIGN_IN_*` in production, decide the private relay email handling, and verify with a review test account.
- [ ] Decide first-party handling for Apple account/consent/email-change notifications if Supabase does not support the required server-to-server endpoint.
- [ ] Verify Google Cloud/Supabase production dashboard values, consent branding, Search Console ownership, authorized origin, callback, audience and exact basic scopes.
- [ ] Complete App Store privacy questionnaire from the final data inventory and validate `PrivacyInfo.xcprivacy` with archive tooling.

## Product operations

- [ ] Establish moderation/report/block/appeal/copyright/safety coverage for listings, reviews, profiles, messages and all media, not only community posts.
- [ ] Contract and configure the specialist illegal-content scanner adapter, approve the CyberTipline/reporting runbook, and test match, review, outage, and evidence-preservation cases before public media launch.
- [ ] Approve AI vendor contracts/settings, model-input minimization, human-review SLA, correction/appeal and prohibited significant decisions.
- [ ] Complete WCAG 2.2 AA and iOS VoiceOver/Dynamic Type/manual testing before making a conformance claim.
- [ ] Verify private contracts and non-public media fail anonymously, and move any remaining private artifacts out of public R2 paths.
