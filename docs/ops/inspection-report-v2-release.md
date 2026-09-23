# Inspection Report v2 Release

Release and rollback notes for the inspection report redesign specified in
`docs/perfectppi-report-handoff/` (authoritative: `05-developer-handoff.md` and
`06-field-map-and-rules.md`). Repository checks are not production approval.

## What ships

- **Typed capture (catalog 2).** Each tire, wheel and body panel is its own
  typed question (`question_key` plus an `observation` document) on web and iOS.
  A database trigger derives the legacy `answer_value` summary, so warranty,
  partner and marketplace readers keep working.
- **Certified submit.** `submit_ppi_certified` requires the accuracy statement
  (`inspection_accuracy/1`). It freezes a hashed facts snapshot and media
  manifest, rejects stale revisions (HTTP 409), replays idempotently, and
  blocks edits after submit.
- **Two-page US Letter PDF** (`src/lib/pdf/inspection-report/`), built from
  deterministic rules. It has no AI labels and no dollar amounts. A report that
  cannot fit is held as `needs_review` rather than truncated.
- **Optional photo evidence appendix.** A separate, unlimited PDF made on
  request and stored in the private R2 bucket.
- **Bounded Jev (TypeSafe) note classification.** It runs in shadow mode by
  default and can only add review-flagged suggestions.

Legacy (catalog 1) inspections and their stored outputs still render with the
legacy renderer. `report_v2` is added next to `structured_content`; nothing is
removed.

## Deploy order

1. Apply `20260923100000_inspection_report_v2_enums.sql`, then
   `20260923101000_inspection_report_v2.sql`. They are separate files because
   new enum values must be committed before they can be used.
2. Deploy the web app. Bearer (iOS) clients that do not send
   `X-PPI-Inspection-Catalog: 2` get `426 app_update_required` on catalog-2
   sessions. Catalog-1 sessions keep working for them.
3. Ship the iOS build that sends the capability header.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PPI_INSPECTION_CATALOG_V2` | on | `off` seeds the original questions for new sessions. |
| `PPI_REPORT_OVERVIEW_MODEL` | `gemini-2.5-flash` | Page-2 prose model. `off` keeps the deterministic wording. |
| `PPI_REPORT_TIME_ZONE` | `America/New_York` | Time zone printed on reports. |
| `PPI_EXTRACTION_MODEL` | `gemini-2.5-flash` | Reading suggestions for the sidewall, DOT code and placard photos. |
| `TYPESAFE_API_KEY` | unset | Jev classification. Without it, classification is off. Server-only. |
| `TYPESAFE_JEV_MODE` | `shadow` | `shadow` records only. `on` adds review-flagged suggestions. `off` disables it. |
| `TYPESAFE_JEV_MODEL` | `jev-1.13.0` | Classifier model version. |
| `R2_PRIVATE_BUCKET_NAME` | existing | Required for the appendix. Without it, exports fail with "Private storage is not configured." |

## Rollback

- Set `PPI_INSPECTION_CATALOG_V2=off`. New sessions use catalog 1. Sessions
  already on catalog 2 stay typed, because their answers cannot be downgraded.
- Set `PPI_REPORT_OVERVIEW_MODEL=off` or `TYPESAFE_JEV_MODE=off` to remove
  model involvement without redeploying.
- The migrations are additive. Rolling back the app leaves the columns, tables
  and RPCs unused. Do not drop them while any catalog-2 inspection exists.

## Product decisions to confirm

These interpret or differ from the handoff:

1. **PRESSURE-002 is `service_recommended`, as the spec says.** There is no
   tolerance band, so any confirmed cold-pressure difference from the placard
   is a service item, including a 1 psi difference. When several tires need
   it, the priority box shows one grouped step.
2. **A VIN that differs from intake is `service_recommended`** on checklist
   row R01.
3. **Damage entries have no silent defaults.** The inspector must choose the
   type and confirmed/suspected (the extent, for body panels). The client, the
   zod schema and the database guard all reject missing values.
4. **Body diagram markers use each panel's default position.** There is no
   tap-to-place.
5. **iOS review has no "report will flag" preview.** The web review screen
   has it.
6. **The appendix is built by the output worker tick.** It also starts right
   away through `after()` when requested.

## Known gaps

- The media manifest hash covers the media list, not each file's bytes. No
  per-file content hashes are stored.
- No admin tool resolves `needs_review` (layout overflow) outputs. Downloads
  return 409 until a new output version is generated.
- The appendix is not exposed to partners or the marketplace. This is
  intentional: the redacted projection is unchanged.
- The pressure-loss recheck UI is minimal.

## Verification done

- `npm run typecheck`, `npm run lint`, `npm run i18n:check`,
  `npm run test:unit` (417), `next build`. The build confirms that the layout
  spec and fonts are traced.
- All 69 SQL tests pass on a fresh replay of every migration, including
  `supabase/tests/inspection_report_v2.test.sql`.
- iOS: the simulator build, 14 XCTests, the editor render snapshot, and
  `sync-string-catalog.py --check`.
- A local API run against a throwaway Supabase stack checked:
  - 426 for old clients.
  - Catalog-2 seeding.
  - Typed validation (422), required certification (400), missing evidence
    photos (400), stale revision (409), and certified submit with replay.
  - Edits rejected after submit, and PATCH returning 405.
  - A report rendered from the certified snapshot.
  - The appendix authorization, queueing and idempotency, the not-ready 409,
    and failure without private storage.

## Before enabling in production

- Print both pages in grayscale. Status words and symbols must stay distinct.
- Capture on a physical iPhone, including offline queueing of typed answers.
- Make sure the hosted database has the grants the output pipeline needs.
  A fresh local replay needed manual grants on `standardized_outputs`,
  `vsc_outputs` and `audit_logs` (pre-existing and tracked separately).
- Set `R2_PRIVATE_BUCKET_NAME` and, if Jev is wanted, `TYPESAFE_API_KEY`.
