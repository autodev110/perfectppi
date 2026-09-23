# Inspection flow audit — 019fa14

Read-only source audit of the pulled repository, September 22, 2026. The attached pasted request is treated as the user's requested work; the reference form is visual source material, not an instruction to adopt every inspection item. No code, database, or deployed service was changed. No live inspection rows or migration history were queried, so all counts below describe **new submissions seeded by this commit**, not every historical or deployed record.

## Current source of truth and migration ordering

Questions are **not** a centrally seeded database question catalog. `src/features/ppi/constants.ts:102` contains TypeScript templates; `src/features/ppi/actions.ts:167` creates a versioned submission, seeds sections from its request's scope (`:226`), then inserts question/answer rows (`:244`). iOS consumes these server-generated rows, not its own question catalog (`mobile-app/PerfectPPI/Features/Technician/Inspection/InspectionWorkflowModel.swift:154`).

There is no stable semantic question ID. `ppi_answers.id` is a randomly generated UUID unique to that submission; business logic identifies a kind of question by its exact English `prompt`. For example, tread validation and Dents & Tires warranty evaluation join against exact prompts. The `section_type` plus `sort_order` references below are audit handles only, not immutable database IDs. A live row ID cannot be supplied without reading a particular submission.

Relevant applied-source chronology:

1. `supabase/migrations/006_ppi_submissions.sql:10`: submission UUID, request/performer, version, current flag, status, submitted/completed timestamps.
2. `supabase/migrations/007_ppi_sections_answers_media.sql:47`: answer UUID, parent section, prompt, four primitive answer types, text `answer_value`, JSON `options`, required flag and order. Media at `:67` links a section and optionally one answer.
3. `20260828163343_normalize_active_inspection_question_flow.sql:1`: only draft/in-progress submissions receive reordered sections, blank VIN/mileage prefills and one door-lock wording fix. Historical submitted versions are intentionally left alone.
4. `20260828171802_persist_inspection_deferrals_and_technician_vehicle_access.sql:5`: adds persistent `deferred_at`.
5. `20260907120000_atomic_ppi_submission.sql:1`: initial submit RPC; **superseded** by the next migration.
6. `20260907140000_inspection_scope_and_answer_photos.sql:24`: adds `complete | dents_tires` request scope and two scope-specific section types; adds per-answer `requires_photo`, `photo_prompt` (`:41`); backfills seven existing photo rules; replaces `submit_ppi_atomic` with answer/photo validation (`:88`). This is the last source definition of that RPC found.
7. `20260915120000_core_vehicle_ppi_table_privileges.sql:10`: restores submission CRUD and limits authenticated answer UPDATE to `answer_value, deferred_at` (`:16`).

Counting migrations or all historical `ppi_answers` rows will not describe today's catalog. Fresh Complete: **12 sections, 67 answers, 50 required answers, 7 answers requiring at least one image**. Fresh Dents & Tires: **2 sections, 11 answers, 4 required answers, all four requiring an image**. Existing drafts might still differ; revisions deep-copy historical answers/media rather than reseed the latest template (`actions.ts:607`, `:670`, `:699`). A new catalog needs an explicit draft/revision migration policy.

## Current fresh question catalog

| Complete section in actual workflow order | Questions / required | Source in constants.ts |
|---|---:|---:|
| Vehicle Basics | 6 / 5 | 103 |
| Exterior | 7 / 6 | 169 |
| Interior | 6 / 4 | 212 |
| Road Test | 6 / 5 | 454 |
| Dashboard & Warnings | 5 / 3 | 139 |
| Engine Bay | 6 / 5 | 249 |
| Fluids | 5 / 3 | 354 |
| Tires & Brakes | 7 / 6 | 283 |
| Suspension & Steering | 5 / 4 | 325 |
| Underbody | 4 / 3 | 427 |
| Electrical & Controls | 7 / 5 | 389 |
| Modifications | 3 / 1 | 487 |

The order is explicitly `COMPLETE_SECTION_ORDER`, `constants.ts:9`, even though sections occur in a different order in the template object. Dents & Tires remains only `wheels_tires`, `body_damage` (`constants.ts:24`). No engine, brakes, interior or road test in that scope.

Affected current prompts, exact spelling and position:

| Source section / order | Exact prompt | Type / required / image rule |
|---|---|---|
| `tires_brakes:1` and `wheels_tires:1` | Front left tire tread depth (in 32nds of an inch) | number, required; Complete photo prompt says “Capture the worst-condition tire”; D&T front-left photo required |
| `tires_brakes:2` and `wheels_tires:2` | Front right tire tread depth (in 32nds of an inch) | number, required; image required only in D&T |
| `tires_brakes:3` and `wheels_tires:3` | Rear left tire tread depth (in 32nds of an inch) | number, required; image required only in D&T |
| `tires_brakes:4` and `wheels_tires:4` | Rear right tire tread depth (in 32nds of an inch) | number, required; image required only in D&T |
| `tires_brakes:5` | Estimated brake pad life remaining | required select: `>75%`, `50–75%`, `25–50%`, `<25% (needs replacement)` |
| `tires_brakes:6` | Is there any uneven tire wear? | required yes/no, whole vehicle, no corner or severity |
| `tires_brakes:7` | Rotor condition (if visible) | optional select: `Good`, `Surface rust (normal)`, `Grooved/scored`, `Not visible` |
| `wheels_tires:5` | Any problems with the rims or tires? | optional text, optional image; not per wheel |
| `body_damage:1` | Left front fender — scratches or dents | optional text + optional image |
| `body_damage:2` | Right front fender — scratches or dents | optional text + optional image |
| `body_damage:3` | Hood — scratches or dents | optional text + optional image |
| `body_damage:4` | Left door — scratches or dents | optional text + optional image |
| `body_damage:5` | Right door — scratches or dents | optional text + optional image |
| `body_damage:6` | Body panels — scratches or dents | optional text + optional image |
| `exterior:1` | Overall paint condition | required select; at least one image required, photo prompt says all four sides but image count/views are not enforced |
| `exterior:2` | Are there any dents or dings? | required yes/no |
| `exterior:3` | Describe any dents, dings, or paint damage | optional text |
| `exterior:4` | Is there any rust visible on the body? | required yes/no |
| `exterior:6` | Are any panels mismatched or repainted? | required yes/no |

The tread helper is `src/features/ppi/answer-validation.ts:3`; it permits only integer **0–32**, with `/32 in` unit (`:14`, `:25`, `:57`). No mm input or conversion. SQL duplicates this restriction by exact prompt (`20260907140000...sql:153`), as does iOS (`InspectionWorkflowModel.swift:22`, `:319`). Merely changing the prompt would silently remove the special rule in several places. The Complete brake questions cannot supply per-corner brake lining millimeters, rotor thickness, or measured battery CCA; do not add those numbers to the form from estimates.

## Current persistence / API shape

The answer row has this effective JSON shape from PostgREST; its UUID is instance-specific:

```json
{
  "id": "answer-uuid", "ppi_section_id": "section-uuid",
  "prompt": "Front left tire tread depth (in 32nds of an inch)",
  "answer_type": "number", "answer_value": "6", "options": null,
  "is_required": true, "requires_photo": true,
  "photo_prompt": "Capture the front left tire", "sort_order": 1,
  "deferred_at": null, "created_at": "timestamp", "updated_at": "timestamp"
}
```

API save body is `{"answers":[{"answerId":"uuid","value":"6","deferred":false}]}`; validation only checks that values are strings at save time (`actions.ts:429`); final validation rejects malformed constrained values (`:523`). `options` is currently a flat string array. Multi-select, composite tire observations, typed units, per-field evidence, explicit unknown/NA status, confidence, and human confirmation are not modeled. `metadata` JSON is available on `ppi_media`, but one media row belongs to at most one `ppi_answer_id`. iOS's `PpiMedia` decoder does not expose metadata (`Domain.swift:1553`).

Media attachment API accepts parent IDs, private upload reference, media type, optional caption/time/metadata (`actions.ts:830`). It verifies section/submission and answer/section membership, owned upload reference, and deduplicates upload retries (`:850`, `:858`, `:868`, `:875`). This is reusable infrastructure; add typed evidence roles and association without losing these checks. Upload/capture time is currently client-supplied, not forensic proof of capture time.

Existing general vehicle modification entries have `tire_size` and `wheel_size` (`src/features/vehicles/timelines.ts:75`), but these are user-entered build/fitment history, not observed tire-sidewall or door-placard inspection evidence. No inspection OEM-placard, DOT, load, speed, dry-rot, or pressure fields were found by source search.

## Web and iOS behavior

- Web uses one question per screen with progress, optional section notes, camera on every question, required-answer gating and stored per-answer image gating (`inspection-workflow-view.tsx:271`, `:282`, `:340`, `:361`, `:381`). A required photo means **at least one linked image**, no evidence-role/count/composition check. The current Complete front-left/worst-tire wording can attach a rear-tire photo to the front-left tread row, so it is not reliably per-corner evidence.
- Web saves after 1.5 seconds and flushes dirty answers/sections before submission (`src/features/ppi/hooks.ts:543`, `:611`, `:719`). Skip for now persists `deferred_at`, moves the question to the end, and does not excuse a required field (`:659`). Its review screen shows progress and submit, no attestation (`inspection-workflow-view.tsx:194`).
- iOS fetches the same server sections/answers, groups them correctly by section before per-section order, and puts deferred questions last (`InspectionWorkflowModel.swift:154`). `AnswerEditor.swift:34` only supports text, yes/no, select, number. Numeric entry is a decimal keyboard even though tread values must be integers. It does not show the web tread-unit constraints in a dedicated control.
- iOS saves optimistically and stores answers/photos in an offline queue (`InspectionWorkflowModel.swift:267`; `InspectionWorkflowView.swift:491`). A locally queued photo permits next-question navigation, but submit drains the queue and blocks while pending items remain (`InspectionWorkflowView.swift:556`). Preserve this sensible offline distinction when adding extraction/confirmation states.
- iOS submits directly from the last question (`InspectionWorkflowView.swift:458`) with no review/attestation screen. `PpiAPI.swift:166` sends an empty submit body. Web also sends a bodyless POST (`hooks.ts:733`).
- Server action validates required/constrained answers, required images, then calls `submit_ppi_atomic` (`actions.ts:523`, `:562`, `:588`). Latest RPC only accepts current draft/in-progress submissions, validates scalar values and linked images, and updates submission and request together (`20260907140000...sql:88`). Submit route then durably queues report generation and kicks the worker (`src/app/api/ppi/submissions/[id]/submit/route.ts:28`).
- **No inspector accuracy attestation exists.** `certified_tech` is a performer's credential/trust tier, unrelated to the requested final “to the best of my ability” checkbox.

Static hardening finding relevant to attestation: the RPC is not the only state-writing path. `src/app/api/ppi/submissions/[id]/route.ts:33` PATCHes arbitrary `body.status`; `20260915120000_core_vehicle_ppi_table_privileges.sql:10` grants authenticated UPDATE on submissions, and performer UPDATE RLS (`019_ppi_rls_policies.sql:77`) has no status check. Source RLS also allows answer updates independent of submission status (`019...sql:152`). So a new checkbox only enforced in UI or submit route would be insufficient, and a later answer change could make an old attestation misleading. Plan a guarded database transition plus immutable submitted evidence snapshot/hash (or equivalently restrict all finalized-row mutation). This was not tested against production; treat it as a source-confirmed path to audit, not a claimed production exploit.

## Exact recommended question/flow changes (provisional, pending user choices)

Keep Dents & Tires at two sections. Add shared reusable tire cards to its `wheels_tires` section and Complete's `tires_brakes` section; the data should use identical semantics while Complete keeps its brake questions. Do not create a third D&T engine/identity section merely to add placard capture. Vehicle VIN/mileage header still comes from intake plus any confirmed inspection identity data.

Introduce stable `question_key` plus catalog/schema version, rather than using label strings as keys. Example `tires.fl.tread`, `tires.fl.sidewall`, `tires.placard`, `body.left_front_fender.condition`. Use one shared schema emitted to TS and Swift, not manually duplicated validation tables. Preserve original answer UUIDs for evidence/history and backfill semantic keys by `(scope, section_type, legacy prompt)` only where unambiguous.

Recommended grouped controls and data for both scopes:

| Group / stable semantic keys | Change and exact capture |
|---|---|
| `tires.placard` | New required attempt: door placard image or explicit unreadable/missing/inaccessible reason; OCR draft expected front/rear tire size and recommended cold pressure, each with confidence, evidence ID and inspector confirmation. Store front/rear separately for staggered fitments. Placards may not supply all load/speed requirements; use verified manufacturer documentation if absent and preserve its source. No inferred “match” when baseline is missing. |
| `tires.{fl,fr,rl,rr}.tread` | Replace prompt-bound number with unit-aware reading. Capture entered value + `mm | thirty_seconds_inch`; store exact original plus normalized mm, derived /32 for display. Prefer inner/center/outer readings if chosen; otherwise explicitly label current single reading as the minimum measured and don't pretend it is a three-point measurement. Formula 1/32 inch = 0.79375 mm. Use one normalization rule in UI, API, DB and coverage adapter. |
| `tires.{corner}.sidewall` | New sidewall photograph(s), draft/confirmed raw tire marking, parsed size, **numeric load index** (possibly dual), speed symbol, brand/model optional, and DOT date as a **four-character string** preserving leading zero (`0224`). Separate speed symbol from ZR/construction. Store raw text as evidence. Validate actual production-week/date plausibility, including future dates, with source-backed rules. Never require unsafe access to the inner-side DOT code; offer unreadable/not-accessible and manual confirmation. |
| `tires.{corner}.dry_rot` | New inspector-confirmed `none | beginning | moderate | severe` plus unknown/uninspected. Report green/yellow/orange/red per requested scale. Photo-based classifier suggests a value; inspector confirms/corrects. Correlate tire age with cracking as an anomaly to review, never a cause proof or substitute for visible condition. |
| `tires.{corner}.wear` | Replace Complete's whole-vehicle yes/no and add to D&T: `even | mild_uneven | severe_uneven`, plus `not_assessed`; optional pattern and notes. Use per-corner photo evidence. Suspension/alignment recommendations remain possible follow-up, not unsupported diagnosis. |
| `tires.{corner}.damage` | New multi-select: none, cut, bulge/bubble, exposed cords, missing rubber/chunk, suspected separation, embedded object, other; preserve unknown. Conditional prompts for object/damage location (tread shoulder/sidewall), and pressure loss. “None” exclusive with defects. Clear urgency branch for confirmed hazardous conditions; damage-specific recommendation rules and repairability need researched criteria. |
| `tires.{corner}.pressure` | New gauge measurement + unit `psi | kPa`, cold/warm/unknown context, measured time. For leakage question use `holds_pressure_observed | pressure_loss_observed | not_tested`, with method/observation if tested. One still photograph or single pressure number cannot prove a tire holds air. No automatic “no leak” assumption. |
| `tires.{corner}.fitment` | Derived comparison of confirmed installed size/service description against confirmed front/rear baseline: `match | mismatch | unknown`. Have inspector resolve OCR uncertainty; warn about verified mismatch. Keep safety finding, purchase result and warranty decision separate. A mismatch is not an automatic PPI fail per user's request. |
| `wheels.{corner}.condition` | Replace aggregate optional rim/tire note with per-corner `no_visible_damage | cosmetic_damage | structural_suspected | not_inspected`, defect tags (scratch/curb rash/bent/cracked/chunk missing), notes + image when damaged. Rim cosmetic damage stays distinct from tire failure. |
| `body.{panel}.condition` | Convert each current D&T panel's blank text field to explicit `no_visible_damage | damage_present | not_inspected` and conditional damage tags/notes/photo; keep same six base areas pending decision on more precise diagram. In Complete, add compatible panel location capture to its current overall dents/paint narrative. For roof/bumper/trunk/rear quarter missing today, obtain scope choice first; avoid silently displaying those as checked. |
| Submission attestation | Final review on both platforms with editable extracted values, unresolved/missing checks and “I certify that the observations and answers in this inspection are accurate to the best of my knowledge and ability.” Checkbox starts unchecked; server records authenticated performer, text/version, server timestamp and the finalized submission evidence hash atomically. Revisions require a fresh attestation; never copy prior assent. |

The proposed tire card can show sidewall, tread and wheel images in one place, avoiding many repetitive scalar-question screens. Sidewall extraction can run while the inspector measures tread; only low-confidence or conflicting fields need prominent correction. No image should silently fill a precise numeric tread or pressure measurement without a readable gauge/documented measurement source.

Required/unavailable semantics need separate fields. Recommended `observation_state = observed | not_inspected | unable_to_assess | not_applicable`; use `deferred_at` only as draft navigation state. A skipped item remains unresolved, not NA. `not_applicable` means the equipment/item truly does not apply; `unable_to_assess` means it exists but was inaccessible/unreadable; `not_inspected` means the check was omitted. All final exceptions need a reason. A group with missing/unknown observations cannot be green “checked and okay.” Existing values such as `Not visible` and `Not checkable` must map to unable-to-assess, not pass; `Not applicable (electric steering)` maps to NA.

## Complete page 1 — proposed 25 status rows

These are **display groupings, not 25 new questions**. Numbers below are one-based positions within current `SECTION_QUESTION_TEMPLATES[section]`, anchored by the section source table above. Keep the four tire-corner measurement cards and body diagram separate from the 25-row checklist. All raw questions, notes and photos stay in digital inspection detail; page 2 prioritizes findings. Link the PDF to those details if the user accepts a link/QR.

| # | Proposed report row | Current source observations |
|---:|---|---|
| 1 | Vehicle identity / title / history | `vehicle_basics` 1,2,4,5; keys (3) and general notes (6) in header/detail |
| 2 | Paint / panels / visible body damage | `exterior` 1,2,3,4,6; future structured panel observations populate diagram |
| 3 | Windshield | `exterior` 5 |
| 4 | Exterior lamps / lenses | `exterior` 7 + `electrical_controls` 1 |
| 5 | Seats / upholstery / adjustments | `interior` 1,2,3,5 |
| 6 | Carpet / floor mats | `interior` 6 |
| 7 | Interior odors | `interior` 4 |
| 8 | Windows / door locks | `electrical_controls` 2,6 |
| 9 | Air conditioning / heat | `electrical_controls` 3,4 |
| 10 | Infotainment / other electrical | `electrical_controls` 5,7 |
| 11 | Starting / transmission operation | `road_test` 1,2 |
| 12 | Braking during road test | `road_test` 4 |
| 13 | Road vibration / noise / drivability | `road_test` 3,5,6 |
| 14 | Dashboard / warning lamps | `dashboard_warnings` 1,2,3,5 |
| 15 | Diagnostic scan findings | `dashboard_warnings` 4 plus actual OBD snapshot, when available |
| 16 | Engine-bay fluid / coolant leaks | `engine_bay` 1,6 |
| 17 | Idle noise / engine concerns | `engine_bay` 3,4 |
| 18 | Drive belt | `engine_bay` 2 |
| 19 | Battery terminals | `engine_bay` 5; do not label this a battery capacity test |
| 20 | Fluids observed | `fluids` 1–5; compact oil/coolant/brake/transmission/steering detail; partial observation must be explicit |
| 21 | Brake pad estimate / visible rotors | `tires_brakes` 5,7; preserve percentage labels, not invented mm |
| 22 | Steering / tracking | `suspension_steering` 1,5 |
| 23 | Suspension / ride | `suspension_steering` 2,3,4 |
| 24 | Frame / underside / exhaust | `underbody` 1–4 |
| 25 | Modifications / additional concerns | `modifications` 1–3 plus notes cross-referenced to relevant row when possible |

`tires_brakes` 1–4 and 6 map to four corner cards; future tire and wheel findings extend those cards. Tire-fitment baseline belongs above cards. Page 1 need not copy cabin air filter, wipers, horn, fuel cap, measured battery CCA, parking brake adjustment, per-wheel pad thickness, or other reference-image checks absent from current flow. Adding them requires actual capture/questions and is not necessary to achieve a similar layout.

Each report group should carry `status` and `coverage_state` separately: highest confirmed actionable severity among group observations, plus complete/partial/not-assessed coverage. A red finding remains red even with another unknown item; a green-only group with missing constituents is partial rather than wholly checked. Existing yes/no polarity is mixed (“Are there leaks?” vs “Does the heater work?”), so grouping must use semantic rules, not blindly convert yes to green. Keep orange distinct where requested for dry rot; elsewhere use the approved common severity system and textual labels. Do not truncate away critical findings to fit page 2; define concise rendering with a digital-detail reference and explicit overflow rule before implementation.

## Files affected in a concrete implementation

- New forward migration: semantic question keys/version, typed observations/evidence associations or validated JSON shape, explicit exception states, attestation/snapshot, guarded submit/status transition and finalized-row protections. Avoid editing prior migrations.
- `src/features/ppi/constants.ts:76` template contract; `:283`, `:511`, `:527`, `:169` question groups; `actions.ts:244` seeding, `:429` save validation, `:523` final validation, `:607` revision copy.
- `src/features/ppi/answer-validation.ts`, new shared observation schema/rules; database submission validation currently duplicates prompt-based restrictions.
- `src/components/shared/inspection-workflow-view.tsx`, `src/components/shared/answer-input.tsx`, `src/features/ppi/hooks.ts`, `workflow-order.ts`: grouped inputs, explicit exceptions, extraction review/evidence state, final attestation.
- `src/app/api/ppi/submissions/[id]/answers/route.ts`, `.../submit/route.ts`, `.../route.ts`, `.../media/route.ts`; media validation helper in `actions.ts:830`.
- iOS `AnswerEditor.swift`, `InspectionWorkflowModel.swift`, `InspectionWorkflowView.swift`, `Core/Networking/Endpoints/PpiAPI.swift`, `Core/Models/Domain.swift:1491`, enums and offline queue payload/version handling. Old app compatibility requires versioned scalar fallback or an explicit update-required gate for new catalogs.
- `src/features/warranty/dents-tires-coverage.ts:61`: exact prompts currently control corner/wheel/body mapping. Keep old behavior for old submissions; new typed fields need an adapter keyed by semantics. Do not let safety recommendations silently redefine contractual warranty coverage. Current D&T tire coverage only checks tread <=2/32 (`:134`), wheels/body use reported/standardized damage and bumpers always excluded (`:193`).
- Report pipeline must consume submitted source facts/snapshot rather than infer page-1 measurements from prose. Parent report audit covers renderer/output changes. Also audit listing inspection disclosure (`20260912190000_listing_inspection_sharing.sql:197` emits only prompt/answer_type/value) so added source fields do not disappear or leak unintentionally.
- Existing useful tests: `tests/unit/ppi-questions.test.mts:26` (catalog/order/photos/scalar validation/deferrals), `tests/unit/dents-tires-coverage.test.mts`, `supabase/tests/inspection_workflow_hardening.test.sql`. Extend to new schema/units/unknowns/evidence/attestation and draft/historical/revision compatibility. The current SQL workflow test covers deferral and technician vehicle access, not the full new state-transition requirements.

## Unresolved product decisions for parent clarification

1. One minimum tread reading per tire or inner/center/outer readings? Unit preference can be dual display regardless of entry.
2. Are actual pressure readings required, optional, or required only for damage/leak concerns? Must allow genuinely untested cases without claiming pressure holds.
3. Keep six body areas or use a more complete panel map (front/rear bumpers, quarter panels, roof, trunk, individual doors)? Inspection findings and warranty coverage can have different scope.
4. Page-1 exact stock-form checkboxes versus refined 25 grouped status rows, tire measurement cards and body diagram. Recommend latter; don't manufacture unavailable measurements.
5. Mandatory physical checks with explicit exception vs hard block when placard/DOT inaccessible? Recommend required attempt with clear exception states, rather than pressure to invent values.
6. Does “report valuation” mean condition/severity categorization, warranty eligibility, or dollar-value estimates? The latter needs independent market/repair data beyond the tire facts; Jev API credentials alone don't define that product decision.

Confidence: high for source catalog/persistence/UI facts; medium for forward schema choices because user clarification is intentionally pending; no claim about currently deployed migration state or actual reports was validated here.
