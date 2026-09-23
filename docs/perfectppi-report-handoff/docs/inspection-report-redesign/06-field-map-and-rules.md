# Inspection report redesign — field map and rules

Status: implementation specification, September 22, 2026. This file describes the approved redesign and its recommended implementation details; it does not claim the application, database, or mobile app already implements them. Baseline source audit: `019fa14`. Read with [the discovery plan](01-discovery-and-plan.md), [flow audit](02-inspection-flow-audit.md), and [pipeline audit](03-report-pipeline-audit.md).

## 1. Decisions that control this contract

- Produce matching, scope-specific **Dents & Tires** (`dents_tires`) and **Complete Inspection** (`complete`) reports. Every main report is exactly two pages: Visual Vehicle Inspection Report, then Inspection Overview. Do not show mechanical checks on Dents & Tires as performed.
- Evaluate condition, priorities, and existing warranty eligibility; do not calculate repair prices, market values, or other dollar estimates. Warranty remains a separate output and decision system.
- Require a tread reading for each tire from technicians. Self-inspectors must answer each tread field, but can explicitly mark the measurement unavailable with a reason. Use one required reading per tire; optionally capture inner, center, and outer readings.
- Apply the accepted recommendation for pressure: actual readings required for technician completion; self-inspectors can mark unavailable with a reason. Brake and battery measurements are optional, and neither product should invent them from visual estimates.
- **A confirmed puncture or embedded foreign object requires tire replacement under this inspection program, regardless of whether the tire currently holds pressure.** This supersedes the repair-or-replace alternative in the raw notes. It is the user's program rule, not a claim that every puncture is universally unrepairable.
- Add an unchecked output option, **Include photo evidence appendix**, with helper text: “Create a separate PDF with all findings and every uploaded inspection photo. The appendix has no page limit.” Keep the main PDF at two pages even when this option is selected. Full findings remain available in the authorized digital report either way.
- Keep Dents & Tires' existing bumper inspection exclusion and separate bumper coverage exclusion. Complete may capture bumper condition. Do not change warranty eligibility when adding condition rules, photos, or colors.

## 2. Stable keys, versions, and observation envelopes

Names below are proposed stable identifiers, not existing database columns. `ppi_answers.id` remains the submission-specific answer UUID. Add `question_key`, `catalog_version`, and a typed observation schema; retain `prompt` as a human-readable snapshot. Never use translated or edited prompt text as a v2 validation or coverage join key.

Canonical corners are **`front_left`, `front_right`, `rear_left`, `rear_right`** throughout storage, extraction, rules, schemas, APIs, Swift, and renderer input. Do not store `fl`, `lf`, or driver/passenger side as canonical values. Page labels may use FL/FR/RL/RR with a legend. Left and right always mean the vehicle's left and right from a seated forward-facing perspective.

Every typed observation needs these concepts, whether persisted as separate columns or validated JSON:

| Property | Contract |
| --- | --- |
| `fact_id`, `question_key`, `source_answer_ids` | Stable identity for this fact and its original answer rows. A finding references IDs, never just a copied label. |
| `observation_state` | `observed`, `unable_to_assess`, `not_inspected`, `not_applicable`, `outside_scope`, or `not_recorded`. The final two are system-assigned scope/history states, not inspector opt-outs. A deferred draft is still unresolved. |
| `value` | Typed value only when observed; do not use a numeric zero to mean missing. Null is not a pass. |
| `exception_reason` | Required for non-observed final observations. NA requires equipment/applicability justification, not lack of tools. |
| `source_kind` | `inspector_entry`, `confirmed_extraction`, `legacy_answer`, or `documented_reference`. Model-only candidates are separate records. |
| `source_evidence_ids` | Durable media/document IDs. Store content hashes and immutable object versions for the submitted snapshot; expiring URLs are delivery mechanisms only. |
| `confirmation` | State `unconfirmed`, `confirmed`, or `corrected`; authenticated actor, server timestamp, and value revision/hash. Corrections retain the proposed and final values separately. |
| `inspection_revision` | Revision included in the frozen submission and final certification. Later photo/answer edits cannot silently change a signed report. |

An inspector's manual entry can be confirmed through the final reviewed submission; an extracted suggestion must first be displayed as a suggestion and accepted or corrected. A confidence score is extraction metadata, not confirmation. A model can flag visible damage, but must not silently record the inspector as having observed or measured it.

Only the versioned product catalog assigns `outside_scope`; only the historical adapter assigns `not_recorded` when a field was never captured. Neither can be selected by a current inspector to bypass required observations. Historical Not recorded displays as Not inspected with the reason “Not recorded in this inspection version.” Required reason metadata for these system-assigned states records the relevant catalog or historical source version.

Keep the model-only evidence state separately: `pending`, `extracted`, `unreadable`, `failed`, or `not_analyzed`. A failed photo extraction does not erase an actual inspector reading. Conversely, an unreadable photo does not establish a clean tire. Associate one media ID with multiple relevant facts using a junction/reference list; do not duplicate uploads to satisfy several fields.

Freeze the vehicle identity, inspector role, observation values, original units, applicability, photo manifest, certification, and catalog version at submission. Store `rules_version`, `schema_version`, `template_version`, prompt/model versions, and input hash with the generated assessment and artifacts. Regeneration uses that snapshot, not today's vehicle profile or the current date for tire age.

## 3. Exact shared capture catalog

`{corner}` expands into all four canonical corners. Use the same controls and semantics in Complete's `tires_brakes` section and Dents & Tires' `wheels_tires` section. This is a grouped card UI, not a requirement to show a separate screen for every scalar field.

| Stable key | Exact recommended question / field label | Type and capture requirements |
| --- | --- | --- |
| `tires.placard` | **Photograph the tire-information placard** | Required attempt in both roles. Accept an image plus editable extracted values, or missing/unreadable/inaccessible with a reason. Capture front and rear recommended size and cold pressure separately. Store reference source and confirmation for each value; use documented manufacturer information when the placard lacks load/speed specifications. |
| `tires.{corner}.sidewall.raw` | **Photograph the {corner label} tire sidewall** / **Sidewall markings** | Required attempt. Store raw readable marking and evidence. Brand, model, XL/LT/load-range/construction markings may be supplemental values; do not treat their absence as clean condition. |
| `tires.{corner}.size` | **Tire size** | Confirmed parsed size designation or explicit unavailable reason. Preserve formatting and the original sidewall text. Do not infer vehicle-approved fitment from tire size alone. |
| `tires.{corner}.load_index` | **Load index** | Numeric string or structured dual indices where present; preserve the raw token, e.g. `91` or `121/118`. These are not speed letters. Unreadable is available. |
| `tires.{corner}.speed_rating` | **Speed rating** | Confirmed speed symbol, including relevant parentheses as printed. Preserve the service description; `ZR` inside a size designation is not itself a replacement for the service-description speed symbol. Unknown is available. |
| `tires.{corner}.dot_date` | **DOT date code (four digits)** | Four-character string, e.g. `0224`; photo attempt or unavailable reason. Never strip leading zeros. See date validation below. |
| `tires.{corner}.tread` | **Measure the {corner label} tire tread depth** | Decimal reading plus `thirty_seconds_inch` or `mm`, gauge/method, location, and source. Label the default field “Lowest reading you measured”; this does not assert that the entire tire was measured. Optional inner/center/outer readings retain individual IDs and units. Required technician measurement; self-inspector unavailable allowed. |
| `tires.{corner}.pressure` | **Measure the {corner label} tire pressure** | Reading plus `psi` or `kPa`, cold/warm/unknown context, observation time, gauge source. Required technician measurement; self-inspector unavailable allowed. Offer separate optional pressure-loss observation and recheck fields. |
| `tires.{corner}.cracking` | **Visible cracking / dry rot** | `none`, `starting`, `significant`, `severe`; explicit unable-to-assess/not-inspected. Show four reference descriptions and images in UI. Photo-assisted suggestion requires inspector confirmation. |
| `tires.{corner}.wear` | **Tread wear pattern** | `even`, `uneven_monitor`, `severe_uneven`; explicit unable-to-assess/not-inspected. Optional tags: inner edge, outer edge, center, both shoulders, cupping/scalloping, patchy, other. |
| `tires.{corner}.damage` | **Tire damage or foreign objects** | Repeatable defect entries using `puncture`, `foreign_object`, `cut`, `missing_rubber`, `bulge`, `exposed_cords`, `suspected_separation`, or `other`. Alternatively explicitly select `none_observed`. Capture tread/shoulder/sidewall/unknown location, depth/extent when observable, evidence, and confirmation. `none_observed` is exclusive with defect entries. |
| `wheels.{corner}.damage` | **Wheel / rim damage** | Repeatable `scratch_curb_rash`, `gouge_chipped_material`, `bent`, `cracked`, `other` defects, or explicit `none_observed`. Distinguish cosmetic from suspected structural damage; retain notes, affected area, and photos. A chunk missing from a wheel is wheel damage, not missing tire rubber. |
| `tires.{corner}.fitment` | **Installed tire compared with vehicle specification** | Derived comparison: `match`, `differs_from_reference`, `documented_alternative`, `unknown`. Compare front corners with front reference and rear corners with rear reference. Show installed and expected values together; preserve the source of an approved alternative. |
| `body.{panel}.condition` | **{Panel label}: visible condition** | `no_visible_damage`, `damage_present`, with common explicit observation exceptions. When damage is present, capture repeatable entries described below. |
| `inspection.certification` | **I certify that the observations and answers in this inspection are accurate to the best of my knowledge and ability.** | Unchecked affirmative checkbox on final review. Authenticated actor, exact text/version, server timestamp, submission revision, and snapshot hash are mandatory. This is an accuracy certification, not a professional credential or fabricated handwritten signature. |
| `report_options.include_photo_evidence_appendix` | **Include photo evidence appendix** | Boolean, default false; generation/download preference, not an inspection observation or model input. Record against the relevant submitted version. |

### Required answers and exceptions by role

“Required attempt” means answer with confirmed observed data or a permitted explicit reason. It never means force a fabricated value or unsafe access. Photos must be uploaded and associated with the correct corner/panel before they satisfy an evidence requirement; pending local uploads do not satisfy final submission.

| Field/check | Technician | Self-inspector | If unavailable in the report |
| --- | --- | --- | --- |
| Each tire tread | Numeric reading required. Missing gauge/access prevents normal completion; save/resume or a separate auditable exception workflow if introduced later. | Numeric reading or explicit unavailable reason required. | Unknown / tread not measured; never green and never a zero measurement. |
| Each tire pressure | Numeric reading required under accepted recommendation. No blanket self-inspection exemption based on account name; use actual performer role. | Numeric reading or explicit unavailable reason required. | Unknown / pressure not measured; no claim tire holds air. |
| Placard, sidewall specifications, DOT | Required attempt; inaccessible/unreadable/missing may be finalized with reasons. | Same. | Unable to verify the affected field; unknown fitment if baseline/installed values insufficient. |
| Cracking, wear, tire damage, wheel condition | Explicit inspection result required; unsafe/inaccessible portions can be unable to assess with reason. | Same, with guided descriptions and visible limitations. | Unknown or Not inspected. A visible portion does not establish the unseen side is clean. |
| In-scope body areas | Explicit result required for each applicable area; inaccessible surfaces carry an exception. | Same. | Partial body inspection; show the affected panel in the limitations list. |
| Brake lining / rotor thickness | Optional measurement, Complete only. Existing pad-life estimate and visible-rotor checks remain separate. | Optional; no requirement to dismantle or reach unsafe areas. | “Not measured” in optional detail; never substitute an estimate in millimeters. |
| Battery test / CCA | Optional measurement, Complete only, with test type, unit, device/result, reference when comparing. | Optional. | “Not tested”; battery-terminal observation does not establish battery capacity. |
| Existing Complete checks | Preserve current required-question flags while adding explicit applicability/access states. Missing selected optional tests does not block submission. | Same capture requirements with legitimate applicability/access reasons, except role-specific tread/pressure rules above. | No checked status for omitted observations; show partial coverage where a grouped row includes omissions. |

Photo-role minimums: require one corner context image per wheel plus a tread/gauge image when a tread reading is provided; request sidewall and DOT views to substantiate the extracted markings. One clear photo may meet several roles. Require a photo attempt for declared damage, with an explicit evidence exception if the relevant area cannot be photographed. The placard requires its own attempt. Record absent roles as evidence limitations; the inspector's entered measurement and photo completeness remain separate dimensions. Technician tread/pressure are still mandatory readings even when OCR is unavailable.

### Numeric, date, and pressure validation

- Retain entered numeric text/decimal and its unit. Reject NaN, infinity, negative values, exponential strings that clients do not support, and locale ambiguity; normalize locale input before canonical serialization. Use decimal/rational arithmetic for thresholds. For compatibility with the existing permitted tread range, accept `0–32` in thirty-seconds or `0–25.4 mm`, including decimals. A reading beyond the capture range requires correction/review, not clipping.
- Exact tread conversion: `mm = thirty_seconds_inch × 0.79375`. The `2/32 in` threshold is exactly `1.5875 mm`. Compare before rounding. Displaying `1.6 mm` must not decide whether a `1.59 mm` reading is above the threshold. For multiple measured positions, use the lowest valid confirmed reading for the tread action and preserve all readings and their locations.
- Pressure: preserve original `psi`/`kPa`; use a versioned decimal conversion constant (`1 psi = 6.894757293168 kPa`). Do not use the sidewall maximum as the recommended cold target. Record warm/unknown readings honestly; do not “correct” them to cold with an invented formula. Compare only against a confirmed relevant specification; show deviation with context and recommend recheck when needed. This redesign does not introduce a universal pressure difference cutoff.
- A single pressure number is not a leak test. Optional `pressure_loss` is `observed`, `reported`, `not_observed_during_test`, or `not_tested`, with method/history, reading times, and elapsed interval where tested. Neither no reported loss nor a photo downgrades the puncture replacement rule.
- DOT codes remain strings matching four digits. Week `00` or `54–99` is invalid; `01–52` is ordinary input and `53` needs verification against the actual marking/manufacturer date convention rather than unconditional rewriting to 52. Resolve the two-digit year against the inspection date and plausibility; ambiguous historical codes need review. A date wholly after inspection is invalid; same-week uncertainty is not an exact production-day claim. Store the production week/year, an approximate age or range, and the rule version; age is calculated at inspection time.
- Absence of a DOT date, a recent date, or an unverified placard cannot prove condition, service life, or correct fitment. A date/appearance discrepancy requests confirmation and assessment; it does not invent a storage, manufacturing, maintenance, or suspension diagnosis.

## 4. Body map and repeatable damage

Use canonical panel names `left_front_fender`, `right_front_fender`, `hood`, `left_front_door`, `left_rear_door`, `right_front_door`, `right_rear_door`, `left_rear_quarter`, `right_rear_quarter`, `roof`, `trunk_tailgate`, `left_rocker`, `right_rocker`, `other_body_panel`; Complete also has `front_bumper` and `rear_bumper`. A two-door vehicle's rear doors are NA by confirmed body configuration. Use `other_body_panel` plus a label for unmatched body styles; use a clearly generic diagram when geometry does not match.

Dents & Tires' current six areas remain coverage/compatibility groups: left front fender, right front fender, hood, left door(s), right door(s), and remaining body panels. A precise panel within the existing “Body panels” group provides a location, not a newly invented warranty class. Bumpers are outside its inspection scope even if incidentally visible in an uploaded picture; its report must not imply they were checked or newly covered.

Each damage record has an immutable `damage_id`, parent panel or wheel/tire key, defect type, inspector-selected severity/extent, observation state, note, `fact_ids`, `source_answer_ids`, `source_evidence_ids`, confirmation, and optional marker `{view, x, y}`. Coordinates are normalized `0–1` within the named diagram view, not page pixels. The report renderer resolves page geometry. Defect types for body include dent, scratch, paint damage, rust/corrosion, mismatched/repainted panel, and other.

Multiple defects on one panel remain multiple records. One defect shown in several photos retains one ID with several evidence links. Number visible markers deterministically by stable finding order for the current report, but keep the immutable ID in JSON and appendix references. A marker is a location, not a precision measurement of damage size. If a legacy finding has no reliable corner/panel, label it “location not recorded”; do not guess a side or scatter identical damage over all four wheels.

Page 1 shows the diagram and bounded damage index, prioritizing urgent/structural concerns. Page 2 groups the significant findings. The digital report and optional appendix retain every finding, including entries omitted from the compact index; show a truthful “additional findings” reference when needed. Never drop a distinct urgent action solely to fit the drawing.

## 5. Complete's exact legacy prompt adapter and 25-row mapping

These are display groupings, not 25 replacement questions. Below, `R01–R25` are stable report row IDs. `H` means header/detail, `T` tire cards, and `D` damage diagram. Positions are one-based in `SECTION_QUESTION_TEMPLATES`, not durable source identifiers. Adapter lookup must include catalog/scope/section plus exact historical prompt. Preserve original answer IDs, prompt snapshots, and values; store any mapping uncertainty.

Disposition **Keep** means retain the observation and its existing option semantics, attach a stable key, and add explicit exception handling. **Replace/extend** means migrate the capture UI to structured data while retaining the original historical observation. All 67 current Complete questions are accounted for here.

| Source section:position | Exact current prompt | Proposed key | Destination / change |
| --- | --- | --- | --- |
| `vehicle_basics:1` | Confirm the VIN on the vehicle | `vehicle.vin_confirmation` | H + R01; keep, compare confirmed observation with frozen intake identity. |
| `vehicle_basics:2` | Current odometer reading (miles) | `vehicle.odometer` | H + R01; keep original mileage/unit, add typed units. |
| `vehicle_basics:3` | Number of keys included | `vehicle.keys_count` | H/detail; keep. |
| `vehicle_basics:4` | Title status | `vehicle.title_status` | R01; keep reported title state; do not claim independent title verification. |
| `vehicle_basics:5` | Any accidents reported on history report? | `vehicle.history_accidents_reported` | R01; keep report basis and any available evidence. Missing history report is unknown. |
| `vehicle_basics:6` | Additional notes on vehicle basics | `vehicle.notes` | H/detail and relevant R01 finding; keep. |
| `exterior:1` | Overall paint condition | `exterior.paint_condition` | R02 + D; keep general rating, extend panel capture and photo roles. |
| `exterior:2` | Are there any dents or dings? | `exterior.dents_present` | R02 + D; replace fresh capture with per-panel facts; derive summary, preserve legacy yes/no. |
| `exterior:3` | Describe any dents, dings, or paint damage | `exterior.damage_notes` | R02 + D; structured panel damage plus optional general note. |
| `exterior:4` | Is there any rust visible on the body? | `exterior.body_rust_present` | R02 + D; structured rust entries; do not infer structural depth from yes. |
| `exterior:5` | Windshield condition | `exterior.windshield_condition` | R03; keep. |
| `exterior:6` | Are any panels mismatched or repainted? | `exterior.panel_mismatch_or_repaint` | R02 + D; add affected panel, preserve distinction between observation and accident inference. |
| `exterior:7` | Condition of lights and lenses (headlights, taillights) | `exterior.lamp_lens_condition` | R04; keep lens condition separate from function. |
| `interior:1` | Overall interior condition | `interior.overall_condition` | R05; keep general condition. |
| `interior:2` | Are there any rips, tears, or stains on seats? | `interior.seat_damage_present` | R05; keep. |
| `interior:3` | Describe any interior damage | `interior.damage_notes` | R05 or the explicitly identified interior row; keep source if unlocalized. |
| `interior:4` | Is there any unusual odor (smoke, mold, pets)? | `interior.unusual_odor` | R07; keep; do not diagnose mold from odor alone. |
| `interior:5` | Do all power seat adjustments work (if equipped)? | `interior.power_seat_operation` | R05; keep, true equipment NA supported. |
| `interior:6` | Carpet and floor mat condition | `interior.carpet_mats_condition` | R06; keep. |
| `road_test:1` | Does the engine start smoothly without hesitation? | `road_test.smooth_start` | R11; keep. |
| `road_test:2` | Does the transmission shift smoothly through all gears? | `road_test.smooth_shifts` | R11; keep, applicability/test limitations explicit. |
| `road_test:3` | Any vibrations at highway speed? | `road_test.highway_vibration` | R13; keep; unperformed highway test is not “no.” |
| `road_test:4` | Does the vehicle brake in a straight line without pulling? | `road_test.straight_line_braking` | R12; keep. |
| `road_test:5` | Any unusual noises while driving (clunks, squeals, grinding)? | `road_test.unusual_noise` | R13; keep. |
| `road_test:6` | Describe any drivability concerns observed during the road test | `road_test.drivability_notes` | R13 and named affected row; keep. |
| `dashboard_warnings:1` | Are any warning lights currently on? | `dashboard.warning_lights_present` | R14; keep; add ignition/engine context to distinguish lamp check from persistent warning. |
| `dashboard_warnings:2` | Is the check engine light on? | `dashboard.check_engine_light` | R14; keep observed state and context. |
| `dashboard_warnings:3` | List all active warning lights (if any) | `dashboard.warning_lights_list` | R14; keep; structured warning labels may supplement free text. |
| `dashboard_warnings:4` | Were DTC codes scanned? List codes if yes. | `diagnostics.scan_notes` | R15; separate scan-performed state, exact codes, and attached scan when available. |
| `dashboard_warnings:5` | Any ABS or traction control warnings? | `dashboard.abs_traction_warning` | R14; keep; no unsupported component diagnosis. |
| `engine_bay:1` | Are there any visible oil or fluid leaks? | `engine_bay.visible_fluid_leak` | R16; keep. |
| `engine_bay:2` | Serpentine/drive belt condition | `engine_bay.drive_belt_condition` | R18; keep; “Not visible” becomes unable to assess. |
| `engine_bay:3` | Are there any unusual noises at idle? | `engine_bay.idle_noise` | R17; keep. |
| `engine_bay:4` | Describe any engine noises or concerns | `engine_bay.concern_notes` | R17 or identified relevant row; keep. |
| `engine_bay:5` | Is there visible corrosion on the battery terminals? | `engine_bay.battery_terminal_corrosion` | R19; keep; optional battery test remains a separate fact. |
| `engine_bay:6` | Any signs of coolant leaks or overheating (white deposits)? | `engine_bay.coolant_leak_signs` | R16; preserve observed signs; do not turn deposits into confirmed overheating. |
| `fluids:1` | Engine oil condition | `fluids.engine_oil_condition` | R20; keep reported visual condition, not laboratory diagnosis. |
| `fluids:2` | Coolant level | `fluids.coolant_level` | R20; keep. |
| `fluids:3` | Brake fluid color | `fluids.brake_fluid_color` | R20; keep; no inferred moisture percentage. |
| `fluids:4` | Transmission fluid condition (if dipstick accessible) | `fluids.transmission_fluid_condition` | R20; keep, inaccessible separate. |
| `fluids:5` | Power steering fluid level (if applicable) | `fluids.power_steering_level` | R20; keep, electric steering option becomes NA. |
| `tires_brakes:1` | Front left tire tread depth (in 32nds of an inch) | `tires.front_left.tread` | T; replace fresh scalar input with typed tread; preserve historical integer /32 value. |
| `tires_brakes:2` | Front right tire tread depth (in 32nds of an inch) | `tires.front_right.tread` | T; same. |
| `tires_brakes:3` | Rear left tire tread depth (in 32nds of an inch) | `tires.rear_left.tread` | T; same. |
| `tires_brakes:4` | Rear right tire tread depth (in 32nds of an inch) | `tires.rear_right.tread` | T; same. |
| `tires_brakes:5` | Estimated brake pad life remaining | `brakes.pad_life_estimate` | R21; keep percentage label; do not create mm or per-corner estimates. |
| `tires_brakes:6` | Is there any uneven tire wear? | `tires.legacy_uneven_wear` | T/overview; replace fresh capture with four wear fields. Historical yes remains unlocalized and does not assign severity/corner. |
| `tires_brakes:7` | Rotor condition (if visible) | `brakes.visible_rotor_condition` | R21; keep; Not visible is unable to assess. |
| `suspension_steering:1` | Is there any play or looseness in the steering wheel? | `steering.play_or_looseness` | R22; keep. |
| `suspension_steering:2` | Bounce test result (push down on each corner) | `suspension.bounce_test` | R23; keep qualitative result without inventing shock measurements. |
| `suspension_steering:3` | Any clunking or rattling noises over bumps? | `suspension.noise_over_bumps` | R23; keep. |
| `suspension_steering:4` | Describe any suspension or steering concerns | `suspension.concern_notes` | R23/R22 if localized; keep. |
| `suspension_steering:5` | Does the vehicle pull to one side? | `steering.pulls_to_side` | R22; keep. |
| `underbody:1` | Frame rust level | `underbody.frame_rust` | R24; keep; severe/structural result must be prominent. |
| `underbody:2` | Any visible fluid leaks from underneath? | `underbody.visible_fluid_leak` | R24 and related fluid finding; keep common finding ID when same leak. |
| `underbody:3` | Exhaust system condition | `underbody.exhaust_condition` | R24; keep. |
| `underbody:4` | Describe any underbody concerns | `underbody.concern_notes` | R24; keep. |
| `electrical_controls:1` | Do all exterior lights work (headlights, brake, reverse, turn signals)? | `electrical.exterior_lights_operation` | R04; keep. |
| `electrical_controls:2` | Do all windows operate correctly? | `electrical.windows_operation` | R08; keep. |
| `electrical_controls:3` | Does the air conditioning blow cold? | `electrical.ac_operation` | R09; keep. |
| `electrical_controls:4` | Does the heater work? | `electrical.heater_operation` | R09; keep. |
| `electrical_controls:5` | Is the infotainment/radio system functional? | `electrical.infotainment_operation` | R10; keep. |
| `electrical_controls:6` | Do all door locks work from the driver switch? | `electrical.door_locks_operation` | R08; keep current wording. Legacy combined wording discussed below. |
| `electrical_controls:7` | Any electrical concerns or malfunctions? | `electrical.concern_notes` | R10 or named affected row; keep. |
| `modifications:1` | Are there any aftermarket modifications on this vehicle? | `modifications.present` | R25; keep; presence alone is not a fault. |
| `modifications:2` | List all modifications (suspension, engine, exhaust, wheels, etc.) | `modifications.list` | R25 and relevant fitment/system; keep as reported, not manufacturer approval. |
| `modifications:3` | Additional findings or notes not covered in other sections | `inspection.additional_notes` | R25 and affected row; keep all in full findings. |

The older prompt “Do all door locks and windows work from the driver switch?” appears in the source's canonicalization adapter. Preserve its combined meaning as a legacy fact associated with R08; do not manufacture separate new lock and window confirmations. Similarly, the old Complete front-left tread question requested a photo of the worst tire, so its linked photo does not establish front-left image provenance without inspection/confirmation.

### Report row contract

| Row | Page-1 label | Exact source positions |
| --- | --- | --- |
| R01 | Vehicle identity / title / history | `vehicle_basics` 1,2,4,5; keys/notes in header/detail. |
| R02 | Paint / panels / visible body damage | `exterior` 1,2,3,4,6 + structured body facts. |
| R03 | Windshield | `exterior` 5. |
| R04 | Exterior lamps / lenses | `exterior` 7 + `electrical_controls` 1. |
| R05 | Seats / upholstery / adjustments | `interior` 1,2,3,5. |
| R06 | Carpet / floor mats | `interior` 6. |
| R07 | Interior odors | `interior` 4. |
| R08 | Windows / door locks | `electrical_controls` 2,6. |
| R09 | Air conditioning / heat | `electrical_controls` 3,4. |
| R10 | Infotainment / other electrical | `electrical_controls` 5,7. |
| R11 | Starting / transmission operation | `road_test` 1,2. |
| R12 | Braking during road test | `road_test` 4. |
| R13 | Road vibration / noise / drivability | `road_test` 3,5,6. |
| R14 | Dashboard / warning lamps | `dashboard_warnings` 1,2,3,5. |
| R15 | Diagnostic scan findings | `dashboard_warnings` 4 + actual attached OBD snapshot if present. |
| R16 | Engine-bay fluid / coolant leaks | `engine_bay` 1,6. |
| R17 | Idle noise / engine concerns | `engine_bay` 3,4. |
| R18 | Drive belt | `engine_bay` 2. |
| R19 | Battery terminals | `engine_bay` 5; optional test shown separately if performed. |
| R20 | Fluids observed | `fluids` 1–5, retaining individual observation/exception states. |
| R21 | Brake pad estimate / visible rotors | `tires_brakes` 5,7; optional actual measurements separate. |
| R22 | Steering / tracking | `suspension_steering` 1,5. |
| R23 | Suspension / ride | `suspension_steering` 2,3,4. |
| R24 | Frame / underside / exhaust | `underbody` 1–4. |
| R25 | Modifications / additional concerns | `modifications` 1–3 plus relevant notes. |

## 6. Dents & Tires' exact legacy adapter

Its 11 source questions become two richer capture sections. Keep all old findings available; do not upgrade missing legacy condition fields to observed no damage.

| Source section:position | Exact current prompt | V2 destination and compatibility rule |
| --- | --- | --- |
| `wheels_tires:1` | Front left tire tread depth (in 32nds of an inch) | `tires.front_left.tread`; original unit /32, original integer preserved. |
| `wheels_tires:2` | Front right tire tread depth (in 32nds of an inch) | `tires.front_right.tread`; same. |
| `wheels_tires:3` | Rear left tire tread depth (in 32nds of an inch) | `tires.rear_left.tread`; same. |
| `wheels_tires:4` | Rear right tire tread depth (in 32nds of an inch) | `tires.rear_right.tread`; same. |
| `wheels_tires:5` | Any problems with the rims or tires? | Preserve as `legacy.wheels_tires.concerns`; new capture uses per-corner tire and wheel damage. Do not guess component/corner or split one unlocalized note into four confirmed defects. |
| `body_damage:1` | Left front fender — scratches or dents | `body.left_front_fender.condition` + damage entries; blank historical text is not no damage. |
| `body_damage:2` | Right front fender — scratches or dents | `body.right_front_fender.condition` + damage entries. |
| `body_damage:3` | Hood — scratches or dents | `body.hood.condition` + damage entries. |
| `body_damage:4` | Left door — scratches or dents | Preserve as `legacy.body.left_door`; map to an individual left door only if evidence specifies it. |
| `body_damage:5` | Right door — scratches or dents | Preserve as `legacy.body.right_door`; map to an individual right door only if evidence specifies it. |
| `body_damage:6` | Body panels — scratches or dents | Preserve as `legacy.body.panels`; refine location only when recorded or confirmed. Never assign bumper coverage. |

Fresh v2 Dents & Tires report has four wheel cards, fitment/reference detail, the in-scope body diagram/index, completeness, and certification. It has no R01–R25 mechanical checklist. VIN/mileage header values originate from confirmed intake/snapshot, with “not confirmed during this inspection” when that is the actual evidence state; do not create a hidden complete vehicle inspection.

## 7. Deterministic statuses and action priorities

Store condition action and observation completeness separately. Proposed `action_level` is `none`, `monitor`, `service_recommended`, or `urgent`. Proposed `coverage_state` for the report means **inspection completeness**, not warranty coverage: `complete`, `partial`, `not_assessed`, or `outside_scope`. Prefer the explicit field name `inspection_completeness` in implementation to prevent ambiguity.

| Display status | Color / symbol | Exact meaning |
| --- | --- | --- |
| Checked | Green / check | Applicable required constituent observations are confirmed, no actionable concern is found, and the row has no unresolved relevant check. A completed form alone does not qualify. |
| Monitor | Yellow / small triangle | Confirmed low-level concern worth noting/follow-up. |
| Service recommended | Orange / triangle | Confirmed condition warrants service or assessment; no immediate removal-from-service rule triggered. |
| Urgent | Red / exclamation | An immediate action rule or unresolved credible critical concern requires prominent attention. Distinguish confirmed replacement from precautionary review in wording. |
| Unknown | Gray / question mark | Observation attempted but unassessable/unconfirmed, or conflicting evidence unresolved. Include reason. |
| Not inspected | Gray / dash | A check was not performed or was not recorded in a historical inspection. |
| Not applicable | Gray / N/A | Affirmative, justified applicability result. |
| Outside scope | Gray / scope label | Check is not included in this inspection product. |

Priority order is **urgent > service_recommended > monitor > none**. Evaluate every applicable rule; accumulate all distinct findings and use the highest action for the compact row/card. A higher-priority finding does not erase lower-priority observations. With no actionable finding, show Checked only if applicable observations are complete; otherwise show Unknown, Not inspected, NA, or Outside scope as appropriate. With an actionable finding plus omissions, show the action **and** “Partial — {missing checks}.” Unknown never suppresses a red confirmed defect, and a clean sibling observation never masks a missing tread measurement.

For an exact no-action fallback, resolve in this order: wholly outside the product scope → Outside scope; wholly justified NA → Not applicable; any unassessable/unconfirmed/conflicting applicable observation → Unknown; otherwise any unperformed/unrecorded applicable observation → Not inspected; otherwise all applicable observations confirmed without concern → Checked. In mixed NA/observed groups, exclude the justified NA constituent from completion requirements but retain its label in detail. Optional explanatory text left blank is not an unperformed check; a selected optional physical test with no result is.

Dry-rot's four-level scale is `none → Checked/green`, `starting → Monitor/yellow`, `significant → Service recommended/orange`, `severe → Urgent/red`. Wear's three-level scale is `even → Checked/green`, `uneven_monitor → Monitor/yellow`, `severe_uneven → Urgent/red`. These are field indicators; an entire tire is not Checked merely because cracking is none or wear is even.

### Tire, wheel, and fitment rule table

All rules cite the confirmed source fact IDs and evidence IDs. These are condition recommendations, not warranty decisions. Listed thresholds are program rules; do not label them universal legal limits. No unapproved low-tread warning band or pressure cutoff is introduced.

| Rule ID | Trigger | Action / exact recommendation intent |
| --- | --- | --- |
| `TREAD-001` | Lowest valid confirmed tread `<= 2/32 in` (`<= 1.5875 mm`) | **Urgent; replacement required.** Identify tire and reading. Test exact boundary before display rounding. |
| `TREAD-002` | Tread above threshold | No threshold action alone. It cannot override cracking/damage/wear or make an incomplete tire Checked. |
| `TREAD-003` | Tread unavailable/unconfirmed | Unknown / incomplete; self-inspector may submit allowed exception, technician cannot complete normally. No wear/coverage conclusion from absent numeric value. |
| `CRACK-001` | Confirmed `starting`: fine beginning surface cracking | Monitor; note condition and reassess. Do not say replacement is automatically required. |
| `CRACK-002` | Confirmed `significant`: substantial visible cracking without confirmed severe structural signs | Service recommended; recommend tire replacement/qualified assessment of condition. |
| `CRACK-003` | Confirmed `severe`: extensive/deep dangerous cracking | Urgent; replacement required. Do not wait for an age cutoff. |
| `WEAR-001` | Confirmed `uneven_monitor` | Monitor; investigate inflation, alignment, and suspension where warranted. These are possible contributing factors, not proven failures. |
| `WEAR-002` | Confirmed `severe_uneven` | Urgent assessment of tire condition and alignment/suspension/inflation. **Severe uneven wear alone does not invent an unconditional replacement rule**; apply measured tread/structural damage rules independently. |
| `DAMAGE-001` | Confirmed puncture **or** embedded foreign object | Urgent; **replacement required under this inspection program regardless of pressure retention**. Never offer patch-or-replace as the program recommendation. The report can distinguish confirmed object from suspected object. |
| `DAMAGE-002` | Confirmed outward bulge/bubble | Urgent; replacement required. Require confirmation to distinguish an outward bulge from a suspected/photo-only contour. |
| `DAMAGE-003` | Exposed cords/wires | Urgent; replacement required. |
| `DAMAGE-004` | Confirmed missing tire rubber/chunk | Urgent; replacement required under the requested condition rule. Ordinary scuffing belongs in a cosmetic note, not falsely classified missing rubber. |
| `DAMAGE-005` | Confirmed deep cut, structural damage, or separation | Urgent; tire removal from service and replacement assessment; confirmed structurally damaged tire requires replacement. A superficial cut without depth evidence is service assessment, not invented exposed cords. |
| `DAMAGE-006` | Photo/model suspects bulge, cords, structural cut, separation, or foreign object; inspector confirmation absent/conflicting | Urgent **review flag**, not a fabricated confirmed measurement or replacement fact. Ask inspector to inspect/confirm when possible; final report retains precaution and uncertainty if unresolved. |
| `PRESSURE-001` | Confirmed pressure loss or inability to hold pressure | Urgent professional assessment and source identification; apply any independent replacement rule. A single low reading does not prove sustained leakage. |
| `PRESSURE-002` | Confirmed actual pressure differs from verified target, with measurement context | Show actual/target/context and recommend appropriate recheck/correction; service recommendation when a genuine discrepancy is confirmed. No invented percentage cutoff and no unsupported “cold equivalent.” |
| `FITMENT-001` | Confirmed installed specification differs from correct axle reference, no documented approved alternative | Service recommended; visible mismatch alert, recommend verifying and matching vehicle-approved fitment. **Does not fail the PPI or automatically alter warranty.** |
| `FITMENT-002` | Confirmed documented manufacturer-approved alternative | Show alternative and source; no mismatch alert solely because literal placard text differs. |
| `FITMENT-003` | Missing/uncertain baseline or installed specification | Unknown / unable to verify. Never mismatch or match by default. |
| `AGE-001` | Recent date and severe cracking, or conflicting date/appearance evidence | Additional review flag: confirm date, tire identity, and condition; professional assessment. Does not lower cracking severity or claim a proven cause. |
| `WHEEL-001` | Scratches/curb rash only | Monitor; cosmetic wheel finding, source photos linked. |
| `WHEEL-002` | Gouge/chipped material with structural involvement unknown | Service recommended; inspect extent. Keep wheel damage separate from missing tire rubber. |
| `WHEEL-003` | Cracked, bent, or visibly structurally compromised wheel | Urgent professional wheel/tire assembly assessment; determine safe service/replacement. Do not infer a tire replacement or warranty result merely from wheel color. |
| `BODY-001` | Cosmetic dent/scratch/paint damage | Monitor for minor cosmetic concern; service recommended for substantial repair concern. Preserve inspector extent and classification basis. |
| `BODY-002` | Suspected or confirmed structural rust/body damage | Urgent assessment when structural integrity is implicated; explicitly identify suspected versus confirmed. Do not infer frame damage from a superficial body scratch. |

For `DAMAGE-001–004` and `CRACK-003`, place the corner-specific replacement requirement in the urgent action area and corresponding overview category. An ordinary pressure result, clean DOT/fitment, or model prose cannot downgrade it. Where practical, group identical replacement requirements in one sentence listing **every** affected corner and every distinct trigger. Do not replace these with a vague “several tires need attention.”

### Existing Complete observations: categorical adapters

Yes/no has mixed polarity. Negative-condition questions (leaks, unusual noise, damage, looseness, warning presence) use **no** as the favorable observation; positive-function questions (heater works, smooth shifting, windows operate) use **yes**. Unknown, omitted, and true NA must remain separate before applying polarity. History accidents, title category, and modification presence describe facts; they are not automatically mechanical pass/fail results.

Use the following exact option mappings as deterministic **minimum** actions. Additional confirmed evidence can raise severity; text/model interpretation cannot silently lower a deterministic urgent action. Existing free-text findings need categorization with source IDs and uncertainty, not a keyword-only mechanical diagnosis.

| Current options | Base action / exception |
| --- | --- |
| Paint/interior `Excellent`, `Good` | None for the reported rating. Other incomplete checks can prevent group Checked. |
| Paint/interior `Fair`, `Poor` | Monitor, service recommended respectively. |
| Windshield `No damage`, `Small chip`, `Crack`, `Multiple cracks` | None, monitor, service recommended, service recommended; upgrade for specifically confirmed critical obstruction/structural hazard. |
| Lenses `Clear and intact`, `Minor yellowing`, `Cracked/broken`, `Missing` | None, monitor, service recommended, service recommended; evaluate functional lighting independently. |
| Carpet `Excellent`, `Good`, `Stained`, `Torn/worn through` | None, none, monitor, service recommended. |
| Belt `Good`, `Worn`, `Cracked`, `Not visible` | None, service recommended, service recommended, unable to assess. |
| Pad estimate `>75%`, `50–75%`, `25–50%`, `<25% (needs replacement)` | None, none, monitor, service recommended/replacement recommendation based on the reported estimate; never convert to a thickness. |
| Rotor `Good`, `Surface rust (normal)`, `Grooved/scored`, `Not visible` | None, none with note, service recommended, unable to assess. |
| Bounce `Firm (good shocks)`, `One bounce (acceptable)`, `Bouncy (worn shocks)` | None, none, service recommended assessment; the legacy label is not a measured shock diagnosis. |
| Oil `Clean (amber)`, `Dark (due for change)`, `Very dark/dirty`, `Milky (coolant contamination)` | None, service recommended, service recommended, urgent assessment of reported milky appearance; do not assert laboratory-confirmed contamination. |
| Coolant `Full`, `Low`, `Empty`, `Not checkable` | None, service recommended, urgent assessment, unable to assess. |
| Brake fluid `Clear/light yellow (good)`, `Amber (ok)`, `Dark brown (old)`, `Not checkable` | None, none, service recommended, unable to assess. |
| Transmission fluid `Pink/clear (good)`, `Brown (aging)`, `Dark/burnt smell`, `Not checkable` | None, monitor, service recommended, unable to assess. |
| Steering fluid `Full`, `Low`, `Not applicable (electric steering)`, `Not checkable` | None, service recommended, not applicable, unable to assess. |
| Frame rust `None`, `Surface rust (minor)`, `Moderate rust`, `Severe/structural rust` | None, monitor, service recommended, urgent structural assessment. |
| Exhaust `Good`, `Surface rust (normal)`, `Holes/cracks`, `Missing sections` | None, none with note, service recommended, service recommended; elevate for confirmed dangerous exhaust ingress or other critical evidence. |
| Title `Clean`, `Salvage`, `Rebuilt`, `Lemon Law`, `Unknown` | Report exactly as supplied. Non-clean title: documentary review recommendation, not a physical-condition conclusion. Unknown: unknown documentation state. |

For functional no/concern yes without enough detail, default to service recommended assessment; minor cosmetic concerns may be monitor, and explicitly confirmed critical steering/braking/structural hazards are urgent. Normal ignition lamp checks are not persistent-warning faults: capture engine state and ask for clarification when the legacy dashboard photo/answer is ambiguous. Missing scan evidence cannot yield “no diagnostic faults.”

## 8. Assessment and page mapping

Use deterministic facts for Page 1. Each report row/card carries source fact IDs, applicable checks, action level, inspection completeness, and concise limitations. Jev may classify bounded, normalized text into categories, affected systems, candidate actions, and uncertainty; it must not invent measurements, image observations, title verification, vehicle identity, or warranty eligibility. A separate image-capable extraction provider reads photo candidates, and the overview writer consumes accepted facts/findings. Provider failure cannot become an all-green report.

Each finding must include `finding_id`, category, affected corner/panel/row, `observation_or_inference`, source fact/evidence IDs, rule ID or classifier version, action, recommended next step, and uncertainty/review state. Retain negative/clean observations in full source details without forcing a prose finding for every clean field.

| Data | Page 1 | Page 2 | Full findings / optional appendix |
| --- | --- | --- | --- |
| Frozen vehicle, inspection, role, date, version | Shared header; no invented VIN/mileage verification | Small repeating identity | Full snapshot identity, scope, limitations, certification |
| Complete-only observations | R01–R25, highest action plus completeness | Six groups: Tires & Wheels; Body & Exterior; Interior & Controls; Engine & Fluids; Brakes/Suspension/Underbody; Road Test & Diagnostics | Every raw answer, note, finding, applicability/exception state, and source association |
| Tire identity, DOT, measured tread/pressure | Four named corner cards; exact entered measurement, compact converted value, target context | Explain condition/priorities; cite corners, avoid repeating every numeric value | All readings/locations/units, derivations, reference details, inspector confirmations and evidence references |
| Cracking/wear/tire/wheel damage | Per-field indicators and brief flag; urgent replacement visible | All distinct urgent actions and important review/service concerns | Every defect and photo; no page budget |
| Fitment | Verified reference/actual result and exception | Explain discrepancy and next step; no PPI fail claim | Original markings, reference provenance, alternate-fitment documentation |
| Body damage | Diagram markers and compact index | Significant body concerns and limitations | All panel observations, all damage records, stable source IDs and every uploaded photo |
| Dents & Tires overview | No Complete mechanical rows | Six groups matching the rendered template: Tires; Wheels; Body; Fitment; Unavailable measurements; Scope | Same exhaustive evidence rule, bumper scope exclusion explicit |
| Accuracy certification | Actor, role, timestamp and concise certification reference | No synthetic signature | Exact text/version and certified inspection version; internal hashes may stay out of customer copy |

Overview structure is observation → significance → next step. State unverified causes as possibilities. No visible “AI analysis”/“AI-generated” title, no dollar estimates, and no whole-vehicle pass/fail declaration. Warranty conclusions cannot be inferred from red/green report marks.

Layout must measure text before writing the PDF. Consolidate repeated concerns, cap ordinary summaries, and route exhaustive detail to the digital report/appendix. Retain every distinct urgent action and a clear limitation reference in the main two pages. If even safely grouped urgent actions cannot fit the defined legible budget, put the report into review-required state and do not publish a clipped or misleading “successful” two-page artifact. The optional appendix is not permission to hide urgency from the main report.

## 9. Photo evidence appendix contract

The appendix is a **separate unlimited-length PDF** for the same frozen inspection version. Selecting it must not change page count/content correctness of the main report. Do not append evidence pages to the existing main PDF, and do not impose the reasoning model's 16-photo limit on appendix rendering.

Include:

1. Vehicle/inspection identity, scope/version/date, inspector identity, certification reference, and the total uploaded-photo and finding counts.
2. The complete accepted findings list, including informational/monitor/service/urgent findings, unresolved concerns, observation exceptions, and source answer/section notes. Clearly distinguish a reported observation from an inference or unverified candidate.
3. All panel and wheel/tire readings, including optional multiple tread readings, original units, reference/actual fitment, unmeasured states, and relevant non-sensitive source IDs.
4. **Every uploaded inspection photo in the frozen manifest**, ordered by scope section, physical corner/panel, then capture/upload order with a deterministic tie-breaker. A photo linked to several facts can be rendered once with multiple references. Do not deduplicate distinct uploaded media rows merely because they look similar; list every media ID, even if a content-identical image is presented once with an explicit duplicate reference.
5. Readable captions containing evidence ID, corner/panel/section, original inspector caption where present, linked finding/answer IDs, and whether image analysis completed. “Not analyzed” means that; it does not mean clean or omitted from the evidence PDF.

Download original authorized bytes server-side, normalize orientation and supported image decoding for the renderer, and preserve originals privately. Never expand authorization to retrieve a photo from a different inspection. A missing/corrupt/deleted media object gets an explicit labeled placeholder and an appendix completeness warning; it must not silently disappear or claim to be a full photo export. The artifact must not be marked complete while a required uploaded photo is still pending retrieval/rendering; distinguish partial/unavailable evidence delivery from successful completion.

Preserve access controls of the main report and photo storage. Do not expose evidence through the public marketplace's redacted inspection projection. Private storage URLs/tokens are not printed as permanent appendix links. Non-photo uploads, such as a diagnostic PDF, appear in an attachment inventory with authorized detail references; this requirement to include all uploaded **photos** does not imply silently rasterizing every arbitrary attachment.

Proposed internal artifact type `inspection_evidence_appendix_pdf` must be additive to the existing four report/coverage artifact types; require explicit compatibility/version handling before exposing it to partner integrations. If the current partner contract cannot accept extra manifest types, serve it through a separately versioned optional deliverable endpoint. Do not add the optional appendix to the four required artifacts or delay their readiness; an appendix failure is reported separately to its requester. Generate from the same snapshot/hash, store immutable bytes/checksum, and cache/retry independently from the main PDF. Enabling the option after the main report exists generates the appendix without mutating the main artifact.

## 10. Warranty isolation and historical compatibility

`src/features/warranty/dents-tires-coverage.ts` currently uses exact prompts. Its tire eligibility rule is tread `<=2/32`; missing/invalid tread is excluded under that existing policy. Its wheels/body checks use confirmed reported damage; bumpers are always excluded. Preserve that policy unless separately authorized to change it.

- Historical submissions keep the legacy evaluator and integer validation semantics. The optional old combined rim/tire note may have historical classification quirks; this redesign must not silently rerun old coverage with newly separated damage meanings.
- V2 tires pass confirmed normalized tread to a semantic adapter with an exact converted threshold. Self-inspector unavailable does not become zero tread or qualify for coverage. Supply an explicit missing-measurement reason to the existing determination vocabulary.
- New puncture/foreign-object **replacement recommendations do not automatically grant warranty coverage**. Do not retrofit the report's new hazard rules into coverage logic. Evaluate condition and coverage as separate outputs from the same facts.
- V2 wheel defects feed the existing Wheels / Rims class; precise body panels map to the six existing groups. Left/right door subdivisions remain aggregated for coverage. Bumper remains excluded, including a Complete bumper finding if passed into a separate coverage workflow that excludes it.
- Any richer fact that cannot map without changing the contractual meaning needs an explicit adapter decision and regression fixture; do not resolve it by allowing a model to invent eligibility. Preserve Complete's separate coverage stage and its existing product behavior.
- New schemas are additive for existing web/Swift/partner clients. A renderer adapter can display a historical report with “Not recorded” for new fields; do not require old completed inspections to provide newly mandatory measurements. Existing drafts/revisions need a deliberate catalog upgrade path, with a before/after review, preserved original rows/media, and fresh certification after upgrade.

## 11. Required implementation changes and verification

The source names below are review targets, not claims that they have been edited by this planning deliverable.

| Surface | Required change |
| --- | --- |
| `src/features/ppi/constants.ts`, `workflow-order.ts` | Versioned semantic catalog, shared grouped wheel/body capture, per-role required policy, photo evidence roles, exact legacy prompt adapters. Keep 25 report rows separate from question count. |
| `src/features/ppi/answer-validation.ts` | Replace prompt-special-case tread logic for v2 with unit-aware schema, decimal thresholds, explicit states, corner integrity, and consistent rule errors. Keep legacy adapter for old catalogs. |
| `src/features/ppi/actions.ts` | Versioned seeding/save validation, strict answer/evidence membership, submitted snapshot, final server validation, and revision behavior. Preserve original row IDs and source prompts during migration. |
| Web `inspection-workflow-view.tsx`, `answer-input.tsx`, `hooks.ts` | Wheel cards, placard capture, explicit unavailable reasons, candidate confirmation, defect branches, original units, required readings, queued-upload state, final review/certification, and appendix option. |
| iOS `InspectionWorkflowModel.swift`, `InspectionWorkflowView.swift`, `AnswerEditor.swift`, `PpiAPI.swift`, `Domain.swift` | Decode shared schema/version, new structured fields and media associations, role policy, exact original measurements, offline revision/confirmation state, review/certification, and nonempty validated submit payload. Explicit update-required compatibility gate for new catalogs if old clients cannot render them. |
| Submission/answer/media API routes | Validate typed keys and authenticated ownership on save; submit accepts certification and expected revision/hash. General PATCH cannot transition directly into submitted/completed or mutate finalized facts. |
| New forward SQL migration | Add semantic/versioned storage and evidence associations; validate permitted exceptions/units/readings at the guarded transaction boundary, require authentic current certification, freeze submitted facts, restrict status/answer/media mutation across every role/path. Do not edit historical migrations. |
| `submit_ppi_atomic` and RLS/grants | Existing SQL repeats tread validation by exact prompt. Replace through a new versioned guarded operation; do not merely change TypeScript labels. Audit direct UPDATE grants/RLS and generic PATCH so they cannot bypass certification or mutate its snapshot. Server owns final timestamp. |
| Output pipeline, extraction, assessment | Use immutable submitted snapshot, per-photo extraction/cache states and ID provenance, deterministic rules before bounded Jev categorization, reviewed findings, bounded overview, fixed two-page PDF, independent optional evidence export. |
| `standardized-report-pdf.ts`, output download/fallback routes | Scope-specific fixed templates, legible geometric budgets, status text+symbols, versioned adapter for old reports; same authorized artifact bytes across customer/admin/partner paths. |
| `dents-tires-coverage.ts`, Complete coverage consumer | Typed compatibility adapter with unchanged eligibility policy; no report-severity shortcut into warranty. |
| Marketplace projection | Keep redacted allowlist and existing audience restrictions; new facts/evidence/certification identity do not become public automatically. |

Validation belongs in UI for usability, API for ownership/schema errors, and database/transaction boundary for enforced invariants. Generate or share machine-readable constraints between TypeScript and Swift where feasible; database validation must match authoritative server rules. A checkbox alone does not establish certification if direct API/SQL writes remain possible. Old mobile offline writes must fail clearly on stale revisions instead of overwriting newly certified evidence.

Minimum meaningful acceptance fixtures:

- Both scopes, all four canonical corners; normal, all unavailable self-inspector, and dense-defect cases. Every main PDF has exactly two pages, no clipped content, legible print/grayscale statuses, and no invented outside-scope checks.
- Technician missing tread or pressure blocked at UI/API/transaction boundary; self-inspector reason accepted and visible; missing/unknown never green. Optional brake/battery omitted without fabricated results.
- Tread `2/32`, `1.5875 mm`, immediately below/above each boundary, original decimal precision, mixed units across corners, three-point minimum selection, zero versus missing, leading-zero DOT, invalid/future/ambiguous date handling.
- Confirmed puncture with pressure retained, puncture with loss, foreign object with no measurement, plus each independently confirmed bulge/cords/missing-rubber/severe-cracking trigger. Every applicable corner retains urgent replacement. Model-only suspicions remain explicitly uncertain review flags.
- Complete's legacy uneven-wear yes and “worst tire” photo do not become four per-corner measurements/confirmations. Historical D&T blank notes remain Not recorded. Old combined locks/windows remains a combined observation.
- Correct front/rear staggered reference, documented alternative, unreadable placard, actual mismatch, warm pressure versus cold target, no pressure-loss test. Fitment differences never create a PPI fail or automatic warranty grant.
- Mixed groups: urgent + unknown stays urgent and partial; clean + uninspected stays partial; real NA does not appear as a passed test. Raw yes/no polarity and all exact option/exception mappings above are covered.
- Main report with appendix false, then option enabled after generation; main bytes/version unchanged, separate unlimited appendix contains all findings and every media manifest entry including photos never analyzed by the model. Missing-photo placeholder is explicit and delivery completeness is truthful.
- Authenticated ownership, stale revision/offline writes, finalized-answer mutation, direct status updates and submit-RPC bypass attempts; certification is required and bound to immutable facts on all paths. No public marketplace photo/identity leak.
- Legacy warranty fixtures remain unchanged; v2 normalized tread adapter respects exact threshold; puncture replacement does not silently become coverage. Partner consumers retain the current four-artifact contract unless an explicit additive version is used.

This file intentionally specifies a reviewable implementation contract; app implementation, migration execution, and live report generation remain separate work from creating the report templates and developer handoff.
