# COGS and unit economics

Companion to [`PerfectPPI-COGS-model.xlsx`](PerfectPPI-COGS-model.xlsx) (live formulas; change the `Inputs` sheet and everything recalculates). This page records the base case and, more importantly, which numbers are facts from this repository and which are planning assumptions that need real quotes.

Three products:

1. **Consumer PPI** — the inspection itself, in the four delivery modes the code supports (`ppi_type` personal / general_tech / certified_tech, plus the `dents_tires` scope).
2. **Vehicle service contract (warranty)** — the VSC plans the app generates after an inspection.
3. **Shop pre-estimate inspection** — the shop-performed, AI-read intake inspection positioned against Detect Auto.

COGS here means the cost to deliver one more unit. Salaries, sales, marketing, technician recruiting, R&D, and app-store commission are deliberately excluded.

## Base case (as of September 20, 2026)

| Product | Revenue / unit | COGS / unit | Gross profit | Gross margin |
|---|---:|---:|---:|---:|
| Consumer PPI — self-inspection (personal) | $19.00 | $1.94 | $17.06 | 89.8% |
| Consumer PPI — general technician | $149.00 | $123.09 | $25.91 | 17.4% |
| Consumer PPI — certified technician | $229.00 | $166.61 | $62.39 | 27.2% |
| Consumer PPI — dents & tires scope | $79.00 | $79.86 | ($0.86) | (1.1%) |
| VSC — Basic $599, 1 yr | $599 | $347.62 | $251.38 | 42.0% |
| VSC — Standard $999, 2 yr | $999 | $579.22 | $419.78 | 42.0% |
| VSC — Premium $1,499, 3 yr | $1,499 | $868.72 | $630.28 | 42.0% |
| Bundle — certified PPI + Standard VSC | $1,228 | $745.83 | $482.17 | 39.3% |
| Shop pre-estimate — per-inspection billing ($4) | $4.00 | $0.53 | $3.47 | 86.8% |
| Shop pre-estimate — $299/month subscription (per-inspection equivalent at 120/month) | $2.49 | $0.48 | $2.01 | 80.6% |

Revenue figures for the consumer PPI and the shop product are **assumptions** (nothing in the repo prices an inspection). VSC prices are the ones the code offers.

## What the numbers say

**The inspection is a labor business; the infrastructure is a rounding error.** Delivering one technician inspection costs about $0.19 in AI + storage + hosting (two Gemini 2.5 Flash calls on up to 16 photos, R2 storage over 36 months, a share of Supabase/Vercel). Technician payout plus travel is 85–90% of COGS. At a $95 payout and $149 price the general-tech inspection clears 17%; every $15 of payout moves margin by ~10 points (sensitivity table on the `Summary` sheet). The levers are routing density, payout structure, and price — not the AI bill.

**The dents & tires scope does not work at $79 with a $55 payout.** It is negative after travel, refunds, insurance, and Stripe. Either it is priced at $99+, the payout is $40 (a 20-minute scope), or it is only sold as the underwriting gate for the dents/tires coverage product where the contract margin pays for it.

**The self-inspection costs cents.** COGS is $1.94 and most of that is a support-ticket allowance and Stripe's $0.30. It can be free, a lead product, or a low-priced entry — a product decision, not a cost one. If it is sold as an in-app purchase, Apple's 15–30% is the biggest line and must be decided before pricing.

**The VSC is where the margin is, and it is the one product the company cannot price on its own.** Under the near-term structure (a licensed obligor sells PerfectPPI the contract at wholesale, assumed 55% of retail) every plan runs ~42% gross margin — but the wholesale share is the single most important unknown in the whole model: at 45% margin is 52%, at 65% it is 32% (sensitivity on the `Warranty COGS` sheet). `docs/compliance/open-questions.md` still has obligor, administrator, licensing, financial security, and tax unresolved per state, and the paid flow is launch-blocked. Do not quote a VSC margin externally until there is a signed administrator agreement. The model also has a structure-2 view (self-obligated: expected claims + TPA + CLIP) for comparison only; self-obligating requires reserves and licensing the company does not have.

**The shop product is a software margin.** No labor; a 30-photo inspection costs about $0.13 in Gemini tokens (two calls), $0.03 in storage, and ~$0.35 in onboarding, support, platform share, and Stripe — roughly $0.50 all-in. Per-inspection or subscription billing both clear 80–90%. The cost that matters is not COGS: it is sales, onboarding, and whether Gemini 2.5 Flash is accurate enough for damage detection. If a Pro-class model or a second pass per photo is needed, the AI line scales by that factor and the margin barely moves. The competitor price on `Inputs` is a placeholder — fill it from a Detect Auto quote before using the "shop's monthly saving" row.

## Facts from the repository (do not re-assume these)

| Fact | Where |
|---|---|
| AI model: Gemini 2.5 Flash; two model calls per inspection (standardized report + VSC determination); up to 16 photos sent per call | `src/lib/ai/gemini.ts`, `src/features/outputs/pipeline.ts`, `src/features/outputs/inspection-photos.ts` (`INSPECTION_PHOTO_LIMIT`) |
| 76 inspection prompts, 9 of them photo-required | `src/features/ppi/constants.ts` |
| Two PDFs generated server-side per inspection (no vendor cost) | `src/lib/pdf/*` |
| VSC plans: Basic $599 / Standard $999 / Premium $1,499 (1/2/3 yr, 12k/24k/36k mi, $100/$75/$50 deductible); conditional-eligibility vehicles: $799 / $1,399 | `src/features/warranty/actions.ts` (`buildPlansFromCoverage`) |
| Payments: Stripe Checkout; e-signature: DocuSeal | `src/lib/stripe`, `src/lib/docuseal` |
| Storage: Cloudflare R2 (private bucket for artifacts; egress free) | `src/lib/storage/r2.ts` |
| OBD hardware: OBDLink CX (~$99 retail) | `docs/OBD Tool.md` |
| VSC paid flow is launch-blocked pending obligor/licensing decisions | `docs/compliance/open-questions.md`, `docs/compliance/retention-schedule.md` |
| Delivery modes: `ppi_type` personal / general_tech / certified_tech; `inspection_scope` complete / dents_tires | `supabase/migrations/005_ppi_requests.sql`, `20260907140000_inspection_scope_and_answer_photos.sql` |

## Assumptions that need real numbers (yellow cells on `Inputs`)

- Technician payouts ($95 general / $135 certified / $55 dents & tires) and travel ($12). Replace with the actual contractor agreement.
- Consumer PPI prices ($19 / $149 / $229 / $79).
- VSC wholesale share (55%) — from the administrator quote. This is the number that decides whether the warranty is a 30% or 50% product.
- Insurance allocation ($4 per technician inspection) — annual GL/E&O premium ÷ expected volume.
- Planning volumes (200 consumer inspections/month, 20 shops × 120/month) — only used to spread the ~$145/month fixed platform cost; at these volumes it is $0.06 per unit and does not matter.
- Shop pricing ($4 per inspection or $299/month) and the Detect Auto reference price.
- Vendor list prices (Gemini, R2, Stripe) — verify against invoices; they are small enough that being 2× wrong changes nothing.

## Method notes

- AI cost = calls × ((prompt tokens + photos × tokens per photo) × input price + output tokens × output price). Tokens per photo defaults to 6,192 (a 12 MP photo tiled into 24 × 768 px crops at 258 tokens each); downscaling to ≤768 px before the call cuts that to 258 and the AI line by ~20×, which is worth doing on the shop product.
- Storage = (photos × MB + PDFs) × R2 $/GB-month × retention months, plus write operations.
- Warranty structure 1 COGS = wholesale share × retail + e-sign + Stripe + tax; structure 2 = loss ratio × retail + TPA fee + CLIP + the same. Cancellations are pro-rata both ways and left out.
- Refund/redo allowance = 3% × (payout + travel) on technician inspections.
