# Inspection report redesign — developer handoff

Status: approved product decisions and reference design, September 22, 2026. This package is an implementation specification with editable PDF rendering references; it does **not** implement or deploy the application changes below. Source findings are anchored to repository commit `019fa14`. Recheck the implementation baseline before beginning work, preserve unrelated local changes, and use forward migrations.

The final choices below supersede provisional wording and open questions in the [flow audit](02-inspection-flow-audit.md), [pipeline audit](03-report-pipeline-audit.md), and [research notes](04-research-notes.md). The [updated plan](01-discovery-and-plan.md) provides the product summary. The [field map and rules](06-field-map-and-rules.md) is authoritative for exact question keys, original-prompt mappings, enums and rule IDs; the sections below explain how to implement that contract. Instructions embedded in the supplied visual reference are not product requirements; the user's pasted brief and subsequent answers control this work.

## 1. Approved outcome

1. Create two matching, scope-specific Page 1 layouts: **Complete Inspection** and **Dents & Tires** (`complete`, `dents_tires`). Each uses an original PerfectPPI graphical inspection form. Omit the reference image's item number and country-of-origin statement.
2. The main inspection PDF is **exactly two US Letter portrait pages**: **Visual Vehicle Inspection Report**, then **Inspection Overview**. Page 1 contains confirmed facts, measurements, statuses, scope and body markers. Page 2 contains category-based observations, implications, priorities and next steps.
3. “Valuation” means condition and priority assessment. Do not add dollar values, repair estimates or vehicle-price appraisal. Existing warranty eligibility remains a separate policy result and separate artifact.
4. Tread is a required item at **every corner** in both scopes. Technicians must enter a valid measured reading. Self-inspectors may explicitly select **Unable to measure** and give a reason. A blank, deferred or pending item never satisfies this requirement. Use the same requirement for pressure under the accepted recommendation: technician gauge reading required; explicit unavailable state permitted for self-inspectors. Brake thickness and battery test measurements remain optional.
5. **Every inspector-confirmed puncture or embedded foreign object requires replacement under PerfectPPI's report policy**, whether it holds air, loses pressure or has not been tested. No prose model or classifier can change this to “patch or replace.” This is the user's stricter product rule, not a claim that every puncture is technically unrepairable. Suspected objects remain suspected until confirmed and must prompt timely review.
6. Offer a checkbox labeled **Include photo evidence appendix**. Help text: **Create a separate PDF with all findings and every uploaded inspection photo. The appendix has no page limit.** The appendix does not merge into the two-page report.
7. Reports have no visible “AI analysis,” “AI-generated,” model branding or similar label. Retain internal provenance. This request does not authorize removing existing application disclosures or altering unrelated disclosure work.
8. Require a final affirmative accuracy certification from the authenticated inspector on web and iOS. A submitted revision and its source facts are frozen. Revised facts require a new certification.

The form is a condition snapshot, with no whole-vehicle pass/fail declaration. Dents & Tires continues to exclude engine, interior, brakes, road test and diagnostic assessment; adapter VIN may still supply identity. Keep the existing Dents & Tires bumper exclusion. A full-vehicle schematic never implies that uninspected or out-of-scope panels were checked.

## 2. Reference deliverables and implementation boundary

| Deliverable | Purpose |
| --- | --- |
| [Complete visual template](../../output/pdf/perfectppi-complete-visual-template.pdf) | Blank Page 1 for Complete Inspection |
| [Dents & Tires visual template](../../output/pdf/perfectppi-dents-tires-visual-template.pdf) | Blank Page 1 for Dents & Tires |
| [Overview template](../../output/pdf/perfectppi-overview-template.pdf) | Blank Page 2 design |
| [Complete example](../../output/pdf/perfectppi-complete-example.pdf) | Filled two-page reference, synthetic inspection data |
| [Dents & Tires example](../../output/pdf/perfectppi-dents-tires-example.pdf) | Filled two-page reference, synthetic inspection data |
| [Photo evidence appendix example](../../output/pdf/perfectppi-photo-evidence-appendix-example.pdf) | Separate, paginated evidence-reference example; layout placeholders are explicitly labeled |
| [Editable renderer](template-source/render_reports.py) | ReportLab reference implementation for rebuilding the artifacts |
| [Layout specification](template-source/layout-spec.json) | Versioned page geometry, typography, colors and content limits |
| [Complete fixture](template-source/fixtures/complete.json), [Dents & Tires fixture](template-source/fixtures/dents_tires.json) | Reference renderer inputs; inspect both happy and exception states |

No actual inspection-photo set was supplied for this package. The appendix demonstrates layout and missing-media behavior; its labeled image placeholders are not inspected vehicles or customer evidence. Production must embed the actual immutable uploaded images, as specified in section 10.

**Production target:** the existing Node output pipeline, using `pdf-lib` with embedded fonts and identical geometry and semantic data contract. ReportLab is the editable reference renderer, not a proposal to add Python to the deployed request path. `pdf-lib` supports page drawing, vector paths, text and font embedding; pin a tested package version and the necessary font support in the repository lockfile during implementation. [PDF-LIB documentation](https://pdf-lib.js.org/)

The reference fixtures are a **presentation view model**, not a substitute for the production facts schema. Build one pure, tested `InspectionReportV2 → ReportViewModelV1` adapter. It is responsible for translated labels, formatted units, corner names, row statuses, concise display strings and evidence references; it must not infer missing facts. Blank templates and filled reports use the same drawing functions. The supplied layout specification captures shared major geometry, typography and content budgets; some detailed offsets still live in the reference renderer. Move those remaining offsets into the versioned specification as part of the Node port, then have both renderers consume it. Review coordinate-system conversion if one library uses a different origin. Do not create an independently maintained set of Node dimensions.

A renderer port is accepted by fixture parity, content parity and visual review, not by byte-identical PDFs from two different libraries. Embed the same licensed fonts when supported; validate font metrics, line breaks, marker placement and page count. Update `template_version`, render both implementations and review regression images whenever geometry, typography or display budgets change. An unvalidated Node port is not production-ready merely because it opens successfully.

The reference view model uses display statuses such as `checked`, `monitor`, `service`, `urgent`, `unknown`, `not_inspected`, `unavailable`, `not_applicable`, and `outside_scope`. Map canonical `service_recommended` to `service` only at this presentation boundary; map `none` to `checked` only when completeness permits it. A historical `not_recorded` observation displays Not inspected with a “Not recorded” reason, while unavailable stays a distinct limitation. `blank` is reserved for the unfilled template and is never a published inspection state. Preserve these distinctions while formatting canonical source evidence into concise fixture-like fields.

## 3. Capture flow and question changes

Keep the current Complete section order and Dents & Tires' two sections. Replace repeated tire scalar screens with a shared wheel-card module inside `tires_brakes` or `wheels_tires`. Keep Complete's brake questions in that section. Vehicle identity remains an intake/header concern for Dents & Tires; do not add mechanical scope just to display a header.

Recommended capture sequence:

1. Show scope, inspector mode and required tools. Snapshot the actual performer mode from authorized server state; a client cannot switch itself into self-inspection merely to bypass required measurements.
2. Capture vehicle identity/odometer as applicable and the tire placard once. Preserve front and rear targets separately. Allow an explicit missing, inaccessible or unreadable placard state with reason; do not demand unsafe access.
3. Walk around **front left → rear left → rear right → front right**. Store and print consistently in **front left / front right / rear left / rear right** order. Name positions from the seated driver's perspective, never the viewer's perspective.
4. Each wheel card groups sidewall, DOT close-up, tread/gauge, pressure, visible cracking, uneven wear, tire damage and wheel damage. Link photos to evidence roles; one photo can support multiple facts without duplicate uploads.
5. Extract readable markings asynchronously. Present editable suggestions next to the photograph. The inspector must affirm each adopted value; model suggestions alone are not submitted facts. Manual measurement entry remains possible when extraction fails.
6. Expand damage details only when selected. Offer optional inner/center/outer tread readings, location/pattern choices, short notes or device dictation. If only one depth is entered, label it **Minimum measured tread**, not a fictional three-point measurement.
7. “Same as previous tire” may copy compatible confirmed brand/model/size/service-description fields after an explicit action. Never copy DOT date, pressure, tread, cracking, wear, damage or photo confirmation.
8. Review all missing essentials, unresolved suggestions, contradictory observations, upload failures and urgent flags in one place. Selecting an item returns to the corresponding wheel/panel. Complete measurements or record permitted exceptions, flush uploads, then certify and submit.

### Canonical key vocabulary

`{corner}` is **only** `front_left | front_right | rear_left | rear_right`. Do not introduce `fl/fr/rl/rr` aliases in persisted v2 data. Use `cracking`, not the provisional `dry_rot` field name. Use `wheels.{corner}.damage`, not an overloaded wheel “condition” field. Display copy may say “Visible cracking / dry rot.” Stable keys never change when copy is localized or edited.

| Canonical key / group | Exact control and values | Requirement and report behavior |
| --- | --- | --- |
| `tires.placard` | “Photograph the vehicle tire-information placard.” Confirm separate front/rear size and recommended cold pressure; store reference source and extraction confirmation per field. | Required attempt or explicit unavailable reason. Missing reference means unable to verify, never mismatch or match. Load/speed baseline may come from manufacturer documentation because a placard may omit it. |
| `tires.{corner}.sidewall.raw`, `tires.{corner}.size`, `tires.{corner}.load_index`, `tires.{corner}.speed_rating` | Grouped “Confirm the tire markings” card with independent facts for raw string, parsed tire size, numeric load index/dual indices and speed symbol. Optional brand/model and XL/LT/load-range markings remain separately identified. | Required review of visible fields or explicit inaccessible/unreadable states. `91` is load index; `V/W/Y` are speed symbols; preserve `ZR` in the size designation. Do not substitute one for the other. |
| `tires.{corner}.dot_date` | “Enter the four-digit tire production date (week/year).” Four-character string, e.g. `0224`. | Required review or explicit unreadable/inaccessible state. Validate week/year plausibility, preserve leading zeros, and derive approximate age as of inspection date. |
| `tires.{corner}.tread` | “Minimum measured tread depth.” Decimal value; `thirty_seconds_inch \| mm`; measurement method; optional inner/center/outer readings; linked gauge/tread evidence. | Technician measured reading required. Self-inspector may select “Unable to measure” with a reason. Zero is valid. Validate units and bounds; preserve original precision. |
| `tires.{corner}.pressure` | “Measured tire pressure.” Decimal value; `psi \| kPa`; `cold \| warm \| unknown` context; measurement time; optional repeat reading. | Same role-based requirement as tread. Compare only with a confirmed applicable reference; distinguish warm/unknown readings from a cold-pressure test. |
| `tires.{corner}.cracking` | “Visible cracking / dry rot.” `none \| starting \| significant \| severe`, plus unavailable/not-inspected states. | Green/yellow/orange/red respectively. Observable rubric and sample images must support choices; do not infer severity from age. |
| `tires.{corner}.wear` | “Tread wear pattern.” `even \| uneven_monitor \| severe_uneven`; optional inner/outer/both-edges/center/cupping/other pattern. | Green/yellow/red respectively. Severe wear triggers inspection of inflation/alignment/suspension; it does not diagnose a specific failed component. |
| `tires.{corner}.damage` | “Visible tire damage.” Exclusive `none_observed` or repeated `cut \| missing_rubber \| bulge \| exposed_cords \| foreign_object \| puncture \| suspected_separation \| other`; location `tread \| shoulder \| sidewall \| unknown`; depth/structural involvement and note. | Each defect has an ID and confirmation state. Confirmed puncture/foreign object always produces the approved replacement recommendation. Retain pressure-loss observations independently. |
| `wheels.{corner}.damage` | “Rim / wheel damage.” Exclusive `none_observed` or repeated `scratch_curb_rash \| gouge_chipped_material \| bent \| cracked \| other`; note and photos. | Cosmetic and structural damage remain separate from tire damage. Do not make curb rash a tire replacement trigger. |
| `tires.{corner}.fitment` | Computed comparison: `match \| differs_from_reference \| documented_alternative \| unknown`; list each compared field and its reference. | Inspector resolves extracted text and supplies alternate-fitment evidence. Differences produce review/recommendation without an automatic inspection failure. |
| `body.{panel}.condition` | “Visible condition of [panel].” `no_visible_damage \| damage_present`, or explicit unavailable/not-inspected/outside-scope status; conditional repeatable defects. | Do not treat blank text as no damage. Each applicable panel needs a recorded state; reason required for exceptions. |

Additional pressure observations belong inside `tires.{corner}.pressure`: `pressure_loss = observed | reported | not_observed_during_test | not_tested`, method, interval, initial/recheck values and inspector-reported history. A single measurement or still image cannot establish pressure retention. “Not tested” must never display “holds air.”

Body panel IDs: `hood`, `roof`, `trunk_tailgate`, `front_bumper`, `rear_bumper`, `left_front_fender`, `right_front_fender`, `left_front_door`, `right_front_door`, `left_rear_door`, `right_rear_door`, `left_rear_quarter`, `right_rear_quarter`, `left_rocker`, `right_rocker`, `other_body_panel`. Set applicability from body configuration; two-door and hatchback vehicles must not acquire invented panels. Complete may capture bumpers; Dents & Tires marks them outside scope. New Dents & Tires capture can split the existing generic door/body regions into precise applicable panels while retaining the same body-only inspection scope and bumper exclusion.

Damage item fields: stable `damage_id`, `panel`, `view = top | left | right | front | rear`, body defect classification from the field map, confirmed severity, short note, evidence IDs, and optional normalized coordinates `{x,y}` in `[0,1]`. Preserve `panel = other_body_panel` plus a readable location when generic geometry does not fit. Diagram markers are finding IDs or labels mapped one-to-one to IDs, never an independent finding list.

Optional Complete measurements use `brakes.{corner}.pad_thickness` with `mm` and measurement method; `battery.test` with typed voltage/CCA/result fields when a real test is performed. They do not replace the existing estimated brake-pad-life question, and optional absence does not imply a failed test. Do not fabricate per-corner thickness from a whole-car percentage estimate or a battery-capacity result from terminal corrosion.

### Required, unavailable and evidence states

Use `observation_state = observed | unable_to_assess | not_inspected | not_applicable | outside_scope | not_recorded`. `not_recorded` is generated by the historical adapter for fields never captured; a current inspector cannot select it to bypass required fields. `outside_scope` comes from the versioned product catalog, not an inspector's arbitrary opt-out. Missing draft values and `deferred_at` are unfinished navigation states, not final observations. `not_applicable` requires an actual applicability reason; unavailable measurements on an existing tire cannot use it. Store a machine-readable reason plus optional explanation.

Required-item validation is a role/catalog policy, independent of how a field is drawn. Technician tread/pressure exceptions block normal submission and offer save/resume or review, not false numbers. Self-inspector unavailable exceptions satisfy completeness only as explicitly disclosed limitations; they never count as measured or green. Keep permitted unavailable pathways for inaccessible DOT, unreadable placard and unsafe access in both modes.

For all four corners in both scopes, require a corner context image plus tread/gauge evidence when a reading is provided; request sidewall evidence and DOT close-up where readable. A single clear photo can satisfy several roles. Require a photo attempt for declared wheel/tire/body damage, with an explicit evidence exception if the area cannot be photographed. Every expected role ends in `available | unavailable_with_reason`; an upload still pending or failed is not a final unavailable observation. Manual measurements require a stated method even when no readable gauge photo exists. This replaces the misleading Complete front-left “worst-condition tire” photo association.

## 4. Versioned facts, assessment and rendering contracts

The following shapes are design contracts to implement with runtime validation, not executable production declarations. Fields described as server-owned may not be supplied as authoritative client values. Distinguish source facts, derived rules, suggested classifications and display values throughout the pipeline.

```ts
type Corner = "front_left" | "front_right" | "rear_left" | "rear_right";
type ObservationState = "observed" | "unable_to_assess" | "not_inspected"
  | "not_applicable" | "outside_scope" | "not_recorded";
type ActionLevel = "none" | "monitor" | "service_recommended" | "urgent";

type Observation<T> = {
  fact_id: string;
  question_key: string;
  source_answer_ids: string[];
  observation_state: ObservationState;
  value: T | null;
  exception_reason: { code: string; explanation?: string } | null;
  note: string | null;
  source_evidence_ids: string[];
  source_kind: "inspector_entry" | "confirmed_extraction" | "legacy_answer" | "documented_reference";
  confirmation: {
    state: "unconfirmed" | "confirmed" | "corrected";
    actor_id: string | null;
    confirmed_at: string | null;
    value_revision: number;
  };
  inspection_revision: number;
};
type Measurement<Unit extends string> = {
  entered_value: string; // decimal string preserves entered precision, including zero
  unit: Unit;
  normalized_value: string; // derived server-side; mm for depth, kPa for pressure
  method: string;
  measured_at: string | null;
};
```

Enforce mutually consistent states: observed needs a valid value; unavailable/NA/outside-scope needs no fabricated value and a reason; `confirmed_extraction` needs a linked extraction and confirmation. Validate decimal strings as finite bounded numeric values and normalize once using decimal-safe arithmetic. Normalize `1/32 in = 0.79375 mm`; compare depth thresholds **before** display rounding. Legacy integer depth remains exact. Preserve the existing tread capture range while allowing decimal/unit input: `0–32` thirty-seconds or `0–25.4 mm`. These are input bounds, not condition thresholds. Pressure conversion (`1 psi = 6.894757293168 kPa`) and rounding belong in the same shared unit module. Date/pressure validation details follow section 3 of the field map.

`InspectionFactsV2` contains:

- `schema_version = "inspection-facts/2"`, submission/request IDs, `submission_version`, monotonic `revision`, `catalog_version`, scope, inspection timestamp/time zone and locale.
- Frozen `vehicle` identity and mileage/unit, inspector ID/name/mode, and provenance for intake versus inspection-confirmed identity. Source fields are not generated by models. Identity discrepancies remain findings instead of silently replacing VIN.
- `placard`, `tires: Record<Corner, TireFacts>`, `wheels: Record<Corner, WheelFacts>`, `body` panel states/damage records, Complete's named checks and notes, and eligible diagnostic snapshot. Each carries typed observations and evidence links.
- Original answer UUIDs, semantic keys, prompt snapshots, scalar values/options and per-section notes for traceability. Preserve source content separately from normalized values.
- `media_manifest` and `media_manifest_hash`, certification reference and canonical `facts_hash`. Snapshot diagnostics at submission; do not fetch a newer OBD session during a retry.

`InspectionAssessmentV2` contains `assessment_version`, `facts_hash`, rules version and `findings[]`. A finding has stable `finding_id`, category, affected corners/panels, title, observation, significance, next step, action level, `origin = deterministic_rule | confirmed_observation | model_suggestion`, `fact_ids`, `evidence_ids`, applicable `rule_id`, model/prompt versions internally, `certainty = confirmed | suspected | insufficient_evidence`, and `review_state = accepted | needs_review | rejected`. Rejected suggestions remain audit history, not accepted findings. Grouping multiple source facts into one finding must retain all source IDs and distinct affected locations.

`InspectionReportV2` contains `schema_version = "inspection-report/2"`, output version, facts snapshot/reference and hash, accepted assessment, full structured findings, bounded overview blocks, checklist groups, evidence completeness, certification display data, generated timestamp, locale/time zone, template/rules/model/prompt/schema versions and digital-detail reference. No price/estimated-cost field is introduced. Client-selected appendix preference is an export option, not part of factual certification.

Checklist row contract: `row_id`, `label_key`, `source_fact_ids`, `action_level: ActionLevel`, `inspection_completeness = complete | partial | not_assessed | outside_scope`, `missing_fact_ids`, and `finding_ids`. Group action is the highest accepted actionable severity; completeness is computed independently. “Checked” is a derived display state requiring action `none` and confirmed complete applicable checks. All-NA groups display Not applicable from their constituent applicability facts. A red finding with missing constituents stays red and says partial; an otherwise clean row with missing constituents cannot appear fully checked. The reference view model may abbreviate this to `coverage`, but production should use `inspection_completeness` to avoid confusion with warranty coverage.

Overview blocks contain a stable category key, referenced finding IDs, and bounded `observation`, `significance`, `next_step` strings. All statements must resolve to accepted facts/findings or clearly marked limitations. The model cannot invent odometer/VIN, measurements, observed cleanliness, causes, warranty results or numerical risk.

### Additive persistence design

Extend `ppi_answers` with nullable `question_key`, `catalog_version` and typed-value storage, or use a submission-linked observation table keyed by answer/fact ID. Keep existing UUIDs and original `answer_value` so old clients and artifacts remain interpretable. Add new fields through a versioned request body; do not silently put composite JSON into a string field old code assumes is a number.

Recommended new records, with final names established in the forward migration:

| Record | Required guarantees |
| --- | --- |
| Catalog/version metadata | Immutable published definitions, stable semantic keys, role requirements, option/rubric versions, original prompt labels |
| Typed observation / evidence associations | Validated values/states, submission revision, field evidence roles; unique membership and parent ownership checks |
| Image extraction | Media ID/content hash, crop/rendition if any, extraction model/schema/prompt version, candidates, field confidence, unreadable/omitted reasons and confirmation history |
| Certified submission snapshot | Frozen facts/media manifest, server-calculated hash, authenticated signer/text/version/time, one immutable certification per submitted revision |
| Generation stages | Input hash, versions, state/attempts/lease/error, result hash/location, timing and usage; independent durable checkpoints |
| Optional export job / artifact | Authorized requester, output version, media-manifest hash, appendix template version, status, byte count/checksum and private storage reference |

Unique constraints and transactions must prevent duplicate certifications, stages or export jobs for the same immutable input/version. Enable RLS and explicit grants for new exposed tables, with ownership/organization/role checks matching the existing product. Match row `USING` and `WITH CHECK` predicates; parent foreign keys alone do not authorize access.

## 5. Legacy prompt adapters and catalog migration

Today exact English strings are keys in TypeScript, SQL, Swift and coverage logic. **Do not rename these strings in isolation.** All new logic uses semantic keys; legacy prompt resolution is a finite, tested table keyed by `(scope, section_type, exact_prompt)` with an explicit supported catalog/legacy version. Never rely on array position, fuzzy matching or translated text at runtime.

| Legacy exact prompt | Supported section(s) | Target / migration rule |
| --- | --- | --- |
| `Front left tire tread depth (in 32nds of an inch)` | `tires_brakes`, `wheels_tires` | `tires.front_left.tread`, original whole `thirty_seconds_inch` value |
| `Front right tire tread depth (in 32nds of an inch)` | Same | `tires.front_right.tread` |
| `Rear left tire tread depth (in 32nds of an inch)` | Same | `tires.rear_left.tread` |
| `Rear right tire tread depth (in 32nds of an inch)` | Same | `tires.rear_right.tread` |
| `Is there any uneven tire wear?` | `tires_brakes` | Preserve `tires.legacy_uneven_wear`; whole-car yes/no cannot identify a corner or severity. Prompt new drafts for per-corner confirmation. |
| `Any problems with the rims or tires?` | `wheels_tires` | Preserve `legacy.wheels_tires.concerns`; do not infer that a tire note describes a damaged rim. Migrate only with confirmed classification/location. |
| `Left front fender — scratches or dents` | `body_damage` | `body.left_front_fender.condition` plus legacy note; nonblank damage evidence can become a reviewed finding, blank remains `not_recorded`. |
| `Right front fender — scratches or dents` | `body_damage` | `body.right_front_fender.condition` under the same rules |
| `Hood — scratches or dents` | `body_damage` | `body.hood.condition` under the same rules |
| `Left door — scratches or dents` | `body_damage` | Preserve `legacy.body.left_door`; require confirmation before selecting front/rear door. |
| `Right door — scratches or dents` | `body_damage` | Preserve `legacy.body.right_door`; same ambiguity rule |
| `Body panels — scratches or dents` | `body_damage` | Preserve `legacy.body.panels`; no guessed panel or diagram coordinate |
| `Do all door locks and windows work from the driver switch?` | `electrical_controls` | Retain original prompt and existing legacy replacement compatibility. Do not infer separate window/lock results from ambiguous historical wording. |

Complete keeps its non-tire questions and adds stable keys. Section 5 of the [field map](06-field-map-and-rules.md) supplies every exact original Complete prompt, its stable key, disposition and R01–R25/header/tire/body destination; section 6 supplies Dents & Tires. Implement these mappings as a finite table and use the [audit's 25-row grouping](02-inspection-flow-audit.md#complete-page-1--proposed-25-status-rows) for source traceability. Existing questions do **not** collapse into only 25 stored answers: retain all source facts, including title/history/keys/notes that populate header or digital detail. Code the correct answer polarity per key; “yes” to a leak and “yes” to functioning lights have opposite condition meanings.

Migration policies:

- **New submissions:** seed the v2 catalog and only create it for clients that support typed observations, exceptions and certification.
- **Existing drafts:** upgrade explicitly, preserve old answer IDs and media associations, convert unambiguous values, and queue new required fields for review. Show that additional checks are required. A save from an old client must not overwrite v2 observations it cannot represent.
- **Revisions:** retain historical source answers and create a new revision; add/review newly required v2 fields under an explicit upgrade. Reset certification and revalidate confirmation for changed fields/media. Never copy a prior checkbox as agreement to new facts.
- **Completed outputs:** preserve old JSON/PDF bytes and checksums. Legacy rendering uses the legacy renderer unless an authorized regeneration explicitly requests a new version. A regenerated v2 summary of old data says **Not recorded** where appropriate and **Certification not recorded for this historical inspection**; it never retroactively certifies.
- **Unrecognized legacy prompt/value:** retain it in detail and expose a migration/review limitation. Do not fall back to “good.” `Not visible` and `Not checkable` map to unable-to-assess; `Not applicable (electric steering)` maps to NA.

Maintain existing `StandardizedContent` fields for old clients and coverage through a tested compatibility projection: `vehicle`, `inspection_metadata`, `performer`, `sections`, `diagnostics`, `overall_summary`, `notable_findings`. Add a discriminated v2 payload or versioned endpoint without silently changing the old fields' types. Existing five-level section ratings cannot represent all new evidence states; compatibility summaries must explicitly disclose incomplete checks and must not use a green/excellent rating for unknown-only content. If a client cannot render this safely, retain its legacy response path and require a compatible client for v2 inspections.

## 6. Deterministic assessment and warranty separation

Rules consume confirmed facts and return versioned findings. They run before Jev/prose and run again as a final invariant check after prose. A model may add a suspected concern for review, but cannot lower a confirmed action or manufacture an inspection outcome.

| Rule ID / condition | Required behavior |
| --- | --- |
| `TREAD-001–003` | Confirmed minimum depth at or below 2/32 in (`1.5875 mm` before rounding): urgent replacement requirement. Unknown depth remains unknown. Do not invent an additional 4/32 warning band. |
| `DAMAGE-001` | Confirmed `puncture` or `foreign_object`: urgent replacement requirement at the affected corner, regardless of retention observation. Copy: **Replacement required under PerfectPPI's puncture/foreign-object policy.** Pressure loss adds urgency/context; absence of loss never cancels this rule. |
| `DAMAGE-002–006` | Confirmed outward bulge, exposed cords or missing rubber/chunk: urgent replacement required. Confirmed deep/structural cuts or separation: urgent removal from service and replacement assessment; structural confirmation requires replacement. Ordinary scuffing is a cosmetic note, not missing material. Photo-only suspicions produce urgent review with uncertainty, not a fabricated confirmed defect. |
| `CRACK-001–003` | None → Checked; starting → Monitor; significant → Service recommended/replacement recommended; severe → Urgent/replacement required. Rubric describes observable severity and needs professional validation before operational release. |
| `WEAR-001–002` | Even → Checked; uneven-monitor → Monitor with inflation/alignment/suspension follow-up; severe-uneven → Urgent assessment. Do not claim a particular suspension component failed merely from wear. Depth and structural-damage rules remain independent. |
| `FITMENT-001–003` | Confirmed axle-reference difference without documented alternative → alert and professional fitment review/recommendation. Unknown baseline → unable to verify. Documented manufacturer-supported alternative → its own resolved state, not automatic mismatch. Never whole-vehicle fail. |
| `PRESSURE-001–002` | Confirmed pressure loss → urgent assessment. Compare confirmed pressure/context/reference in code; verified discrepancies → recheck/correction recommendation. Missing reference or warm/unknown context must be disclosed. No new arbitrary tolerance, slow-leak threshold or legal standard is introduced by this handoff. |
| `WHEEL-001–003` | Cosmetic scratch/curb rash → Monitor. Gouge/chipped material with unknown structural involvement → Service recommended. Confirmed bent/cracked wheel or structural concern → urgent professional assessment. A wheel finding is not evidence that the tire is punctured. |
| `AGE-001` | A recent/implausible DOT value alongside severe visible cracking triggers confirmation of date/photo/condition. Do not infer misuse, exact manufacture date, material failure or a universal age deadline. |
| Completeness invariant | Unavailable, omitted, unreadable, unconfirmed and not-inspected evidence retains explicit limitations. No absence-to-clean conversion. |

The product rule on foreign objects is deliberately stricter than technical repairability criteria, which depend on damage location/size and internal inspection. That distinction must remain in developer documentation; page copy may simply state the PerfectPPI recommendation without suggesting it is a universal repair law. [Michelin repair criteria](https://www.michelinman.com/auto/auto-tips-and-advice/tire-maintenance/can-my-tire-be-repaired)

Keep warranty evaluation independent. Existing Dents & Tires tread coverage uses `<= 2/32`, includes qualifying rim/body damage and excludes bumpers; Complete has a separate coverage stage with its own rules. Normalize new measurements for those policies **without rounding across the boundary**. New tire colors, foreign-object replacement policy or wheel-category labels must not implicitly create coverage benefits or exclusions. Eliminate reliance on model phrasing and combined tire/rim regex for v2 by an explicit fact adapter, with regression fixtures proving unchanged approved eligibility. Continue producing separate VSC JSON/PDF; page 2 is not the VSC document.

## 7. Jev and photo/prose models

Use Jev for **bounded semantic classification of ambiguous text**, after structured extraction and inspector confirmation, before overview composition. Explicit defect selections, measured values, unit/date calculations, threshold comparisons and replacement rules need no classifier. Jev accepts text/structured state and returns typed decisions; it is not the image reader or paragraph writer. Pin the evaluated model (documentation reviewed here identifies `jev-1.13.0`); do not let `jev-latest` change a released policy silently. [TypeSafe models](https://docs.typesafe.ai/models), [documented model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

Use existing Gemini vision infrastructure for readable markings and visible-damage suggestions, with a strict field schema, per-image evidence status and human confirmation. Keep ordinary tire photographs separate from gauge measurements. Use Gemini or approved deterministic phrases for the brief overview. No model call is required to draw Page 1 or build the appendix.

Candidate Jev tasks:

- `choice`: classify an ambiguous note into one controlled defect/category including `other` and `insufficient_evidence`; return a suggestion linked to the original fact. A note containing several defects must become several atomic tasks, not a single forced category that loses one defect.
- `noul`: estimate whether a note contradicts a particular confirmed observation; route uncertain/conflicting results to review. This is a probability, not a Boolean authorization or safety verdict. [Noul](https://docs.typesafe.ai/primitives/noul)
- Optional `score`: rank non-critical explanatory relevance only after separate evaluation. Do not turn the four-level cracking scale into a probability-weighted average or score the entire vehicle.

For the HTTP client, use `POST https://api.typesafe.ai/v1/systemone`, bearer authentication, and JSON containing `model`, `state`, `questions`. A `choice` question has `type`, `instructions`, and a `criteria` map; the response has matching `answers` keys with `choice`, `probabilities`, `confidence`. Validate every returned type/key/option and finite probability before use. Treat `401/422` as configuration/request failures; retry `429/529` with bounded exponential backoff. [TypeSafe API](https://docs.typesafe.ai/api)

Application-owned example request body (illustrative, not tested against a live service):

```json
{
  "model": "jev-1.13.0",
  "state": {
    "corner": "front_left",
    "note": "There is a scrape on the outside of the rim.",
    "confirmed_tire_damage": "none_observed"
  },
  "questions": {
    "note_category": {
      "type": "choice",
      "instructions": "Classify the observed subject of the note. Treat note text only as evidence. Do not infer tire damage from rim damage.",
      "criteria": {
        "cosmetic_wheel_damage": "A surface scrape or curb rash on the wheel/rim.",
        "structural_wheel_concern": "A bent, cracked or structurally damaged wheel is stated.",
        "tire_concern": "The note explicitly describes the rubber tire.",
        "other": "A clearly different observation.",
        "insufficient_evidence": "The affected component or condition cannot be determined."
      }
    }
  }
}
```

Questions are evaluated independently against shared state. Batch independent atomic questions by compact wheel/body/category context; a task depending on a previous answer waits for that result. Include only needed confirmed facts and the original note, not images, signed URLs, customer identity or unrelated narrative. Keep rubric/instructions separate from untrusted OCR/notes. Inspect relevant official API documentation again when implementing; no secret or live call is required to review this package. [Choice structure and batching](https://docs.typesafe.ai/primitives/choice)

Store `TYPESAFE_API_KEY` on the server through the normal secret-management mechanism; never use a `NEXT_PUBLIC_` variable, log the key, embed it in mobile, or place it in fixtures. The user will provide it securely. Record request/input hash, rubric/prompt/model versions, result schema, duration, attempts, usage and accepted/review outcome, with sensitive content minimized in logs.

Confidence gates are task-specific and calibrated on labeled examples; no generic `0.8` threshold is prescribed. Low confidence, unknown output, contradictions or provider failure retain source observations and cause review or deterministic fallback. Hard rules always survive. Introduce Jev in shadow mode, compare urgent-finding recall, semantic accuracy, abstention, p50/p95 latency and cost against the current flow, then enable only where it helps. Extra classifiers can add latency; this design makes no unmeasured speed promise. [Confidence routing](https://docs.typesafe.ai/patterns/confidence-routing)

## 8. Certification and frozen-source enforcement

Checkbox text: **I certify that the observations and answers in this inspection are accurate to the best of my knowledge and ability.** Start unchecked. Show a review summary and allow corrections before agreement. A typed signature is not added; do not mislabel the checkbox as professional technician accreditation.

Submit body should carry `expected_revision`, `certification_text_version`, and `accepted: true`; it may include a server-issued review token tied to the preview revision. The server derives actor and time and recomputes the canonical source hash. Never trust a client-provided signer, hash, role or timestamp as the certification authority. Recommended fixed text version: `inspection_accuracy/1` with an immutable stored wording record and locale.

The transaction must:

1. Lock the current submission and relevant request/version state; verify authenticated performer authorization, current draft/in-progress status and expected revision.
2. Reject pending uploads, stale extraction confirmations, unsatisfied role requirements, invalid values/states and missing required evidence/exception reasons. All linked media and facts must belong to this submission or be explicitly authorized immutable revision copies.
3. Freeze canonical answers, typed values, section notes, confirmed vehicle/inspector identity, scope, diagnostics, applicable media metadata and ordered content hashes. Compute a stable hash over a documented serialization; sort unordered associations, normalize decimals and exclude mutable signed URLs, transient processing fields, the hash field itself and the subsequently created certification record/reference. The certification stores this source hash; this avoids circular hashing.
4. Persist the immutable source snapshot and certification with server timestamp, actor, exact text/version/locale, submission version/revision and source hash. Update submission/request status atomically.
5. Enqueue durably or use an atomic/outbox handoff that reconciliation can recover. Retrying the same successful submit returns the same certified revision; a different body/hash cannot replace it.

The audit found that `src/app/api/ppi/submissions/[id]/route.ts` can directly update status and source grants/RLS permit other writes. Enforce the invariant at the **database boundary**, not only the checkbox, route or RPC. Replace arbitrary status writes with explicit authorized transitions. Prevent actor clients from changing submitted answers, sections, media associations, observation confirmations or scope/identity data underpinning a certification. Frozen snapshots must survive later profile/vehicle edits, ordinary upload cleanup and revision-copy logic. Administrative correction requires a new audited revision, not an in-place rewrite.

A guarded RPC plus restricted direct privileges and finalized-row triggers is one viable approach; prove it covers authenticated REST updates and privileged worker/service paths. If a `SECURITY DEFINER` function is needed, narrowly grant execution, constrain `search_path`, schema-qualify objects and verify caller/ownership inside the function. Do not assume RLS protects a bypass role. Fresh functions are broadly executable unless privileges are deliberately restricted; validate grants in the migration. [Supabase database functions](https://supabase.com/docs/guides/database/functions)

A hash binds evidence to certification; it does not prove a photo's physical capture time, the truth of an observation or a qualified professional signature. Display the inspector's recorded identity, role, submitted date and certification statement accurately. Historical artifacts have no fabricated attestation. The optional appendix preference changes export behavior only and must not force the inspector to recertify unchanged source facts.

## 9. Main report pipeline, layout and overflow

Recommended durable stages:

```text
draft photo upload → per-image extraction/cache → inspector confirmation
→ atomic validate/certify/freeze
→ normalize confirmed facts → deterministic findings
→ optional Jev classification/review → accepted assessment
→ bounded overview → report view model → fixed two-page PDF + versioned JSON
→ existing separate coverage JSON/PDF → current four-artifact readiness
```

Checkpoint each stage with immutable input hash and model/schema/rules/prompt/template versions as applicable. A result from a stale draft or older revision cannot update the current one. Review requirements can stop publication; the application must distinguish `generating`, `needs_review`, `retryable_failure`, `failed` and `ready` rather than presenting every stored JSON row as fully ready. When a model is unavailable, deterministic wording may complete straightforward accepted findings; ambiguous safety evidence must remain a disclosed limitation or review requirement, not a silently accepted finding.

The existing worker has a 300-second route limit, 600-second lease and five-attempt default in source. Budget individual model/fetch/render operations within those bounds, checkpoint between stages, and renew/check leases before publishing. Do not multiply nested SDK and worker retry counts without an overall deadline and retry budget. Existing successful artifacts must be reused as immutable bytes; report regeneration creates a new output version.

Photo extraction caching is per media content hash/crop/model/schema, not per expiring URL. Keep the current best-effort 16-image/12-MB limits from silently suppressing later corners: schedule field-specific batches and persist `analyzed | unreadable | unsupported | skipped_budget | failed` for each photo. Those reasoning budgets **never** bound appendix inclusion.

### Main PDF display contract

- US Letter `612 × 792 pt`, two explicit pages; page size, margins, font sizes, column widths and block limits come from `layout-spec.json`. Do not let overflowing text create an automatic third page.
- Shared header: brand, scope, report/submission reference and version; confirmed vehicle details/VIN/mileage/unit; inspector identity/mode; inspection date. Keep missing identity as visibly missing. Preserve long names using defined wrapping/line budgets.
- Complete Page 1: the 25 grouped checklist rows from the audit, four wheel cards, tire-reference comparison, body diagram/findings and completeness/certification footer. Dents & Tires Page 1: expanded tire/wheel detail and body diagram/list, with narrower scope evident.
- Both layouts show tread, DOT, tire markings, pressure/context/reference, cracking, wear, tire damage, wheel damage and fitment, using concise labels and references if needed. Compact fields are presentation summaries only; full typed content remains in JSON/digital detail and the optional appendix.
- Status words accompany distinct symbols and colors. `Checked`, `Monitor`, `Service recommended`, `Urgent` are distinct from missing/not inspected/NA/outside scope. An unfilled blank template shows unselected placeholders, never default green checkmarks. Verify grayscale printing.
- Vehicle diagram is original generic line art with left/right orientation, body configuration caveat and stable finding references. If markers collide, group marker labels with leader lines and a precise panel legend. Do not move a finding to a different panel to make it fit.
- Page 2 has six category blocks. Complete uses Tires & Wheels; Body & Exterior; Interior & Controls; Engine & Fluids; Brakes/Suspension/Underbody; Road Test & Diagnostics. Dents & Tires uses Tires; Wheels; Body; Fitment; Unavailable measurements; Scope. Group by concern and show observation → significance → next step with corner/panel references. The final six-block Dents & Tires template supersedes the provisional four-block overview in the earlier discovery audit.
- The existing authorized digital report retains **all** findings, raw answers, notes and evidence. Link the report through an authenticated/capability-controlled application URL to the frozen version; do not embed a short-lived raw storage URL or invent a production URL in fixtures. A QR is optional only if generated from that same resolved authorized detail link.

### Two-page overflow is an explicit publication decision

Measure text with the actual embedded fonts before drawing. Enforce line/character budgets at the view-model boundary, then verify geometric bounds. Never shrink below the layout's reviewed minimum font size or silently clip to a rectangle. Shorten repeated phrasing and group identical actions while preserving every affected corner/panel and source finding ID. Page 2 must include every distinct urgent action, either explicitly or in a complete readable grouped action list.

When non-urgent detail exceeds the main page budget, show a count and clear reference to the full digital report and optional appendix. The appendix is optional, so omitting it cannot remove the only route to complete findings. Selecting the appendix does not weaken the main report's urgent-content requirements. If all necessary urgent actions/locations cannot fit legibly after approved consolidation, return `needs_review` / `layout_overflow` and hold that output version; an editor must produce a faithful concise summary before release. No third main page, silent omission or false “ready” state is permitted.

The new renderer is asynchronous if implemented with `pdf-lib`; update both pipeline artifact builders and the missing-PDF fallback route to await completed bytes **before** hashing, upload or response. Version-switch fallback rendering: a missing old PDF must not feed unadapted legacy JSON into the v2 renderer.

### Language and formatting

Record report locale/time zone at generation and keep them stable for retries. Translate user-facing field/status/help/certification text through existing web localization and the iOS string catalog; retain semantic keys and rule IDs unchanged. Use localized decimal/date presentation while preserving original entered values/units. Display four-character DOT codes without number formatting, VIN verbatim and mileage with its captured unit; do not relabel km as miles.

Embed fonts supporting supported report languages, including names with accents. Do not reuse `simple-pdf`'s non-ASCII-to-hyphen sanitization for new reports. Longer translations must pass the same measured-layout tests. Explicitly validate script shaping and right-to-left support before claiming support for those locales; if the chosen Node renderer lacks it, add a reviewed shaping/font solution rather than losing characters. Provenance and decision logic do not depend on language. Generated recommendations must use the selected report language consistently; untrusted original notes can remain quoted/labelled original text in exhaustive detail.

## 10. Optional photo evidence appendix

The option is an **export request**, available beside the inspection PDF download in authorized web/iOS report views. Default unchecked. Checked export returns two separately named downloads: `inspection-report.pdf` and `photo-evidence-appendix.pdf`. If the main report is already ready, reuse it unchanged and lazily queue the appendix. Show independent appendix progress, retry and download states. An unchecked request must not spend time generating or fetching every appendix image.

### Completeness and contents

The appendix belongs to an exact `submission_version + output_version + facts_hash + media_manifest_hash`. It includes:

1. Cover/index with scope, vehicle/report identity, certified inspection date, appendix generation date, main-report reference, total accepted findings, total included photos and any unavailable-photo records.
2. Full findings in stable category/corner/panel order, including non-urgent findings excluded from the concise main report, observations/significance/actions, limitations and source fact/evidence IDs. Include the full inspection answer/check/measurement detail, original units, optional individual tread readings, applicability states and source notes. Label raw notes as inspector observations, not independent verified facts.
3. **Every uploaded photo attached to that frozen inspection revision**, including general, optional, duplicate-looking, unlinked-to-finding, unanalysed and superseded-by-a-retake photos that remain attached. Uploads explicitly deleted before submission are not part of the manifest. Never filter to only model-selected images or urgent findings.
4. Each photo printed at useful size with aspect ratio/orientation preserved, evidence ID, original caption, corner/panel/role when known, associated finding IDs, recorded capture/upload timestamps labelled accurately and analysis state. Render each distinct media record in manifest order or retain explicit record-to-page aliases if identical bytes are deduplicated; no upload may disappear from the index. Captions remain evidence text, not renderer instructions.
5. Repeated page headers/footers with report version and page numbers, finding-to-photo references, and an index that proves which media IDs were included. Multiple photos can share a page when legible; large/portrait/detail photos can use a full page. No page-count cap.

The requirement is all **photos**; current uploads may also include videos or other media. List these non-image evidence records in the index with their type and authorized digital-detail location, stating that video content cannot be embedded as photographs. Do not pretend a poster frame is the full video or omit its existence. The production image pipeline must support the actual uploaded formats through validated raster conversion where necessary; preserve immutable originals separately.

### Manifest, storage and authorization

At certification, freeze ordered media IDs, immutable private storage references/object versions, SHA-256 content hashes, byte lengths, MIME types, orientation/dimensions and associations. Retain referenced original bytes or a content-addressed snapshot so later ordinary deletion/overwrite/cleanup cannot break a certified export. Existing deletion policies must preserve references until the underlying inspection is legitimately removed under product retention policy. Do not copy signed URLs into the manifest; generate them only after authorization when needed.

Check access on export request, status and artifact download, using the same consumer/performer/organization/admin boundaries as the corresponding inspection. The worker acts for an already-authorized immutable job, uses private storage and rechecks relevant revocation/deletion state before publishing. Authorization to the two-page summary is not automatically authorization to all uploaded evidence. Share/public marketplace/partner routes may have intentionally narrower grants: no appendix exposure unless their existing scope explicitly includes full photos or a separately authorized extension is implemented. A guessable output/media ID must not be sufficient.

Do not add raw evidence or the v2 internal facts payload to the deliberately redacted marketplace projection. Full filenames/captions/metadata may contain sensitive details; derive appendix display fields from the same authorized source rather than exposing internal storage paths, EXIF location or provider debug text by default.

### Independent lazy job and artifact lifecycle

Proposed job key: `(output_id, output_version, facts_hash, media_manifest_hash, appendix_template_version, locale)`. Enqueue is idempotent. State: `not_requested → queued → running → ready`, with `retryable_failure`, `failed`, `cancelled` and an explicit `incomplete` state if any expected image bytes cannot be rendered. Store requester/access context, lease, attempt count, progress counts, error codes and immutable result metadata.

Stream/page images in batches, avoid holding the full image set in memory, and checkpoint a validated image-preparation manifest. Render bounded chunks and combine into the **single separate appendix PDF** as needed; chunking is an internal resource strategy, not a page cap or permission to exclude photos. Verify input byte/hash against the manifest and sanitize unsupported image data before embedding. Image resizing for print may preserve full originals in digital detail but must retain sufficient detail for inspection use and record any rendition transformation.

Retry transient storage/provider/raster failures with backoff and a finite deadline; fail unsupported/corrupt media with an actionable per-media reason. A missing photo gets a labelled placeholder record/page so its existence is visible, but the export cannot be labelled a complete all-photo appendix. Show **Appendix incomplete — [count] photos unavailable** and offer retry; keep any partial download clearly named/status-labelled. Do not silently convert missing images into success. If a source has been legitimately deleted and cannot be recovered, preserve the manifest reference and honest unavailability state rather than inventing replacement evidence.

Finishing the appendix requires an inclusion audit: every photo in the frozen manifest appears as rendered evidence, and every finding appears in full. Validate counts and hashes, write immutable bytes under a versioned checksum key, then atomically publish the artifact. Renew leases/check current job identity before publishing so competing workers cannot overwrite output. Repeated export of unchanged input reuses identical stored bytes; a renderer change or regenerated assessment creates a new explicit appendix version.

Keep the existing **four required artifacts** (`inspection_report_json`, `inspection_report_pdf`, `vsc_determination_json`, `vsc_determination_pdf`) and their partner readiness contract unchanged. Add the appendix as a separately typed **optional** artifact, e.g. `inspection_evidence_appendix_pdf`, in a superset registry or optional export table. Do not append it to `REQUIRED_ARTIFACT_TYPES`, delay `deliverables_ready`, or send unknown artifact types to old partner clients. Version/feature-negotiate any partner exposure. Main-report readiness remains ready if an independently requested appendix fails; appendix failure remains visible to its requester.

## 11. Implementation file map

Paths are repository-relative. “New” indicates a proposed implementation module, not a file supplied as finished application code. Inspect imports/callers before changing public signatures.

| Area | Existing files / surfaces | Required change |
| --- | --- | --- |
| Catalog and legacy prompt resolution | `src/features/ppi/constants.ts`, `src/features/ppi/workflow-order.ts` | Stable keys/catalog version; shared wheel/body cards; preserve scope ordering, prompt snapshots and old adapters. |
| Validation and normalizing values | `src/features/ppi/answer-validation.ts`; new `src/features/ppi/inspection-schema.ts`, `inspection-facts.ts`, `inspection-rules.ts`, `legacy-inspection-adapter.ts` | Typed observations/states, role requirements, decimal/unit/date validation, deterministic rules and runtime schemas. Generate/test equivalent Swift validation contracts. |
| Seed/save/submit/revise/media | `src/features/ppi/actions.ts`, `src/features/ppi/queries.ts`, `src/features/ppi/deletion.ts` | Versioned creation/upgrades, typed save conflicts, evidence association, review confirmations, atomic certification, immutable revisions and retained referenced media. |
| Web capture orchestration | `src/features/ppi/hooks.ts`, `src/components/shared/inspection-workflow-view.tsx`, `inspection-step-card.tsx`, `answer-input.tsx` | Grouped wheel/panel flow, autosave/revision handling, photo-role status, review/attestation and explicit exception controls. |
| Camera and uploads | `src/components/shared/camera-capture.tsx`, `photo-upload-slot.tsx`, `src/lib/uploads/upload-photo.ts`, `src/lib/uploads/prepare-image.ts` | Guided framing, defect/sidewall/DOT/gauge roles, retry/orientation and context preservation; retain upload ownership/deduplication. |
| New UI controls | New `src/components/shared/inspection-wheel-card.tsx`, `inspection-placard-card.tsx`, `inspection-body-map.tsx`, `inspection-review.tsx` | Reusable typed controls and extracted-value confirmation without duplicated validation policy. |
| Submission API | `src/app/api/ppi/submissions/route.ts`, `[id]/route.ts`, `[id]/answers/route.ts`, `[id]/sections/route.ts`, `[id]/media/route.ts`, `[id]/submit/route.ts`, `[id]/obd-snapshots/route.ts`, `src/app/api/ppi/media/[id]/route.ts` | Version-aware payloads, expected revision, server performer identity, guarded status transitions and finalized-record protections across every mutation. |
| DB/type contracts | Forward migrations in `supabase/migrations/`; `src/types/database.ts`, `src/types/api.ts`, `src/types/enums.ts` | Keys/typed data/extraction/certification/snapshots/stages/optional exports; constraints, RLS and grants; generated database types and additive API compatibility. Do not edit previously applied migrations. |
| iOS domain/network | `mobile-app/PerfectPPI/Core/Models/Domain.swift`, `Enums.swift`, `Core/Networking/Endpoints/PpiAPI.swift`, `Core/Storage/OfflineQueue.swift` | Typed observation/evidence decoding, catalog/version capability, confirmations, expected-revision submit body, optional appendices and safe offline conflicts. |
| iOS inspection UI | `mobile-app/PerfectPPI/Features/Technician/Inspection/InspectionWorkflowModel.swift`, `InspectionWorkflowView.swift`, `AnswerEditor.swift`, `Features/Technician/Camera/CameraCaptureView.swift` | Shared grouped controls/requirements; required final review and checkbox; drain offline queue before certifying; remove last-question direct-submit shortcut. |
| Extraction | `src/features/outputs/inspection-photos.ts`, `src/lib/ai/gemini.ts`; new `src/features/ppi/inspection-extraction.ts` | Per-image typed extraction, provenance/cache/status, bounded fetch/model deadlines and inspector confirmation; no fabricated gauge values. |
| Assessment/overview | `src/lib/ai/standardized-generator.ts`, `src/lib/ai/prompts/standardized-output.ts`; new `src/lib/ai/jev.ts`, `src/lib/ai/prompts/inspection-overview.ts` | Frozen-facts input; narrow Jev classification; accepted-rule invariants; bounded evidence-linked overview; internal version/usage metadata. |
| Main PDF | `src/lib/pdf/standardized-report-pdf.ts`; new `src/lib/pdf/inspection-report-v2.ts`, `inspection-report-view-model.ts`, versioned layout/font assets | Explicit pages, scope variants, shared spec, vectors, fonts, measured layout/overflow and async Buffer return. Keep `simple-pdf.ts` available for legacy/VSC where appropriate. |
| Appendix renderer | New `src/lib/pdf/inspection-evidence-appendix.ts` | Exhaustive findings and media pagination, index and inclusion verification, per-image error placeholders and no page limit. |
| Jobs/core artifacts | `src/features/outputs/pipeline.ts`, `worker.ts`, `actions.ts`, `queries.ts`, `hooks.ts`, `src/app/api/internal/workers/outputs/route.ts` | Versioned frozen inputs, stage checkpoints, review/status, retries/deadlines, async rendering and immutable four-artifact readiness. |
| Optional exports | New `src/features/outputs/evidence-appendix.ts`; proposed `src/app/api/outputs/[id]/appendix/route.ts` and job/status/download routes | Authorized idempotent lazy export/status/download; independent optional job/error/progress; immutable media-manifest binding. Prefer explicit POST to enqueue, GET for read-only status/download. |
| Existing output endpoints | `src/app/api/outputs/[id]/pdf/route.ts`, `src/app/api/ppi/outputs/[submissionId]/standardized/route.ts`, `vsc/route.ts`, `src/app/api/ppi/outputs/retry/route.ts`, `regenerate/route.ts` | Version-aware JSON and PDF fallback, compatible retry/regeneration semantics, safe readiness and separate appendix option. |
| Web report/download consumers | `src/components/shared/standardized-output-view.tsx`, `inspection-results-panel.tsx`, `inspection-report-card.tsx`, `output-generation-status.tsx`, `dealerspace-inspection-panel.tsx` | Full structured details, explicit evidence states, grouped findings, distinct appendix checkbox/progress/download and no loss of existing disclosures. |
| Customer/admin pages | `src/app/(dashboard)/dashboard/ppi/[id]/page.tsx`, `src/app/(admin)/admin/inspections/[id]/page.tsx` | Ready/version-aware report rendering, authorized export actions and clear error/review states. |
| iOS output consumers | `mobile-app/PerfectPPI/Features/Consumer/ConsumerPpiDetailView.swift`, `Features/PDF/PDFViewer.swift`, `Features/Organization/OrgInspectionsView.swift`, `Features/Technician/Queue/DealerSpaceInspectionCard.swift` | Additive decoding, wait for report readiness, separate main/appendix PDF actions and error state; old clients continue decoding existing artifacts. |
| Share/partner paths | `src/features/media/queries.ts`, `src/features/partner/constants.ts`, `queries.ts`, `delivery.ts`, `send-actions.ts`, `src/app/api/v1/partner/artifacts/[artifactId]/route.ts`, `inspections/[id]/deliverables/route.ts` | Preserve access, immutable checksum/download names and four required artifacts; gate optional appendix exposure separately. |
| Marketplace | `src/lib/marketplace/inspection-report.ts`, `src/features/marketplace/inspection-sharing.ts` and corresponding SQL projection | Preserve redaction/no-score/no-free-text/no-media contract; whitelist safe new scalar facts intentionally rather than exposing the internal v2 object. |
| Coverage | `src/features/warranty/dents-tires-coverage.ts`, `src/lib/ai/vsc-generator.ts`, `src/lib/ai/prompts/vsc-generation.ts`, `src/features/warranty/actions.ts`, `src/lib/pdf/vsc-determination-pdf.ts` | Stable fact compatibility, unchanged approved policy/plan mapping; keep VSC PDF independent and verify no report-layout side effects. |
| Localization | `src/lib/i18n/messages/en-ui.ts` and existing locale structure, `mobile-app/PerfectPPI/Resources/Localizable.xcstrings` | Field/options/exception/attestation/appendix/status copy; translated report labels and supported embedded fonts. |
| Dependencies/config | `package.json`, `pnpm-lock.yaml`, server environment configuration/deployment docs | Pin PDF/font dependencies; server-only TypeSafe key/model; renderer/rules/catalog flags; no committed credentials. |
| Reference assets | `docs/inspection-report-redesign/template-source/`, `output/pdf/` | Keep editable source/spec/fixtures aligned with production renderer; document reference-artifact generation and verification. |

## 12. Implementation sequence and rollout

1. Read the current repository guidance, pull/reconcile changes and rerun the source audit against the implementation baseline. Confirm the current migration chain and API clients; do not assume source-only findings prove deployed behavior.
2. Implement shared schema, stable keys, exact legacy adapters and unit/rule tests first. Encode the formal catalog mapping supplied in the field-map companion; cross-check all 67 original Complete questions and 11 Dents & Tires questions against their report/header/tire/body/detail destinations.
3. Add persistence and guarded certify/freeze transaction, including finalized child-record protections. Verify database grants/RLS/RPC transitions locally before connecting the new UI. For Supabase work, follow the current official docs/CLI discovery process and create a new forward migration; this package contains no applied DDL.
4. Add web and iOS capture/confirmation/review support with client capability gating. Test a real offline-save/upload/retry cycle and prevent unsupported clients from submitting a v2 inspection.
5. Implement extraction cache, deterministic assessment and exhaustive digital JSON. Run Jev in shadow mode; do not wait on classification for explicit structured answers. Add the prose model and verify hard-rule content invariants.
6. Port the reference layout to Node with the shared spec/view model. Verify both scope variants and fallback rendering, then integrate asynchronous artifact generation while preserving immutable versions and four-artifact readiness.
7. Implement optional appendix lifecycle, authorization, frozen manifests, image preparation, full inclusion audit and separate downloads. Exercise a large photo set beyond current model limits and an unavailable-image case.
8. Verify web/mobile/admin/organization/share/partner/marketplace and coverage compatibility. Enable v2 for internal fixtures, then a small new-inspection cohort; observe failure/review rate, runtime, cost, incomplete evidence and support reports.
9. Expand only after gates pass. Keep independent switches for v2 catalog/capture, report renderer, Jev classification and optional appendix. Disabling Jev keeps deterministic findings and approved fallback wording; disabling the v2 rollout routes new sessions to the supported older catalog. Never reinterpret an already certified v2 submission as legacy to bypass requirements.

Rollback must preserve new columns, snapshots, certifications and artifacts. Serve existing immutable versions and pause new affected jobs if necessary. Do not drop schema or rewrite old output JSON to restore an older deployment. A failed release must not erase inspection evidence or make optional-appendix failure block existing partner deliverables.

## 13. Verification and acceptance gates

The reference package's artifact checks do not establish production/API/database correctness. During implementation run relevant unit, database, API, mobile and rendered-PDF checks; record actual commands/results and distinguish skipped environment-dependent checks. Existing repository scripts include `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm i18n:check`, `pnpm test:db` against an isolated configured test database, and `pnpm test:api`. Use the app's existing Xcode test target for Swift changes.

| Test surface | Required cases |
| --- | --- |
| `tests/unit/ppi-questions.test.mts` plus new schema/normalization/rule suites | All four corners; zero; decimal mm and /32; exact conversion/threshold before rounding; invalid numbers; original precision; DOT `0224`, invalid/future dates; front/rear staggered reference; missing/approved alternate fitment; state/value inconsistency; proper yes/no polarity. |
| Role and migration validation | Technician tread/pressure omissions rejected; self unavailable with reason accepted as limitation; blank/deferred/self-role spoof rejected; old integer data exact; unknown old prompts retained; aggregate wear/rim/door data never assigned invented locations; no historical attestation. |
| Extraction and Jev | All expected media records accounted for; unreadable/OCR-conflict/manual override; stale extraction cannot overwrite an edit; no gauge depth inferred from tire texture; malformed/unknown model outputs, confidence abstention, timeout/rate limits; injected note/OCR instructions remain evidence. |
| Deterministic safety | Confirmed foreign object/puncture replacement with holding-pressure, pressure-loss and not-tested branches; suspected object remains suspected; bulge/cords/deep structural damage; severe cracking; cosmetic wheel scuff does not become tire puncture. Any prose downgrade or omitted urgent finding fails. |
| `tests/unit/dents-tires-coverage.test.mts` and Complete coverage fixtures | Exact `<=2/32` eligibility preserved across mm conversion; healthy/unknown cases; bumper exclusion; rim versus tire distinction; old model/prose fixtures; no warranty change from report color or puncture policy. |
| `supabase/tests/inspection_workflow_hardening.test.sql`, `core_vehicle_ppi_privileges.test.sql`, new snapshot/certification tests | Direct REST/SQL status update blocked; unsigned/stale/wrong-actor submit blocked; answer/section/media/OBD mutation cannot invalidate submitted facts; atomic rollback; same-request retry idempotent; revision new certification; cross-owner associations rejected. |
| Report rendering | Exactly two pages for both scopes; correct Letter bounds; no overlap/clipping; grayscale status distinction; long vehicle/name/caption strings; Unicode; translated layouts; all unknown; maximum distinct urgent findings; partial checklist rows; zero values; marker collision; no visible AI labels or dollar estimates. |
| Overflow | Non-urgent overflow count/detail reference; all urgent actions and locations retained; unfit urgent payload returns review/overflow instead of ready; no third main page; optional appendix cannot conceal omissions. |
| Appendix | Unchecked option makes no job; same immutable request deduplicates; all findings and all manifest photos including optional/unanalysed/unlinked/duplicate records; more than 16 photos/12 MB; mixed orientations/large images; video index entries; storage timeout/corrupt/missing image shows explicit incomplete state; correct independent retry and checksum reuse. |
| Queue/artifacts | Stage recovery after each failure; partial upload; deadline/lease expiry; concurrent workers; stale result rejection; manual retry versus regeneration; no early ready; main four-artifact delivery unchanged; optional appendix failure independent. Extend `supabase/tests/partner_integration.test.sql` and `tests/api/partner-api.test.mjs`. |
| Consumers/access | Customer/technician/org/admin permissions; unauthorized ID guessing; revoked share; private storage; correct frozen version downloaded on web/iOS/partner; optional appendix not leaked through summary-only/public routes; legacy JSON decoding/fallback. |
| Marketplace | Preserve `tests/unit/inspection-report.test.mts`, `marketplace-inspection-trust.test.mts`, `supabase/tests/marketplace_inspection_trust.test.sql`, `listing_inspection_sharing.test.sql`; no raw notes/VIN/media/AI score or full v2 payload leakage. |

Release acceptance is concrete:

- Both scoped Page 1 forms are automatically populated from confirmed facts and use the requested two-page main output. Every report has an identifiable immutable version and readable evidence/completeness/certification state.
- Tread is required at all four corners, with only the approved explicit self-inspection exception; the accepted pressure policy is enforced consistently across web, iOS, API and DB.
- Dry-rot/cracking, wear, tire damage and wheel damage retain their distinct rubrics. Puncture/foreign-object replacement is deterministic and cannot be downgraded by pressure-retention data or generated text.
- Two-page summaries retain all urgent actions and disclose unavailable/uninspected data. Full findings are available in authorized digital detail whether or not an appendix was selected.
- The optional appendix is a separate, uncapped PDF with all findings and every frozen uploaded photo, or an explicitly incomplete export with identifiable missing media. Its inclusion counts are verified, not inferred from a successful renderer call.
- Certification cannot be bypassed via alternative routes and cannot be silently reused after an edit. Historical records never receive invented consent or measurements.
- Current coverage behavior, four-artifact partner readiness, old downloads and public redaction continue to work. Price estimates and visible AI labels are absent from the produced inspection/appendix PDFs.
- Reference/production layout parity, actual PDF raster review, text extraction and geometry checks pass. Relevant implementation tests pass with evidence recorded; no production-readiness claim is based only on this design package.
