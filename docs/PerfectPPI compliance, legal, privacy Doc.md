## **PerfectPPI compliance, legal, privacy, and identity-provider implementation assignment**

You are responsible for a complete compliance-engineering audit and implementation for PerfectPPI. Do not merely generate generic legal boilerplate. Research current requirements, reconcile them against the actual repository and deployed configuration, implement the required technical and content changes, test them, and prepare unresolved legal decisions for qualified counsel.

### **Authoritative product facts**

Use these facts consistently:

* Product: **PerfectPPI**  
* Website/canonical origin: `https://www.perfectppi.com`  
* Required company wording: **“PerfectPPI is a product managed by DnD Solutions & Optimization LLC.”**  
* Contact: `info@dndsolutions.io`  
* Intended availability: users in all 50 U.S. states  
* Repository: `/Users/dan/Desktop/perfect ppi/ppi-standalone`  
* Stack includes Next.js, Supabase Auth/Postgres/RLS, Vercel, an iOS app, Cloudflare R2, Stripe, DocuSeal, Google Gemini, Apple Push Notification service, vehicle/VIN/OBD data, inspections, photos/video, community content, messages, reviews, marketplace features, technicians/organizations, and warranty or vehicle-service-contract workflows.
* Supabase project reference: `rnufzjpswyqxdkciglbi`  
* Provider callback used by Google and Apple web OAuth:  
  `https://rnufzjpswyqxdkciglbi.supabase.co/auth/v1/callback`  
* Production application callback currently used by the app:  
  `https://www.perfectppi.com/callback`  
* Google sign-in currently works. Preserve it.  
* Google’s scopes must remain limited to:  
  * `openid`  
  * `https://www.googleapis.com/auth/userinfo.email`  
  * `https://www.googleapis.com/auth/userinfo.profile`

### **Non-negotiable operating rules**

1. Read all repository instructions and inspect `git status` before changing anything. Preserve unrelated work.  
2. Research requirements as of the date work begins—currently September 1, 2026\. Prefer statutes, regulators, official provider documentation, and other primary sources. Secondary trackers may help discovery, but verify every material conclusion against a primary source.  
3. For every requirement, record:  
   * Jurisdiction/provider  
   * Requirement  
   * Effective date  
   * Applicability threshold or trigger  
   * Exemptions  
   * Primary-source URL and access date  
   * Evidence found in the application  
   * Required notice, functionality, or contract language  
   * Current status  
   * Implementation performed  
   * Verification evidence  
   * Whether licensed counsel must decide or approve it  
4. Separate:  
   * Legal obligations that presently apply  
   * Obligations that apply only after a threshold or feature is triggered  
   * Google, Apple, Supabase, App Store, or other contractual/platform rules  
   * Voluntary safeguards adopted as a nationwide baseline  
5. Do not claim “fully compliant,” “compliant in all 50 states,” or similar. Use wording such as **“implemented pending licensed-counsel approval.”**  
6. Do not invent the company’s postal address, formation state, registered agent, governing law, arbitration terms, insurance coverage, licenses, retention periods, refund policy, subscription terms, warranty terms, or regulatory role. Put every missing fact in a blocking `open-questions.md` file. No unresolved placeholder may be published to production.  
7. Do not expose credentials, provider secrets, Supabase service-role keys, Apple `.p8` keys, tokens, or environment-variable values in source control, client bundles, logs, screenshots, reports, or test output. Record environment-variable names only.  
8. Do not stop after writing a report. Implement every noncontroversial technical, accessibility, security, UI, and factual disclosure change supported by the audit. Hold clauses involving legal/business choices for owner and counsel approval.

## **Phase 1: Audit the real application**

Inspect the entire repository and, where access permits, the deployed site and provider dashboards. Audit:

* Public, authenticated, API, and callback routes  
* Middleware and public-route rules  
* Signup, login, OAuth, identity linking, logout, and session handling  
* Web and iOS account settings  
* Database schema, migrations, triggers, RLS, storage policies, and administrative APIs  
* Cloudflare R2 buckets, object visibility, signed URLs, and deletion behavior  
* All SDKs, HTTP clients, webhooks, analytics/tag managers, cookies, tracking technology, AI calls, and subprocessors  
* iOS entitlements, purpose strings, privacy manifest, associated domains, push notifications, AuthenticationServices integration, and App Store privacy declarations  
* Checkout, refunds, warranties/service contracts, e-signatures, generated contracts, receipts, cancellations, and disputes  
* Community, listings, reviews, messages, media, share links, reports, appeals, blocking, legal holds, and moderation  
* Marketing claims and every use of “verified,” “certified,” “expert,” “safe,” “guaranteed,” “independent,” or similar language

Build a complete data inventory covering collection, source, purpose, storage, access, disclosure, processor, retention, deletion, backup behavior, and security for at least:

* Account, authentication, Google/Apple identifiers, name, email, avatar, and role  
* Organization and technician memberships and credentials  
* Vehicle, VIN, mileage, inspection, OBD, diagnostics, photos, video, location, and report data  
* Marketplace listings, seller contact details, reviews, community content, private messages, and attachments  
* Device identifiers, APNs tokens, logs, cookies, analytics, crash data, and security events  
* Payments, Stripe identifiers, contracts, signatures, receipts, warranties, VSCs, claims, and refunds  
* AI inputs and outputs sent to Gemini or other services
* DealerSpace or other partner identifiers, webhooks, snapshots, and deliverables  
* Public content, public links, bearer share links, and data available without authentication

### **Preliminary repository findings to verify**

Do not blindly assume these remain accurate, but investigate them first:

* Footer legal links in `src/components/layout/footer.tsx` appear to use `href="#"`.  
* Public Privacy, Terms, Warranty Terms, Community Guidelines, Accessibility, and deletion-request pages appear absent.  
* `src/middleware.ts` does not appear to allow legal pages without authentication.  
* Signup appears to lack versioned Terms acceptance, eligibility confirmation, and separately optional marketing consent.  
* No complete user account deletion or privacy-data export workflow was found.  
* Apple sign-in appears absent from web and iOS UI/code, and the iOS entitlement may be missing.  
* Two auth callback implementations may exist and need consolidation or explicit justification.  
* Signed DocuSeal contracts and other private user media may be placed in a public R2 bucket.  
* Some database deletions may leave orphaned R2 objects.  
* “Verified technician,” “verified seller,” and similar public claims may not be backed by administrative verification.  
* Gemini receives VIN/vehicle/inspection/OBD information and moderation content; the user-facing disclosure must remain accurate as those flows change.
* Sophisticated moderation exists for community content, but other UGC surfaces may lack equivalent report, block, appeal, and moderation controls.  
* Public VINs, public profiles, permanent share links, and media metadata may expose more information than necessary.  
* Refund/cancellation functionality and public policies appear incomplete.  
* The iOS `PrivacyInfo.xcprivacy` may not match all actual collection and third-party processing.  
* No analytics SDK was found in the preliminary audit, but separately inspect the deployed site, tag manager, Vercel configuration, and injected scripts before making that statement.

## **Phase 2: Nationwide legal research**

Create a federal and 50-state matrix. Include DC if the application is accessible there. Do not assume every law applies merely because the site is available nationwide; document thresholds and triggers.

Research at least:

* Comprehensive state privacy laws, CalOPPA, consumer request rights, sensitive-data rules, profiling, appeals, authorized agents, non-discrimination, GPC and universal opt-out mechanisms  
* All state data-security and breach-notification laws  
* COPPA and current state child/teen and age-assurance laws; obtain a business decision and counsel approval on whether PerfectPPI is strictly 18+  
* FTC Act, advertising substantiation, dark patterns, endorsements, reviews/testimonials, and the Consumer Review Fairness Act  
* CAN-SPAM, TCPA/FCC rules, state mini-TCPA and do-not-call laws, email/SMS/push consent, suppression, and quiet hours  
* ROSCA and state automatic-renewal/subscription laws if recurring billing exists or may be added  
* Federal E-SIGN and each state’s UETA or equivalent electronic-record law  
* ADA/accessibility risk and WCAG 2.2 AA as the implementation target  
* DMCA safe-harbor processes, registered agent requirements, repeat-infringer policy, counter-notices, illegal-content escalation, and applicable reporting duties  
* Biometrics, precise geolocation, faces, voice, EXIF data, plates, VINs, DPPA implications, and vehicle-history-source restrictions  
* AI disclosures, vendor training/retention, automated or consequential decisions, accuracy, human review, correction, and appeal  
* Marketplace liability, technician worker classification, licenses, insurance, background checks, FCRA, payment/payout, tax, and marketplace-facilitator issues  
* State inspection, vehicle-repair, mobile-mechanic, appraisal, estimate, authorization, invoice, recordkeeping, test-drive, safety, and advertising laws  
* Magnuson-Moss and state warranty requirements  
* Vehicle service contract/insurance rules in every state, including provider/obligor/administrator roles, licensing, registrations, financial security, reimbursement insurance, approved forms, mandatory disclosures, cancellation/free-look/refund rules, claims, taxes, and compensation  
* Whether an inspection guarantee, reimbursement promise, or AI-generated coverage recommendation could itself become a warranty, service contract, indemnity, insurance, or regulated decision

Warranty/VSC, vehicle-inspection licensing, worker classification, money transmission, multistate tax, arbitration, and biometrics are launch-blocking counsel workstreams.

## **Phase 3: Required legal documents**

Draft factual, plain-language documents for counsel review. Implement approved versions as durable, versioned pages.

At minimum assess the need for:

* Privacy Policy  
* Notice at Collection and State Privacy Rights/“Your Privacy Choices”  
* Terms of Service  
* Inspection Services Agreement and state addenda  
* Technician/Organization Agreement  
* Payment, cancellation, refund, and no-show policy  
* Warranty/VSC disclosure and governing provider contract  
* E-SIGN consumer consent  
* Community Guidelines and Acceptable Use Policy  
* DMCA Policy  
* Cookie/tracking notice and controls  
* Accessibility Statement  
* AI-processing disclosure and limitations  
* Marketing email/SMS consent language  
* Technician/candidate privacy notice where applicable

Every published page must:

* Use `https://www.perfectppi.com` as the canonical domain  
* Include an effective date, last-updated date, and version  
* State: **“PerfectPPI is a product managed by DnD Solutions & Optimization LLC.”**  
* Use `info@dndsolutions.io` for applicable support and privacy contact purposes  
* Be accessible without signing in  
* Be linked from the homepage/footer and every relevant login, signup, checkout, e-sign, settings, community, and account-deletion flow  
* Avoid claims not proven by the data inventory and implementation

The Privacy Policy must accurately address categories and sources of information, purposes, public content, Google/Apple data, vehicle/VIN/OBD/location/media data, messages and UGC, technician/organization data, payments/contracts, AI processing and moderation, processors and disclosures, cookies/analytics, sale/share/targeted-ad practices, retention, backups, security, individual rights, appeals, authorized agents, GPC, minors, international processing, updates, and contact procedures.

The Terms must accurately cover eligibility, account security, roles, technician/organization relationships, inspection scope and point-in-time limitations, no safety/roadworthiness/hidden-defect guarantee, OBD limitations, marketplace responsibilities, seller accuracy, UGC licenses and moderation, payments/refunds/cancellations, e-signatures, third-party warranty/VSC roles, prohibited conduct, suspension, termination, IP, disclaimers, liability, indemnification, dispute terms, state savings clauses, and platform terms.

Do not add arbitration, class-action waiver, governing law, indemnity, warranty disclaimer, or liability-cap language without explicit licensed-counsel approval and a properly designed assent process.

## **Phase 4: Required functionality and code changes**

Implement or remediate:

1. Public legal routes returning HTTP 200 without login—at minimum `/privacy`, `/terms`, and `/support`, plus the other approved policies. Replace every `#` legal link.  
2. Canonical metadata, sitemap entries, and consistent links using `https://www.perfectppi.com`.  
3. Versioned clickwrap for binding agreements. Store user/account ID, document version/hash, timestamp, source, and necessary evidence. Keep Terms acceptance distinct from a Privacy Policy notice and from optional marketing consent. Re-obtain acceptance when counsel determines a material update requires it.  
4. A privacy center supporting access, portable export, correction, deletion, appeal, authorized-agent requests, and request-status tracking. Implement identity verification, counsel-approved deadlines, audit records, nondiscrimination, and processor propagation.  
5. Web and native iOS account deletion. Require appropriate confirmation/reauthentication, revoke sessions and provider authorization, invalidate share links and push tokens, delete or restrict database/storage/vendor data, handle public UGC and legal holds, disclose retained categories and reasons, and provide completion confirmation. Supabase administrative deletion must remain server-side; never expose the service-role credential.  
6. Google/Apple identity management, including safe authenticated identity linking. Apple Hide My Email can create a separate identity even when the user has another account; do not rely on email-only automatic linking.  
7. Cookie/tracking controls based on the actual deployed technology. Honor GPC/UOOM where required. Do not display a meaningless consent banner if no optional tracking exists, and do not state “we do not sell/share” until verified.  
8. Marketing preference and unsubscribe controls, durable suppression, and separation of transactional versus marketing communications. A valid physical postal address is required before commercial email campaigns—flag this missing company fact.  
9. Retention schedules and enforceable deletion jobs for every system and processor, with documented backups and legal holds.  
10. Private storage for contracts and non-public media, using authorization and short-lived signed URLs. Ensure record deletion also cleans up R2 objects. Public object URLs must fail anonymously.  
11. Accurate technician/seller verification. Users must not be able to self-assert credentials that the product markets as verified. Store evidence, verification authority, expiration, revocation, and audit history, or revise the claims.  
12. Appropriate report, block, appeal, copyright, safety, and moderation functionality for every UGC surface—not only community posts. Strip unnecessary EXIF/location metadata and minimize exposed VINs and personal information.  
13. AI disclosures, data minimization, vendor configuration/contract review, and human review or correction where outputs affect safety, technician access, claims, warranty eligibility, or similar significant outcomes.  
14. WCAG 2.2 AA remediation and automated plus manual keyboard, screen-reader, zoom, focus, error, contrast, reduced-motion, accessible-authentication, VoiceOver, and Dynamic Type testing. Do not claim conformance until verified.  
15. A WISP/security program, incident-response and breach-notification playbook, vendor-security review, access control/MFA, encryption, audit logging, backup/recovery, vulnerability handling, and tabletop procedure proportionate to the application.

## **Google requirements**

Preserve the working Google integration and verify:

* Homepage: `https://www.perfectppi.com/`  
* Privacy: `https://www.perfectppi.com/privacy`  
* Terms: `https://www.perfectppi.com/terms`  
* Authorized domain: `perfectppi.com`  
* JavaScript origin: `https://www.perfectppi.com`  
* Google redirect URI:  
  `https://rnufzjpswyqxdkciglbi.supabase.co/auth/v1/callback`  
* Supabase Site URL: `https://www.perfectppi.com`  
* Supabase application redirect: `https://www.perfectppi.com/callback`  
* Only the three basic identity scopes listed above  
* External/production audience and accurate PerfectPPI branding  
* Search Console domain verification and Google Branding/Verification Center completion  
* The homepage publicly identifies and describes the application and links the same Privacy and Terms URLs submitted to Google  
* Correct Google button branding  
* Secure handling of OAuth secrets and tokens  
* A user-visible disconnect/revocation and deletion explanation  
* Clear disclosure of what Google data is received and why  
* No Gmail, Drive, or other sensitive/restricted scopes unless separately justified, researched, approved, and verified

Where factually applicable, include Google’s recommended disclosure: “PerfectPPI’s use of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.”

## **Apple requirements**

Research and implement the current Apple/Supabase/native requirements, including:

* Correct Apple Developer team and explicit native App ID/bundle ID  
* Sign in with Apple capability and iOS entitlement  
* Associated web Services ID  
* Native AuthenticationServices flow and approved Apple button  
* An Apple option at least as prominent and usable as other third-party login choices  
* Services ID first and native bundle ID second in Supabase’s allowed Apple Client IDs  
* Apple web domain: `rnufzjpswyqxdkciglbi.supabase.co`  
* Apple return URL:  
  `https://rnufzjpswyqxdkciglbi.supabase.co/auth/v1/callback`  
* App-side redirect through Supabase to:  
  `https://www.perfectppi.com/callback`  
* Correct nonce/state handling and no insecure nonce bypass  
* A securely stored `.p8` signing key and generated ES256 client-secret JWT; Supabase receives the JWT, not the `.p8`  
* Client-secret rotation before its maximum six-month expiration, with an owned runbook, monitored reminder, dry-run, and failure alert  
* Share Email, Hide My Email, canceled login, repeat login where the name is no longer returned, duplicate identity, and account-linking tests  
* Registration and SPF/DKIM configuration of actual sending domains/addresses for Apple Private Email Relay  
* In-app account deletion and Apple token revocation before local account deletion  
* Native credential-revocation state handling  
* Accurate App Store privacy answers, privacy-policy URL, privacy manifest, required-reason APIs, and permission-purpose strings  
* Standard Apple EULA versus a counsel-approved custom EULA  
* Current App Store Review Guidelines, especially Sections 4.8 and 5.1.1

Supabase documentation has stated that its Apple integration does not support Apple’s server-to-server notification URL. Recheck the current documentation. If it remains unsupported, do not point Apple to a fake endpoint or mark the requirement complete. Either implement and securely validate an idempotent first-party notification endpoint for consent/account/email changes or document the limitation, residual risk, and counsel/product decision.

## **Verification and acceptance tests**

Before calling the task complete, provide evidence that:

* Public homepage, Privacy, Terms, Support, and approved policy URLs return 200 without authentication.  
* Footer and all relevant product flows contain real legal links.  
* Google consent links exactly match the public canonical URLs.  
* Google first/repeat login, logout, disconnect, and deletion work.  
* Apple Share Email, Hide My Email, repeat login, cancellation, relay delivery, linking, revocation, secret rotation, and account deletion work on web and iOS.  
* Signup records correct versioned assent; marketing is optional and separate.  
* Users can request and receive access/export/correction/deletion and appeal where applicable.  
* Deletion tests cover Auth, sessions, app tables, R2 objects, share links, APNs tokens, partner data, processors, backups, and documented lawful-retention exceptions.  
* Private contracts and media cannot be retrieved anonymously.  
* RLS and cross-account/organization authorization tests pass.  
* No secrets occur in Git history changes, client bundles, logs, screenshots, or generated reports.  
* Unsupported “verified,” warranty, safety, AI, and inspection claims have been removed or substantiated.  
* UGC report/block/appeal/DMCA functionality works across all relevant surfaces.  
* GPC, cookie preferences, marketing suppression, refunds/cancellation, and e-sign record delivery work where applicable.  
* Axe plus manual keyboard/screen-reader/VoiceOver/Dynamic Type/reduced-motion tests pass.  
* Typecheck, lint, unit tests, integration tests, end-to-end tests, production build, database tests, and iOS build/tests pass.  
* The deployed production domain is retested—not only localhost.

## **Required deliverables**

Create or equivalent:

* `docs/compliance/data-inventory.md`  
* `docs/compliance/vendor-and-data-flow-map.md`  
* `docs/compliance/research-matrix.md`  
* `docs/compliance/gap-analysis.md`  
* `docs/compliance/open-questions.md`  
* `docs/compliance/retention-schedule.md`  
* `docs/compliance/wisp.md`  
* `docs/compliance/incident-response.md`  
* `docs/compliance/provider-compliance.md`  
* `docs/compliance/counsel-review-packet.md`  
* Versioned legal drafts and redlines  
* Database migrations, application changes, native changes, and automated tests  
* A final implementation report listing changed files, verified requirements, test results, remaining blockers, assumptions, dashboard/manual steps, and exact matters requiring counsel approval

Prioritize findings as launch blocker, high, medium, or low. Do not publish unresolved legal language merely to make links exist.

### **Mandatory starting sources**

Use these as starting points and add every applicable official federal/state/provider source:

* [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies)  
* [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)  
* [Google branding configuration](https://support.google.com/cloud/answer/15549049)  
* [Google homepage requirements](https://support.google.com/cloud/answer/13807376)  
* [Google identity branding](https://developers.google.com/identity/branding-guidelines)  
* [Supabase Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google)  
* [Supabase Apple Auth](https://supabase.com/docs/guides/auth/social-login/auth-apple)  
* [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)  
* [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)  
* [Supabase user-data management](https://supabase.com/docs/guides/auth/managing-user-data)  
* [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)  
* [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)  
* [Apple account-deletion requirements](https://developer.apple.com/support/offering-account-deletion-in-your-app/)  
* [Apple token revocation for account deletion](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)  
* [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)  
* [Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests)  
* [Apple Private Email Relay](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service)  
* [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)  
* [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)  
* [FTC breach-response guide](https://www.ftc.gov/business-guidance/resources/data-breach-response-guide-business)  
* [FTC Consumer Review Fairness Act](https://www.ftc.gov/legal-library/browse/statutes/consumer-review-fairness-act)  
* [Federal E-SIGN statute](https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title15-section7001)  
* [DOJ web-accessibility guidance](https://www.ada.gov/resources/web-guidance/)  
* [WCAG 2.2](https://www.w3.org/TR/WCAG22/)  
* [Copyright Office DMCA Section 512](https://www.copyright.gov/512/)  
* [FTC federal warranty guidance](https://www.ftc.gov/business-guidance/resources/businesspersons-guide-federal-warranty-law)  
* [ROSCA](https://www.ftc.gov/legal-library/browse/statutes/restore-online-shoppers-confidence-act)  
* [California privacy rights](https://privacy.ca.gov/california-privacy-rights/rights-under-the-california-consumer-privacy-act/)  
* [Colorado universal opt-out guidance](https://coag.gov/opt-out/)  
* [NCSL state breach-law index](https://www.ncsl.org/technology-and-communication/security-breach-notification-laws)
