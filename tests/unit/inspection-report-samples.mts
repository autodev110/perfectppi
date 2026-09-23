import { evaluateInspection } from "../../src/features/ppi/inspection-rules.ts";
import { buildInspectionReport } from "../../src/features/ppi/inspection-report.ts";
import { fitReportToLayout } from "../../src/lib/pdf/inspection-report/fit.ts";
import { buildReportViewModel } from "../../src/lib/pdf/inspection-report/view-model.ts";
import { loadLayoutAssets } from "../../src/lib/pdf/inspection-report/canvas.ts";
import {
  COMPLETE_CLEAN_ANSWERS,
  INSPECTION_DATE,
  buildFacts,
  cleanCorner,
  cleanObservations,
  observed,
  unavailable,
  v2Sections,
} from "./inspection-v2-fixtures.mts";

// Fictional sample inspections mirroring the handoff's filled examples.

export function completeSample() {
  const observations = {
    ...cleanObservations("complete"),
    "tires.front_left.damage": observed({ defects: [{ id: "t1-object", type: "foreign_object", location: "tread", note: "Screw head visible in the center tread." }] }),
    "tires.front_left.pressure": observed({ reading: "34", unit: "psi", context: "cold", method: "pressure_gauge", pressure_loss: "not_observed_during_test", recheck: { reading: "34", minutes_elapsed: "15" } }),
    "tires.front_left.tread": observed({ reading: "5", unit: "thirty_seconds_inch", method: "tread_depth_gauge" }),
    "wheels.front_left.damage": observed({ defects: [{ id: "w1-rash", type: "scratch_curb_rash" }] }),
    ...cleanCorner("rear_left", {
      "tires.rear_left.sidewall": observed({ size: "215/50R17", load_index: "98", speed_rating: "V" }),
      "tires.rear_left.dot_date": observed({ code: "0519" }),
      "tires.rear_left.tread": observed({ reading: "3", unit: "thirty_seconds_inch", method: "tread_depth_gauge" }),
      "tires.rear_left.cracking": observed({ level: "significant" }),
      "tires.rear_left.wear": observed({ level: "uneven_monitor", patterns: ["inner_edge"] }),
    }),
    "body.left_front_fender.condition": observed({ condition: "damage_present", defects: [{ id: "b1-dent", type: "dent", severity: "minor", note: "Shallow dent; finish intact." }] }),
    "body.right_front_door.condition": observed({ condition: "damage_present", defects: [{ id: "b2-scratch", type: "scratch", severity: "minor", note: "Surface scratch; no bare metal." }] }),
  };
  const answers = { ...COMPLETE_CLEAN_ANSWERS, "fluids.transmission_fluid_condition": "Not checkable" };
  const facts = buildFacts("complete", v2Sections("complete", observations, answers, {
    "tires.placard": 1,
    "tires.front_left.sidewall": 1, "tires.front_left.tread": 1, "tires.front_left.damage": 1, "wheels.front_left.damage": 1,
    "tires.front_right.sidewall": 1, "tires.front_right.tread": 1,
    "tires.rear_left.sidewall": 1, "tires.rear_left.tread": 1,
    "tires.rear_right.sidewall": 1, "tires.rear_right.tread": 1,
    "body.left_front_fender.condition": 1, "body.right_front_door.condition": 1,
  }));
  facts.certification = { certified_at: INSPECTION_DATE, text: "", text_version: "inspection_accuracy/1", facts_hash: "0".repeat(64) };
  return facts;
}

export function dentsSample() {
  const observations = {
    ...cleanObservations("dents_tires"),
    "tires.front_left.damage": observed({ defects: [{ id: "t1-object", type: "foreign_object", location: "tread" }] }),
    "wheels.front_left.damage": observed({ defects: [{ id: "w1-rash", type: "scratch_curb_rash" }] }),
    ...cleanCorner("rear_left", {
      "tires.rear_left.sidewall": observed({ size: "215/50R17", load_index: "98", speed_rating: "V" }),
      "tires.rear_left.dot_date": observed({ code: "0519" }),
      "tires.rear_left.tread": unavailable("no_gauge"),
      "tires.rear_left.pressure": unavailable("no_gauge"),
      "tires.rear_left.cracking": observed({ level: "significant" }),
      "tires.rear_left.wear": observed({ level: "uneven_monitor" }),
    }),
    "body.left_front_fender.condition": observed({ condition: "damage_present", defects: [{ id: "b1-dent", type: "dent", severity: "minor", note: "Shallow dent; finish intact." }] }),
    "body.right_front_door.condition": observed({ condition: "damage_present", defects: [{ id: "b2-scratch", type: "scratch", severity: "minor", note: "Surface scratch; no bare metal." }] }),
  };
  const facts = buildFacts("dents_tires", v2Sections("dents_tires", observations), { mode: "self" });
  facts.inspector.name = "Alex Morgan";
  facts.certification = { certified_at: INSPECTION_DATE, text: "", text_version: "inspection_accuracy/1", facts_hash: "0".repeat(64) };
  return facts;
}

export async function sampleViewModel(facts: ReturnType<typeof buildFacts>, outputVersion = 1) {
  const assessment = evaluateInspection(facts, { inspectionDate: new Date(INSPECTION_DATE) });
  const report = buildInspectionReport({ facts, assessment, factsHash: "0".repeat(64), generatedAt: INSPECTION_DATE });
  const fitted = await fitReportToLayout(report);
  const vm = buildReportViewModel(fitted.report, {
    submissionId: "5a3c9e10-0000-4000-8000-000000000001",
    outputVersion,
    sample: true,
    detailUrl: null,
    diagram: loadLayoutAssets().spec.diagram,
  });
  return { report: fitted.report, overflow: fitted.overflow, vm };
}
