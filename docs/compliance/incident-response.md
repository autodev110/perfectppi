# Security Incident and Breach Response Playbook

Status: implementation draft pending named contacts, insurer and counsel. Do not delay containment while determining whether legal notice is required.

## Severity

- SEV-1: confirmed/likely unauthorized access to sensitive or broad personal information, signing/payment/auth compromise, destructive production event, active public exposure or safety impact.
- SEV-2: contained unauthorized access, limited personal-data exposure, important control bypass or material service compromise.
- SEV-3: suspicious event, attempted abuse, low-impact misconfiguration or vulnerability without evidence of access.

## First response

1. Open a restricted incident record; record reporter, UTC timeline, systems, data, people and decisions.
2. Notify the incident commander, Security Owner, Privacy Owner and qualified breach counsel. Notify cyber insurer before engaging vendors when policy conditions require.
3. Contain without destroying evidence: revoke/rotate affected credentials, disable exposed links/integrations, isolate workloads, preserve logs/snapshots and block active abuse.
4. Do not erase or power down relevant systems until evidence needs are assessed. Use approved secure channels; do not paste personal data or secrets into general chat/tickets.
5. Scope affected accounts, states, data elements, encryption/key status, acquisition/access evidence, duration, vendors and downstream recipients.

## Investigation and remediation

- Preserve chain of custody and hash exported evidence where appropriate.
- Identify root cause, attacker actions, persistence, exfiltration indicators and affected backups.
- Patch the cause, rotate reachable secrets/tokens, invalidate sessions/share links, verify RLS/bucket policies and monitor recurrence.
- Ask each affected processor for timeline, data, logs, containment and contractual notice facts.
- Test remediation before restoring normal operation; increase monitoring for an approved period.

## Legal assessment

- Counsel determines whether an incident is a statutory “breach,” affected jurisdictions, exemptions/risk-of-harm analysis, regulator/consumer/credit bureau/law-enforcement notice, content, timing and delay rules.
- All 50 states and DC have breach-notification laws. Use the current official statutes for each affected resident; the NCSL index is discovery support, not the final legal authority.
- Assess FTC, payment-card/Stripe, Apple/Google/Supabase/Vercel/Cloudflare, contract, law-enforcement and insurance reporting separately.
- Never promise a notice deadline in advance of jurisdiction/data analysis. Preserve counsel direction and the basis for any no-notice decision.

## Communications

- One authorized spokesperson. Be accurate, timely and useful; do not speculate, minimize, conceal or overstate.
- Consumer notice should identify what happened, dates, data, actions taken, protective steps, contact and legally required regulator/credit information.
- Support scripts must avoid collecting unnecessary IDs over email and must route fraud/safety reports urgently.
- Notify partners only through authenticated contract contacts and record delivery.

## Recovery and closure

- Confirm containment, credential rotation, restored integrity, monitoring and processor remediation.
- Complete required notices and retain delivery evidence.
- Conduct a blameless post-incident review covering root cause, controls, response, communications and legal process.
- Assign corrective actions with owner/severity/due date; update WISP, threat model, vendor review and training.
- Management and counsel approve closure. Run a tabletop after material process changes.

## Contacts to complete before production launch

Incident commander; security/privacy owners and backups; outside breach counsel; forensic provider; cyber insurer/broker; Vercel, Supabase, Cloudflare, Google, Apple, Stripe, DocuSeal, OpenAI and DealerSpace escalation contacts; law enforcement decision contact; communications lead; customer-support lead.

