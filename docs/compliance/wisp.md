# Written Information Security Program (WISP)

Status: implementation draft pending appointment of owners and management approval. Version 1.0, September 2, 2026.

## Scope and objectives

This program covers PerfectPPI production, development, mobile, Supabase, Vercel, Cloudflare R2, identity, AI, payment, e-signature, push and partner systems. Objectives are confidentiality, integrity, availability, least privilege, data minimization, recoverability and timely incident response.

## Governance

- Management must name a Security Owner, Privacy Owner and backups. The Security Owner maintains this program and reports material risk.
- Review at least annually and after a material incident, architecture/vendor change or applicable-law change.
- Maintain current system/data/vendor inventories, owners, risk ratings and remediation dates.
- Exceptions require written scope, rationale, compensating controls, approver and expiry.

## Access and identity

- Require unique accounts, least privilege and MFA for source control, production, cloud, Supabase, Vercel, Cloudflare, Apple, Google, Stripe and DocuSeal administration.
- Prohibit shared privileged credentials. Review access on role change and on a management-approved cadence; revoke promptly on separation.
- Keep service-role, R2, signing, webhook and provider secrets server-side in managed environment storage. Rotate on exposure and provider schedule.
- Log privileged changes, moderation actions, partner credentials, exports, deletion and legal-hold operations.

## Application and data security

- Enforce RLS and server-side authorization; test owner, cross-account, cross-org and anonymous cases.
- Use TLS in transit and provider encryption at rest. Treat bearer share links and signed URLs as credentials; scope, expire and revoke them.
- Store contracts, messages, moderation quarantine and non-public reports in private storage. Public buckets are permitted only for intentionally public approved content.
- Validate files by type/size, randomize object keys, strip unnecessary image metadata, scan/hold untrusted media and prevent active-content execution.
- Separate production and nonproduction. Do not use production personal information in tests unless explicitly approved and protected.
- Maintain dependency scanning, secret scanning, code review and timely patching based on severity/exposure.

## Development and change management

- Require peer review and passing typecheck/tests/build for material changes.
- Threat-model auth, payments, uploads, public links, partner callbacks, deletion and AI changes.
- Use migrations with RLS, constraints and rollback/recovery consideration. Never edit production schema ad hoc without an incident-approved exception.
- Verify provider dashboard changes with a second reviewer for OAuth, DNS, storage, payment, e-sign and signing-key settings.

## Vendors and AI

- Before approval, review security, DPA, subprocessors, data location, retention/deletion, model training, breach notice, access controls and termination assistance.
- Send AI vendors only fields needed for the feature; prohibit passwords, full payment-card data and unrelated message/account data.
- Do not permit unreviewed AI output to make safety, repair, warranty, claim, employment, access or other significant decisions.

## Resilience and response

- Document backup scope, encryption, access, retention and restore testing. Restores must replay deletion/hold state before release.
- Maintain the incident-response plan, contact tree, evidence process, regulator-state matrix and customer templates.
- Conduct an annual tabletop and restore exercise; track findings to closure.

## Required evidence

Access reviews; MFA screenshots without secrets; vendor reviews; vulnerability/patch records; RLS tests; bucket anonymous-denial tests; backup restore results; incident/tabletop records; deletion samples; training acknowledgments; exception register; and annual management approval.

