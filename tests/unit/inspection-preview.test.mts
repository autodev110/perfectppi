import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectionPreview } from "../../src/features/ppi/inspection-preview.ts";
import type { FactsInput } from "../../src/features/ppi/inspection-facts.ts";
import { cleanObservations, observed, v2Sections } from "./inspection-v2-fixtures.mts";

test("mobile preview keeps report urgency, revision and scope without exposing media", () => {
  const input: FactsInput = {
    scope: "dents_tires", catalogVersion: 2, performerMode: "self", inspectorName: null,
    submission: { id: "draft", version: 1, submitted_at: null, revision: 42 },
    vehicle: { year: null, make: null, model: null, trim: null, vin: null, mileage: null, mileage_unit: "mi", body_class: null },
    certification: null,
    sections: v2Sections("dents_tires", { ...cleanObservations("dents_tires"),
      "tires.front_left.tread": observed({ reading: "1", unit: "thirty_seconds_inch", method: "tread_depth_gauge" }),
    }),
  };
  const result = inspectionPreview(input, new Date("2026-10-14"));
  assert.equal(result.revision, 42);
  assert.ok(result.findings.some((finding) => finding.action === "urgent" && /tread/i.test(finding.title)));
  assert.ok(result.findings.every((finding) => !/engine|transmission/i.test(finding.title)));
  assert.ok(result.findings.every((finding) => Object.keys(finding).sort().join() === "action,id,nextStep,title"));
  assert.deepEqual(inspectionPreview({ ...input, catalogVersion: 1 }).findings, []);
});
