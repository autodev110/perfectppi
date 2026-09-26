import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatTread,
  normalizeDecimalInput,
  parseDotCode,
  treadAtOrBelowReplacementThreshold,
  treadToMillimetres,
  pressureToKpa,
} from "../../src/features/ppi/inspection-units.ts";
import {
  requirementError,
  structuredPhotoRequired,
  validateObservation,
} from "../../src/features/ppi/inspection-schema.ts";
import {
  catalogQuestions,
  LEGACY_PROMPT_KEYS,
  stepGroupForKey,
} from "../../src/features/ppi/inspection-catalog.ts";
import { SECTION_QUESTION_TEMPLATES, getSectionOrder } from "../../src/features/ppi/constants.ts";
import { evaluateInspection } from "../../src/features/ppi/inspection-rules.ts";
import {
  applyOverviewText,
  buildInspectionReport,
  composePriorityActions,
} from "../../src/features/ppi/inspection-report.ts";
import {
  COMPLETE_CLEAN_ANSWERS,
  INSPECTION_DATE,
  PLACARD,
  buildFacts,
  cleanCorner,
  cleanObservations,
  observed,
  unavailable,
  v2Sections,
} from "./inspection-v2-fixtures.mts";

const inspectionDate = new Date(INSPECTION_DATE);

describe("tread units and thresholds", () => {
  test("2/32 in and exactly 1.5875 mm are at the replacement threshold", () => {
    assert.equal(treadAtOrBelowReplacementThreshold("2", "thirty_seconds_inch"), true);
    assert.equal(treadAtOrBelowReplacementThreshold("2.0", "thirty_seconds_inch"), true);
    assert.equal(treadAtOrBelowReplacementThreshold("1.5875", "mm"), true);
    assert.equal(treadAtOrBelowReplacementThreshold("0", "mm"), true);
  });

  test("readings just above the threshold are compared before display rounding", () => {
    assert.equal(treadAtOrBelowReplacementThreshold("1.5876", "mm"), false);
    // 1.59 mm prints as "1.6 mm" but is still above 1.5875 mm.
    assert.equal(treadAtOrBelowReplacementThreshold("1.59", "mm"), false);
    assert.equal(treadAtOrBelowReplacementThreshold("2.01", "thirty_seconds_inch"), false);
    assert.equal(treadAtOrBelowReplacementThreshold("3", "thirty_seconds_inch"), false);
  });

  test("conversions are exact and preserve entered precision", () => {
    assert.equal(treadToMillimetres("5", "thirty_seconds_inch"), "3.96875");
    assert.equal(treadToMillimetres("2", "thirty_seconds_inch"), "1.5875");
    assert.equal(formatTread("5", "thirty_seconds_inch"), "5/32 in | 4.0 mm");
    assert.equal(formatTread("4.50", "mm"), "4.50 mm | 5.7/32 in");
    assert.equal(pressureToKpa("34", "psi"), "234.421748");
  });

  test("decimal input normalizes a comma separator and rejects signs and exponents", () => {
    assert.equal(normalizeDecimalInput("4,5"), "4.5");
    assert.equal(normalizeDecimalInput(" 05 "), "5");
    assert.equal(normalizeDecimalInput("0"), "0");
    assert.equal(normalizeDecimalInput("-1"), null);
    assert.equal(normalizeDecimalInput("1e3"), null);
    assert.equal(normalizeDecimalInput("NaN"), null);
  });
});

describe("DOT date codes", () => {
  test("leading-zero week/year codes resolve against the inspection date", () => {
    const result = parseDotCode("0224", inspectionDate);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.week, 2);
      assert.equal(result.year, 2024);
      assert.equal(result.ageYears, 2);
    }
  });

  test("invalid weeks and future production weeks are rejected", () => {
    assert.deepEqual(parseDotCode("0024", inspectionDate), { ok: false, error: "week" });
    assert.deepEqual(parseDotCode("5424", inspectionDate), { ok: false, error: "week" });
    assert.deepEqual(parseDotCode("5226", inspectionDate), { ok: false, error: "future" });
    assert.deepEqual(parseDotCode("224", inspectionDate), { ok: false, error: "format" });
  });

  test("week 53 is accepted but flagged for verification", () => {
    const result = parseDotCode("5320", inspectionDate);
    assert.equal(result.ok && result.needsVerification, true);
  });
});

describe("observation validation and role requirements", () => {
  test("technicians must measure tread and pressure; self-inspectors may give a reason", () => {
    const missing = validateObservation("tires.rear_left.tread", unavailable("no_gauge"));
    assert.equal(missing.ok, true);
    if (!missing.ok) return;
    assert.match(
      requirementError("tires.rear_left.tread", missing.observation, { required: true, performerMode: "technician" }) ?? "",
      /Technicians must enter a measured tread depth/,
    );
    assert.equal(requirementError("tires.rear_left.tread", missing.observation, { required: true, performerMode: "self" }), null);
    assert.match(
      requirementError("tires.rear_left.pressure", missing.observation, { required: true, performerMode: "technician" }) ?? "",
      /measured tire pressure/,
    );
  });

  test("a blank required observation is never complete", () => {
    assert.ok(requirementError("tires.front_left.tread", null, { required: true, performerMode: "self" }));
  });

  test("not applicable is refused for an existing tire's measurements", () => {
    const result = validateObservation("tires.front_left.tread", {
      v: 1,
      state: "not_applicable",
      reason: { code: "not_equipped" },
    });
    assert.equal(result.ok, false);
    const missingTool = validateObservation("body.left_rear_door.condition", {
      v: 1,
      state: "not_applicable",
      reason: { code: "no_gauge" },
    });
    assert.equal(missingTool.ok, false, "missing tools never justify not applicable");
  });

  test("zero tread is a valid measurement, not a missing value", () => {
    const result = validateObservation("tires.front_left.tread", observed({ reading: "0", unit: "mm", method: "tread_depth_gauge" }));
    assert.equal(result.ok, true);
  });

  test("readings outside the capture range are rejected instead of clipped", () => {
    assert.equal(validateObservation("tires.front_left.tread", observed({ reading: "33", unit: "thirty_seconds_inch", method: "tread_depth_gauge" })).ok, false);
    assert.equal(validateObservation("tires.front_left.tread", observed({ reading: "25.5", unit: "mm", method: "tread_depth_gauge" })).ok, false);
    assert.equal(validateObservation("tires.front_left.tread", observed({ reading: "25.4", unit: "mm", method: "tread_depth_gauge" })).ok, true);
  });

  test("observed pressure retention results require a reading and positive elapsed interval", () => {
    const base = { reading: "34", unit: "psi", context: "cold", method: "pressure_gauge" };
    assert.equal(validateObservation("tires.front_left.pressure", observed({ ...base, pressure_loss: "observed" })).ok, false);
    assert.equal(validateObservation("tires.front_left.pressure", observed({
      ...base,
      pressure_loss: "not_observed_during_test",
      recheck: { reading: "34", minutes_elapsed: "0" },
    })).ok, false);
    assert.equal(validateObservation("tires.front_left.pressure", observed({
      ...base,
      pressure_loss: "not_observed_during_test",
      recheck: { reading: "34", minutes_elapsed: "15" },
    })).ok, true);
    assert.equal(validateObservation("tires.front_left.pressure", observed({ ...base, pressure_loss: "reported" })).ok, true);
  });

  test("none observed is exclusive with defect entries", () => {
    assert.equal(validateObservation("tires.front_left.damage", observed({ none_observed: true, defects: [{ id: "abcd1", type: "cut" }] })).ok, true, "extra keys are stripped by the exclusive branch");
    const parsed = validateObservation("tires.front_left.damage", observed({ none_observed: true, defects: [{ id: "abcd1", type: "cut" }] }));
    assert.ok(parsed.ok && !("defects" in (parsed.observation.value ?? {})));
    assert.equal(validateObservation("tires.front_left.damage", observed({ defects: [] })).ok, false);
  });

  test("DOT codes must be four digits and not after the inspection", () => {
    assert.equal(validateObservation("tires.front_left.dot_date", observed({ code: "0224" }), { inspectionDate }).ok, true);
    assert.equal(validateObservation("tires.front_left.dot_date", observed({ code: "224" }), { inspectionDate }).ok, false);
    assert.equal(validateObservation("tires.front_left.dot_date", observed({ code: "5226" }), { inspectionDate }).ok, false);
  });

  test("load index and speed rating stay distinct", () => {
    assert.equal(validateObservation("tires.front_left.sidewall", observed({ size: "245/40ZR18", load_index: "97", speed_rating: "Y" })).ok, true);
    assert.equal(validateObservation("tires.front_left.sidewall", observed({ size: "245/40ZR18", load_index: "Y", speed_rating: "97" })).ok, false);
  });

  test("photo evidence is expected for readings and declared damage, with an explicit exception path", () => {
    const tread = validateObservation("tires.front_left.tread", observed({ reading: "5", unit: "thirty_seconds_inch", method: "tread_depth_gauge" }));
    assert.ok(tread.ok && structuredPhotoRequired("tires.front_left.tread", tread.observation));
    const pressure = validateObservation("tires.front_left.pressure", observed({ reading: "34", unit: "psi", context: "cold", method: "pressure_gauge" }));
    assert.ok(pressure.ok && !structuredPhotoRequired("tires.front_left.pressure", pressure.observation));
    const damage = validateObservation("tires.front_left.damage", {
      ...observed({ defects: [{ id: "abcd1", type: "puncture", location: "tread", certainty: "confirmed" }] }),
      evidence_exception: { code: "inaccessible" },
    });
    assert.ok(damage.ok && !structuredPhotoRequired("tires.front_left.damage", damage.observation));
  });

  test("damage confirmation and extent are explicit, never defaulted", () => {
    const unconfirmed = validateObservation("tires.front_left.damage", observed({ defects: [{ id: "abcd1", type: "puncture", location: "tread" }] }));
    assert.equal(unconfirmed.ok, false);
    assert.equal(validateObservation("wheels.front_left.damage", observed({ defects: [{ id: "abcd2", type: "bent" }] })).ok, false);
    assert.equal(validateObservation("body.hood.condition", observed({ condition: "damage_present", defects: [{ id: "abcd3", type: "dent" }] })).ok, false);
    assert.equal(validateObservation("body.hood.condition", observed({ condition: "damage_present", defects: [{ id: "abcd3", type: "dent", severity: "moderate" }] })).ok, true);
  });
});

describe("catalogs", () => {
  test("every original Complete and Dents & Tires prompt has a stable key", () => {
    let completeCount = 0;
    for (const section of getSectionOrder("complete")) {
      for (const template of SECTION_QUESTION_TEMPLATES[section]) {
        completeCount += 1;
        assert.ok(LEGACY_PROMPT_KEYS[section]?.[template.prompt], `${section}: ${template.prompt}`);
      }
    }
    assert.equal(completeCount, 67);
    let dentsCount = 0;
    for (const section of getSectionOrder("dents_tires")) {
      for (const template of SECTION_QUESTION_TEMPLATES[section]) {
        dentsCount += 1;
        assert.ok(LEGACY_PROMPT_KEYS[section]?.[template.prompt], `${section}: ${template.prompt}`);
      }
    }
    assert.equal(dentsCount, 11);
  });

  test("catalog 1 reproduces the original templates exactly", () => {
    for (const section of getSectionOrder("complete")) {
      assert.deepEqual(
        catalogQuestions("complete", section, 1).map((question) => question.prompt),
        SECTION_QUESTION_TEMPLATES[section].map((template) => template.prompt),
      );
    }
  });

  test("catalog 2 captures every corner in walk-around order and keeps bumpers out of Dents & Tires", () => {
    const wheels = catalogQuestions("dents_tires", "wheels_tires", 2).map((question) => question.questionKey);
    assert.equal(wheels[0], "tires.placard");
    assert.deepEqual(wheels.slice(0, 9), [
      "tires.placard",
      "tires.front_left.sidewall",
      "tires.front_left.dot_date",
      "tires.rear_left.sidewall",
      "tires.rear_left.dot_date",
      "tires.rear_right.sidewall",
      "tires.rear_right.dot_date",
      "tires.front_right.sidewall",
      "tires.front_right.dot_date",
    ]);
    const treadOrder = wheels.filter((key) => key.endsWith(".tread"));
    assert.deepEqual(treadOrder, ["tires.front_left.tread", "tires.rear_left.tread", "tires.rear_right.tread", "tires.front_right.tread"]);
    const body = catalogQuestions("dents_tires", "body_damage", 2).map((question) => question.questionKey);
    assert.ok(!body.includes("body.front_bumper.condition"));
    assert.ok(catalogQuestions("complete", "exterior", 2).some((question) => question.questionKey === "body.front_bumper.condition"));
    const keys = new Set<string>();
    for (const scope of ["complete", "dents_tires"] as const) {
      for (const section of getSectionOrder(scope)) {
        for (const question of catalogQuestions(scope, section, 2)) {
          assert.ok(!keys.has(`${scope}:${question.questionKey}`), `duplicate key ${question.questionKey}`);
          keys.add(`${scope}:${question.questionKey}`);
        }
      }
    }
  });

  test("wheel rows group into one card per corner", () => {
    assert.equal(stepGroupForKey("tires.front_left.tread")?.id, "wheel:front_left");
    assert.equal(stepGroupForKey("wheels.front_left.damage")?.id, "wheel:front_left");
    assert.equal(stepGroupForKey("body.left_front_door.condition")?.id, "body:left");
    assert.equal(stepGroupForKey("tires.placard")?.id, "tires:photos");
  });
});

function assess(scope: "complete" | "dents_tires", observations: Record<string, unknown>, options: { mode?: "technician" | "self"; answers?: Record<string, string> } = {}) {
  const facts = buildFacts(scope, v2Sections(scope, observations, options.answers ?? (scope === "complete" ? COMPLETE_CLEAN_ANSWERS : {})), { mode: options.mode });
  return { facts, assessment: evaluateInspection(facts, { inspectionDate }) };
}

describe("deterministic tire rules", () => {
  test("a clean inspection has no findings and every tire is checked", () => {
    const { assessment } = assess("dents_tires", cleanObservations("dents_tires"));
    assert.deepEqual(assessment.findings, []);
    for (const card of Object.values(assessment.tires)) assert.equal(card.status, "checked");
  });

  test("a confirmed puncture requires replacement even when the tire holds pressure", () => {
    for (const loss of ["not_observed_during_test", "observed", "not_tested"] as const) {
      const { assessment } = assess("dents_tires", {
        ...cleanObservations("dents_tires"),
        "tires.front_left.damage": observed({ defects: [{ id: "abcd1", type: "puncture", location: "tread" }] }),
        "tires.front_left.pressure": observed({ reading: "34", unit: "psi", context: "cold", method: "pressure_gauge", pressure_loss: loss }),
      });
      const finding = assessment.findings.find((candidate) => candidate.rule_id === "DAMAGE-001");
      assert.ok(finding, `puncture finding with pressure_loss=${loss}`);
      assert.equal(finding.action, "urgent");
      assert.match(finding.significance, /Replacement required under PerfectPPI's puncture\/foreign-object policy/);
      assert.equal(assessment.tires.front_left.status, "urgent");
      assert.doesNotMatch(`${finding.observation} ${finding.next_step}`, /patch/i);
    }
  });

  test("an embedded object with no pressure measurement is still an urgent replacement", () => {
    const { assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.rear_right.damage": observed({ defects: [{ id: "abcd2", type: "foreign_object", location: "shoulder" }] }),
      "tires.rear_right.pressure": unavailable("no_gauge"),
    }, { mode: "self" });
    const finding = assessment.findings.find((candidate) => candidate.rule_id === "DAMAGE-001");
    assert.equal(finding?.action, "urgent");
    assert.equal(assessment.tires.rear_right.partial, true);
  });

  test("a suspected object stays a suspected review flag", () => {
    const { assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.front_right.damage": observed({ defects: [{ id: "abcd3", type: "foreign_object", certainty: "suspected" }] }),
    });
    const finding = assessment.findings.find((candidate) => candidate.rule_id === "DAMAGE-006");
    assert.equal(finding?.certainty, "suspected");
    assert.equal(finding?.review_state, "needs_review");
    assert.equal(assessment.findings.some((candidate) => candidate.rule_id === "DAMAGE-001"), false);
  });

  test("bulge, exposed cords, missing rubber and severe cracking each require replacement", () => {
    for (const [key, value, rule] of [
      ["tires.front_left.damage", observed({ defects: [{ id: "abcd4", type: "bulge", location: "sidewall" }] }), "DAMAGE-002"],
      ["tires.front_left.damage", observed({ defects: [{ id: "abcd5", type: "exposed_cords" }] }), "DAMAGE-003"],
      ["tires.front_left.damage", observed({ defects: [{ id: "abcd6", type: "missing_rubber" }] }), "DAMAGE-004"],
      ["tires.front_left.cracking", observed({ level: "severe" }), "CRACK-003"],
    ] as const) {
      const { assessment } = assess("dents_tires", { ...cleanObservations("dents_tires"), [key]: value });
      const finding = assessment.findings.find((candidate) => candidate.rule_id === rule);
      assert.equal(finding?.action, "urgent", rule);
    }
  });

  test("a cosmetic wheel scuff is a wheel monitor item, never tire damage", () => {
    const { assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "wheels.front_left.damage": observed({ defects: [{ id: "abcd7", type: "scratch_curb_rash" }] }),
    });
    assert.equal(assessment.findings.length, 1);
    assert.equal(assessment.findings[0].rule_id, "WHEEL-001");
    assert.equal(assessment.findings[0].category, "wheels");
    assert.equal(assessment.findings[0].action, "monitor");
  });

  test("tread at exactly 2/32 is urgent; 1.59 mm is not", () => {
    const worn = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.rear_left.tread": observed({ reading: "2", unit: "thirty_seconds_inch", method: "tread_depth_gauge" }),
    });
    assert.equal(worn.assessment.findings[0]?.rule_id, "TREAD-001");
    const nearly = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.rear_left.tread": observed({ reading: "1.59", unit: "mm", method: "tread_depth_gauge" }),
    });
    assert.equal(nearly.assessment.findings.some((finding) => finding.rule_id === "TREAD-001"), false);
  });

  test("the lowest of three tread positions drives the rule", () => {
    const { assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.rear_left.tread": observed({ reading: "4", unit: "thirty_seconds_inch", method: "tread_depth_gauge", positions: { inner: "2", center: "4", outer: "5" } }),
    });
    assert.equal(assessment.findings[0]?.rule_id, "TREAD-001");
  });

  test("fitment compares each axle with its own reference and never fails the inspection", () => {
    const staggered = observed({
      front: { size: "225/50R17", pressure: "34", unit: "psi" },
      rear: { size: "245/45R17", pressure: "36", unit: "psi" },
    });
    const { assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.placard": staggered,
      ...cleanCorner("rear_left", { "tires.rear_left.sidewall": observed({ size: "245/45R17" }), "tires.rear_left.pressure": observed({ reading: "36", unit: "psi", context: "cold", method: "pressure_gauge" }) }),
      ...cleanCorner("rear_right", { "tires.rear_right.pressure": observed({ reading: "36", unit: "psi", context: "cold", method: "pressure_gauge" }) }),
    });
    assert.equal(assessment.tires.rear_left.fitment.state, "match");
    assert.equal(assessment.tires.rear_right.fitment.state, "differs_from_reference");
    const fitment = assessment.findings.filter((finding) => finding.rule_id === "FITMENT-001");
    assert.equal(fitment.length, 1);
    assert.equal(fitment[0].action, "service_recommended");
    assert.match(fitment[0].significance, /does not fail the inspection/);
  });

  test("an unreadable placard means fitment is unknown, not a mismatch", () => {
    const { assessment } = assess("dents_tires", { ...cleanObservations("dents_tires"), "tires.placard": unavailable("unreadable") });
    assert.equal(assessment.tires.front_left.fitment.state, "unknown");
    assert.equal(assessment.findings.some((finding) => finding.rule_id?.startsWith("FITMENT")), false);
  });

  test("a documented approved alternative is not a mismatch", () => {
    const { assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.placard": observed({ front: { size: "225/45R18", pressure: "34", unit: "psi" }, rear: { size: "225/45R18", pressure: "34", unit: "psi" }, documented_alternative: "Owner's manual lists 225/50R17 as an approved alternative." }),
    });
    assert.equal(assessment.tires.front_left.fitment.state, "documented_alternative");
    assert.equal(assessment.findings.some((finding) => finding.rule_id === "FITMENT-001"), false);
  });

  test("a confirmed cold pressure that differs from the placard is a service recommendation", () => {
    const { assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.front_left.pressure": observed({ reading: "30", unit: "psi", context: "cold", method: "pressure_gauge" }),
    });
    const finding = assessment.findings.find((entry) => entry.rule_id === "PRESSURE-002");
    assert.equal(finding?.action, "service_recommended");
    assert.deepEqual(finding?.corners, ["front_left"]);
    assert.match(finding?.observation ?? "", /Cold pressure 30 psi; placard \d+ psi\./);
  });

  test("warm pressure is disclosed, not corrected against the cold target", () => {
    const { assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.front_left.pressure": observed({ reading: "38", unit: "psi", context: "warm", method: "pressure_gauge" }),
    });
    assert.equal(assessment.findings.some((finding) => finding.rule_id === "PRESSURE-002"), false);
    assert.match(assessment.tires.front_left.pressure, /warm/);
  });

  test("unavailable self-inspection measurements are never green", () => {
    const { assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.rear_left.tread": unavailable("no_gauge"),
      "tires.rear_left.pressure": unavailable("no_gauge"),
    }, { mode: "self" });
    assert.notEqual(assessment.tires.rear_left.status, "checked");
    assert.equal(assessment.tires.rear_left.partial, true);
    assert.equal(assessment.tires.rear_left.tread, "Unavailable");
    assert.ok(assessment.limitations.some((limitation) => /Rear-left tread was not measured/.test(limitation.text)));
  });

  test("a recent date code with severe cracking asks for confirmation without softening the crack rule", () => {
    const { assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.front_left.cracking": observed({ level: "severe" }),
    });
    assert.ok(assessment.findings.some((finding) => finding.rule_id === "AGE-001" && finding.review_state === "needs_review"));
    assert.equal(assessment.findings.find((finding) => finding.rule_id === "CRACK-003")?.action, "urgent");
  });
});

describe("Complete checklist rows", () => {
  test("a clean Complete inspection checks all 25 rows", () => {
    const { assessment } = assess("complete", cleanObservations("complete"));
    assert.equal(assessment.checklist.length, 25);
    const notChecked = assessment.checklist.filter((row) => row.status !== "checked" && row.row_id !== "R15");
    assert.deepEqual(notChecked.map((row) => `${row.row_id}:${row.status}`), []);
    // No scan attached: diagnostics cannot be "no faults".
    assert.equal(assessment.checklist.find((row) => row.row_id === "R15")?.status, "not_inspected");
  });

  test("urgent plus unknown stays urgent and partial", () => {
    const { assessment } = assess("complete", cleanObservations("complete"), {
      answers: { ...COMPLETE_CLEAN_ANSWERS, "fluids.engine_oil_condition": "Milky (coolant contamination)", "fluids.coolant_level": "Not checkable" },
    });
    const row = assessment.checklist.find((candidate) => candidate.row_id === "R20");
    assert.equal(row?.status, "urgent");
    assert.equal(row?.inspection_completeness, "partial");
  });

  test("a clean row with an unchecked item is never shown as checked", () => {
    const { assessment } = assess("complete", cleanObservations("complete"), {
      answers: { ...COMPLETE_CLEAN_ANSWERS, "engine_bay.drive_belt_condition": "Not visible" },
    });
    const row = assessment.checklist.find((candidate) => candidate.row_id === "R18");
    assert.equal(row?.status, "unknown");
  });

  test("electric steering is not applicable, not a passed test", () => {
    const { assessment } = assess("complete", cleanObservations("complete"));
    const fluids = assessment.checklist.find((row) => row.row_id === "R20");
    assert.equal(fluids?.status, "checked");
    assert.equal(fluids?.inspection_completeness, "complete");
  });

  test("yes/no polarity follows the question meaning", () => {
    const { assessment } = assess("complete", cleanObservations("complete"), {
      answers: { ...COMPLETE_CLEAN_ANSWERS, "electrical.heater_operation": "no", "engine_bay.visible_fluid_leak": "yes" },
    });
    assert.equal(assessment.checklist.find((row) => row.row_id === "R09")?.status, "service");
    assert.equal(assessment.checklist.find((row) => row.row_id === "R16")?.status, "service");
  });

  test("body panel damage rolls into the paint/panels row and the body map", () => {
    const { assessment } = assess("complete", {
      ...cleanObservations("complete"),
      "body.left_front_fender.condition": observed({ condition: "damage_present", defects: [{ id: "abcd8", type: "dent", severity: "minor", marker: { x: 0.2, y: 0.25 } }] }),
    });
    const row = assessment.checklist.find((candidate) => candidate.row_id === "R02");
    assert.equal(row?.status, "monitor");
    const body = assessment.findings.find((finding) => finding.rule_id === "BODY-001");
    assert.equal(body?.ref, "B1");
    assert.deepEqual(body?.marker, { x: 0.2, y: 0.25 });
  });
});

describe("historical catalog adapter", () => {
  test("old Dents & Tires answers keep exact tread and mark new fields not recorded", () => {
    const sections = getSectionOrder("dents_tires").map((sectionType) => ({
      section_type: sectionType,
      notes: null,
      media: [],
      answers: SECTION_QUESTION_TEMPLATES[sectionType].map((template, index) => ({
        id: `${sectionType}-${index}`,
        prompt: template.prompt,
        answer_type: template.answerType,
        answer_value: template.answerType === "number" ? "5" : "",
        is_required: template.isRequired,
      })),
    }));
    const facts = buildFacts("dents_tires", sections, { catalogVersion: 1 });
    assert.equal(facts.tires.front_left.tread.value?.reading, "5");
    assert.equal(facts.tires.front_left.pressure.observation_state, "not_recorded");
    assert.equal(facts.body.hood.observation_state, "not_recorded", "blank historical text is not 'no damage'");
    const assessment = evaluateInspection(facts, { inspectionDate });
    assert.equal(assessment.tires.front_left.status, "not_inspected");
    assert.equal(assessment.findings.length, 0);
  });

  test("the old whole-car uneven-wear answer never becomes per-corner wear", () => {
    const sections = getSectionOrder("complete").map((sectionType) => ({
      section_type: sectionType,
      notes: null,
      media: [],
      answers: SECTION_QUESTION_TEMPLATES[sectionType].map((template, index) => ({
        id: `${sectionType}-${index}`,
        prompt: template.prompt,
        answer_type: template.answerType,
        answer_value: template.prompt === "Is there any uneven tire wear?" ? "yes" : null,
        is_required: template.isRequired,
      })),
    }));
    const facts = buildFacts("complete", sections, { catalogVersion: 1 });
    for (const corner of ["front_left", "front_right", "rear_left", "rear_right"] as const) {
      assert.equal(facts.tires[corner].wear.observation_state, "not_recorded");
    }
    assert.equal(facts.checks["tires.legacy_uneven_wear"]?.value?.answer, "yes");
  });
});

describe("priority actions and overview", () => {
  test("every urgent tire replacement and corner is named in one grouped sentence", () => {
    const { facts, assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.front_left.damage": observed({ defects: [{ id: "abcd1", type: "foreign_object" }] }),
      "tires.rear_right.cracking": observed({ level: "severe" }),
      "tires.rear_left.tread": observed({ reading: "1", unit: "thirty_seconds_inch", method: "tread_depth_gauge" }),
    });
    const text = composePriorityActions(assessment.findings);
    assert.match(text, /front-left/);
    assert.match(text, /rear-left/);
    assert.match(text, /rear-right/);
    assert.match(text, /PerfectPPI's policy/);
    const report = buildInspectionReport({ facts, assessment, factsHash: null, generatedAt: INSPECTION_DATE });
    assert.equal(report.overview.length, 6);
    assert.deepEqual(report.overview.map((block) => block.title), ["TIRES", "WHEELS", "BODY DAMAGE", "FITMENT", "UNAVAILABLE MEASUREMENTS", "INSPECTION SCOPE"]);
    assert.equal(report.overview[0].status, "urgent");
  });

  test("model prose cannot drop an urgent reference, cite unknown findings, or mention AI or prices", () => {
    const { facts, assessment } = assess("dents_tires", {
      ...cleanObservations("dents_tires"),
      "tires.front_left.damage": observed({ defects: [{ id: "abcd1", type: "puncture" }] }),
    });
    const report = buildInspectionReport({ facts, assessment, factsHash: null, generatedAt: INSPECTION_DATE });
    const ref = assessment.findings[0].ref;
    const fits = () => true;
    const source = { model: "test-model", promptVersion: "p1" };
    const dropped = applyOverviewText(report, [{ category: "tires", observation: "Tires look fine overall.", next_step: "No action." }], source, fits);
    assert.equal(dropped.overview[0].text_source, "deterministic");
    const ai = applyOverviewText(report, [{ category: "tires", observation: `Our AI found a puncture [${ref}].`, next_step: "Replace it." }], source, fits);
    assert.equal(ai.overview[0].text_source, "deterministic");
    const price = applyOverviewText(report, [{ category: "tires", observation: `Puncture [${ref}].`, next_step: "Replace it for about $180." }], source, fits);
    assert.equal(price.overview[0].text_source, "deterministic");
    const invented = applyOverviewText(report, [{ category: "tires", observation: `Puncture [${ref}] and [T9].`, next_step: "Replace it." }], source, fits);
    assert.equal(invented.overview[0].text_source, "deterministic");
    const good = applyOverviewText(report, [{ category: "tires", observation: `A puncture was confirmed in the front-left tread [${ref}].`, next_step: "Replace the front-left tire." }], source, fits);
    assert.equal(good.overview[0].text_source, "test-model");
  });
});

void PLACARD;
