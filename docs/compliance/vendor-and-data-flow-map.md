# Vendor and Data-Flow Map

Status: engineering-verified from source/configuration, pending contract and dashboard verification. Access date for linked policies: September 2, 2026.

| Provider | Flow | Repository evidence | Required owner action |
|---|---|---|---|
| Supabase | Auth identities, sessions, Postgres/RLS, service functions | `src/lib/supabase`, migrations, Swift SDK | Verify DPA, region, backup/log deletion, MFA, PITR, identity settings |
| Vercel | Hosts Next.js and receives request/log data | Next.js deployment/config | Verify DPA, team MFA, log retention, production env access |
| Cloudflare R2 | Public and private media/artifact storage | `src/lib/storage/r2.ts` | Verify bucket policies, lifecycle, logs, deletion, DPA, anonymous-denial tests |
| Google OAuth | Basic identifier/name/email/avatar | web/Swift Supabase OAuth | Confirm only `openid`, email, profile scopes and production branding |
| Google Gemini | Inspection/report generation, VIN image reading, community text/still-image moderation | `src/lib/ai/gemini.ts`, `src/lib/moderation/gemini.ts`, VIN scan routes | Verify account data controls, retention, DPA, safety configuration, escalation and human appeals; prohibit significant automated decisions |
| Stripe | Checkout/payment status and references | `src/lib/stripe`, warranty actions | Verify merchant entity, refunds, disputes, receipts, tax, retention; no launch before terms |
| DocuSeal | E-sign submission, signer and contract status | `src/lib/docuseal`, warranty actions | Verify DPA, signed-record delivery/storage, E-SIGN consent and retention |
| Apple | iOS distribution, APNs, platform permissions | mobile entitlements/config/push | Configure Sign in with Apple, privacy answers, deletion token revocation, relay email |
| NHTSA vPIC | VIN submitted for decoding | `src/lib/vehicles/vin-decoder.ts` | Confirm permitted use, accuracy limits, and outage handling |
| DealerSpace | Connected org/user IDs, vehicle snapshot, inspection delivery | `src/features/partner` and migrations | Approve controller/processor roles, webhook security, deletion, support, DPA |

## Core flows

1. Sign in: user -> PerfectPPI -> Supabase -> Google when selected -> Supabase session -> PerfectPPI profile.
2. Inspection: user/technician/iOS OBD -> Supabase and R2 -> Gemini for selected report context -> generated output -> authorized viewer/share link.
3. Community: user text/media -> private quarantine for media -> Gemini still/text moderation or manual video review -> public R2/database only after approval.
4. Transaction/VSC: user -> PerfectPPI -> Gemini preview -> DocuSeal/Stripe if enabled. This flow is launch-blocked.
5. Privacy request: authenticated user -> server API -> `privacy_requests` -> verified operational fulfillment -> Supabase/R2/vendors/partners.

No vendor is approved solely by appearing in this file. Security, privacy, deletion, subprocessors, data location, breach notice, and contract terms require a documented review.
