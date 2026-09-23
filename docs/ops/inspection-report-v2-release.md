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
   `20260923101000_inspection_report_v2.sql`, then
   `20260923110000_inspection_body_marker_view.sql`, then
   `20260923113406_ppi_pressure_recheck_validation.sql`, then
   `20260923120000_output_review_audit_action.sql`, then
   `20260923120715_inspection_output_table_privileges.sql`, then
   `20260923130000_ppi_media_content_hashes.sql`. The first two are separate
   because new enum values must be committed before they can be used. The
   third only replaces the observation guard so it also checks the marker
   view. The fourth requires a second reading and elapsed interval when a
   pressure recheck is claimed. The fifth adds the `output_review_released`
   audit action. The sixth makes legacy output/audit grants explicit for fresh
   databases. The seventh adds per-photo content facts and replaces
   `submit_ppi_certified` so the manifest freezes them.
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
4. **Body damage markers are tap-to-place and optional.** Each body damage
   entry can be marked on the generic top-view diagram
   (`src/features/ppi/body-diagram.ts`, mirrored in
   `mobile-app/PerfectPPI/Core/Models/BodyDiagram.swift`). Markers are stored
   as `{view: "top", x, y}`. A tap is clamped onto the entry's own panel, the
   API rejects an off-panel marker, and the renderer clamps again. Colliding
   markers spread out within their panel. Entries without a marker use the
   panel's default position. The top view shows a side panel as a narrow
   strip, so a marker there gives position along the car, not height.
5. **iOS review has no "report will flag" preview.** The web review screen
   has it.
6. **The appendix is built by the output worker tick.** It also starts right
   away through `after()` when requested.
7. **Certified originals follow the inspection retention lifecycle.** Submitted
   media cannot be edited or removed independently. Its verified private
   object is retained for the frozen manifest until the owner legitimately
   deletes the underlying inspection, at which point the inspection records,
   reports and evidence objects are deleted together.

## Held reports

When every urgent action cannot fit after approved consolidation, the output
version is held (`needs_review`) and downloads return 409. It is not truncated.
Admin → Outputs lists held reports under **Held for review**. It also lists
outputs whose final render failed with a layout error.

The review page (`/admin/outputs/<id>/review`) shows why the report was held
and every finding, urgent first. The admin may rewrite only the printed summary
text: the priority box, the category blocks and the scope line. Findings,
statuses and actions are certified and cannot be changed. Release requires all
of the following, and the server checks them again:

- Edited text cites every urgent finding by reference, such as `[T1, T4]`. The
  priority box cites all of them, and each category block cites its own.
- Edited text does not cite unknown findings or use AI or model labels,
  prices, or pass/fail wording, and stays within the length limits.
- Every region fits its measured space, and both pages render.
- The admin ticks the faithfulness confirmation (`report_review/1`).

Release updates the stored report in place for the same output version (no
PDF existed yet). The update is guarded against concurrent or stale releases.
Release then records an `output_review_released` audit entry with the previous
text and re-queues that version's job to store the files. The stored report
keeps a `review_resolution` record (when, which regions, which reasons), but
not who released it; the audit log holds that.

A render failure outside the editable text, such as a page-1 tire card, cannot
be fixed here. The check reports the same error, and it needs an engineering
fix.

## Photo content hashes

Each attached upload has a server-verified SHA-256, exact byte size, sniffed
content type, and image dimensions and EXIF orientation. They are stored on
`ppi_media` and frozen into every certified media manifest entry.

- **When:** the server reads the stored object back right after it is attached
  (in the background). Submit fills in any still missing just before
  certifying.
- **Rules:** clients cannot set these fields, and a recorded hash can never
  change, even for the service role. Recording one does not bump the
  inspection revision.
- **Certification:** the RPC refuses a photo without a hash
  (`media_unverified`). The submit route returns 503 with `Retry-After`. The
  web and iOS apps say the photos are still being verified.
- **Appendix:** the evidence appendix checks each photo's bytes against the
  certified hash and size. A changed object is shown as unavailable ("does
  not match the certified copy") and the appendix is marked incomplete. Each
  printed photo shows the first 16 characters of its hash.
- **Older manifests:** manifests certified before this change have no hashes.
  The appendix prints them without a check.

## Deliberate boundaries

- The appendix is not exposed to partners or the marketplace. This is
  intentional: the redacted projection is unchanged.
- Certified photos use immutable, server-verified private object references
  rather than duplicate content-addressed copies. Submitted-media guards stop
  ordinary replacement/deletion; explicit whole-inspection deletion remains
  the retention-policy boundary.

## Follow-up gaps closed

- Web and iOS collect the pressure recheck reading and elapsed interval
  whenever loss or retention was observed. Schema and database validation
  enforce the same claim, and the evidence appendix prints the values.
- Photo reading suggestions reuse an exact-byte match by SHA-256 only when
  target, model, schema and prompt versions all match. A reused result is
  cloned to the current media record so inspector confirmation provenance
  remains local to that upload.

## Verification done

- `npm run typecheck`, `npm run lint`, `npm run i18n:check`,
  `npm run test:unit` (438), `next build`. The build confirms that the layout
  spec and fonts are traced.
- All 71 SQL tests pass on a fresh replay of every migration, including
  `supabase/tests/inspection_report_v2.test.sql`.
- iOS: the simulator build, 16 XCTests, one UI test, the editor render
  snapshot, and `sync-string-catalog.py --check`.
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
- Set `R2_PRIVATE_BUCKET_NAME` and, if Jev is wanted, `TYPESAFE_API_KEY`.
