# Compliance Gap Analysis

Status as of September 2, 2026. “Implemented” means an engineering control exists; it does not mean legal approval or operational verification is complete.

## Launch blockers

| Gap | Evidence/status | Required next action |
|---|---|---|
| Sign in with Apple absent while Google is offered on iOS | Google exists; Apple entitlement/native flow absent | Configure credentials/capability/server and complete Apple tests |
| VSC/warranty nationwide role and terms unresolved | Code paths exist; disclosure blocks reliance; no approved provider/state packet | Keep paid issuance disabled; engage specialist counsel/provider |
| Retention and end-to-end deletion incomplete | Request intake implemented; schedules/R2/vendor propagation not approved | Approve schedule and build/test deletion orchestrator |
| Company/legal contract facts missing | No postal address, governing law, dispute/refund terms | Owner supplies facts; counsel approves agreements |
| 50-state inspection/licensing/worker classification incomplete | Product operates nationwide | Specialist counsel matrix and state launch controls |

## High priority

| Gap | Implemented mitigation | Remaining work |
|---|---|---|
| No public legal center | Public Privacy, Terms, Support, choices, notice, AI, community, accessibility, copyright, VSC disclosure; canonical/sitemap/footer | Counsel approve and production 200/link tests |
| No auditable assent | Version/hash/time/source table and web/iOS gates | Migration deploy; confirmation/OAuth/browser/device tests; material-change runbook |
| No privacy request UI | Web/iOS intake, status and deletion initiation | Staff queue, verification, deadlines, export, propagation, completion and appeal operations |
| Google disconnect absent | User-visible, lockout-safe unlink endpoint/UI | Verify provider revocation semantics and first/repeat login tests |
| Unsupported “verified” and marketing claims | Public copy revised | Full route/content scan and credential system if claims return |
| Private object/deletion uncertainty | Private R2 scheme exists for quarantine/reports | Inventory each upload; anonymous-denial and orphan cleanup tests |
| UGC controls uneven | Community moderation/report/appeal hardened | Extend report/block/appeal/DMCA/safety to all UGC surfaces |

## Medium priority

- Complete WCAG 2.2 AA automated and manual evidence; accessibility page currently makes no conformance claim.
- Finalize iOS privacy manifest/App Store answers from actual archive and processor configuration.
- Strip metadata from web images and native video where supported; remediate legacy media.
- Implement marketing preference/suppression only if marketing launches; avoid a meaningless cookie banner while optional tracking is absent.
- Consolidate or formally justify duplicate auth callback routes.
- Add a staff dashboard/SLA alerts for privacy and moderation queues.

## Implemented safeguards

- Google basic scopes preserved; no sensitive Google API scope added.
- Public legal routes and real links; canonical origin is `https://www.perfectppi.com`.
- Versioned Terms acceptance and privacy request tables have RLS and server-mediated writes.
- Account deletion can be initiated inside iOS and web settings.
- Gemini/OBD/public-content disclosures are factual and visible.
- iOS still-image metadata removal and expanded privacy manifest categories.
- No optional ad/behavioral analytics was found in source or the inspected deployed public homepage; this must be rechecked after deployment/config changes.
