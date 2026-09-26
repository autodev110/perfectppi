import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateObservation, type ObservationDocument } from "../../src/features/ppi/inspection-schema.ts";
import { stepGroupForKey } from "../../src/features/ppi/inspection-catalog.ts";
import {
  mergeReadings,
  planFill,
  slotQuestions,
  type PhotoReading,
} from "../../src/features/ppi/tire-readings.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reading = (n: number, candidates: Record<string, string | null>, status: PhotoReading["status"] = "extracted"): PhotoReading => ({
  extraction_id: id(100 + n),
  media_id: id(n),
  status,
  candidates,
});

describe("reading tire details from all photos", () => {
  test("a tire's sidewall and DOT code share one slot; the placard has its own", () => {
    assert.deepEqual(slotQuestions("front_left"), [
      { key: "tires.front_left.sidewall", target: "tire_sidewall" },
      { key: "tires.front_left.dot_date", target: "tire_dot" },
    ]);
    assert.deepEqual(slotQuestions("placard"), [{ key: "tires.placard", target: "tire_placard" }]);
    for (const key of ["tires.placard", "tires.front_left.sidewall", "tires.rear_right.dot_date"]) {
      assert.equal(stepGroupForKey(key)?.id, "tires:photos", key);
    }
    assert.equal(stepGroupForKey("tires.front_left.tread")?.id, "wheel:front_left");
  });

  test("fields are combined across photos that each show part of the sidewall", () => {
    const merged = mergeReadings("tire_sidewall", [
      reading(1, { size: "225/50R17", load_index: null, speed_rating: null, brand: "Michelin" }),
      reading(2, { size: "225/50 R17", load_index: "98", speed_rating: "v", brand: null }),
      reading(3, {}, "unreadable"),
      reading(4, { size: null, load_index: "98", speed_rating: null, brand: "MICHELIN", extra_marking: "XL" }),
    ]);
    assert.equal(merged.fields.size.value, "225/50R17");
    assert.deepEqual(merged.fields.size.media_ids, [id(1), id(2)]);
    assert.equal(merged.fields.load_index.value, "98");
    assert.equal(merged.fields.speed_rating.value, "v");
    assert.equal(merged.fields.brand.value, "Michelin");
    assert.equal(merged.fields.extra_marking.value, "XL");
    assert.deepEqual(merged.extraction_ids, [id(101), id(102), id(104)], "only readings that produced values");
  });

  test("photos that disagree are flagged, never resolved by the latest photo", () => {
    const merged = mergeReadings("tire_sidewall", [
      reading(1, { size: "225/50R17" }),
      reading(2, { size: "225/55R17" }),
      reading(3, { size: "225/50R17" }),
    ]);
    assert.equal(merged.fields.size.value, null);
    assert.deepEqual(merged.fields.size.alternatives, [
      { value: "225/50R17", media_ids: [id(1), id(3)] },
      { value: "225/55R17", media_ids: [id(2)] },
    ]);
    const plan = planFill("tire_sidewall", null, merged);
    assert.equal(plan.observation, null);
    assert.deepEqual(plan.conflicts.map((conflict) => conflict.field), ["size"]);
  });

  test("blank fields are filled with provenance and the result is a valid answer", () => {
    const merged = mergeReadings("tire_sidewall", [
      reading(1, { size: "225/50R17", brand: "Michelin" }),
      reading(2, { load_index: "98", speed_rating: "V" }),
      reading(3, { size: "225/50R17" }),
    ]);
    const plan = planFill("tire_sidewall", null, merged);
    assert.deepEqual(plan.filled, ["size", "load_index", "speed_rating", "brand"]);
    assert.deepEqual(plan.observation?.value, { size: "225/50R17", load_index: "98", speed_rating: "V", brand: "Michelin" });
    assert.equal(plan.observation?.source, "confirmed_extraction");
    assert.equal(plan.observation?.extraction_id, id(101), "the photo behind most filled fields");
    assert.deepEqual(plan.observation?.extraction_ids, [id(101), id(102), id(103)]);
    const validated = validateObservation("tires.front_left.sidewall", plan.observation);
    assert.equal(validated.ok, true);
    assert.deepEqual(validated.ok && validated.observation.extraction_ids, [id(101), id(102), id(103)]);
  });

  test("entered values are kept; a differing reading is reported instead", () => {
    const current: ObservationDocument = {
      v: 1,
      state: "observed",
      value: { size: "225/45R17", brand: "Pirelli" },
      reason: null,
      source: "inspector_entry",
    };
    const merged = mergeReadings("tire_sidewall", [reading(1, { size: "225/50R17", load_index: "98", brand: "pirelli" })]);
    const plan = planFill("tire_sidewall", current, merged);
    assert.deepEqual(plan.filled, ["load_index"]);
    assert.deepEqual(plan.observation?.value, { size: "225/45R17", brand: "Pirelli", load_index: "98" });
    assert.deepEqual(plan.conflicts, [{ field: "size", read: [{ value: "225/50R17", media_ids: [id(1)] }], entered: "225/45R17" }]);
  });

  test("an explicit choice such as unable to assess is left alone", () => {
    const current: ObservationDocument = {
      v: 1,
      state: "unable_to_assess",
      value: null,
      reason: { code: "unreadable" },
      source: "inspector_entry",
    };
    const plan = planFill("tire_dot", current, mergeReadings("tire_dot", [reading(1, { code: "0224" })]));
    assert.equal(plan.observation, null);
    assert.equal(plan.kept, "explicit_choice");
  });

  test("the DOT code can come from any photo of the tire", () => {
    const merged = mergeReadings("tire_dot", [reading(1, { code: null }, "unreadable"), reading(2, { code: "0224" })]);
    const plan = planFill("tire_dot", null, merged);
    assert.deepEqual(plan.observation?.value, { code: "0224" });
    assert.equal(validateObservation("tires.front_left.dot_date", plan.observation, { inspectionDate: new Date("2026-09-26") }).ok, true);
  });

  test("the placard fills both axles; pressures compare as numbers", () => {
    const merged = mergeReadings("tire_placard", [
      reading(1, { front_size: "225/50R17", rear_size: "225/50R17", unit: "psi" }),
      reading(2, { front_pressure: "35", rear_pressure: "35.0", unit: "psi" }),
      reading(3, { front_pressure: "35.0" }),
    ]);
    const plan = planFill("tire_placard", null, merged);
    assert.deepEqual(plan.conflicts, []);
    const value = plan.observation?.value as { front: Record<string, string>; rear: Record<string, string>; location: string };
    assert.deepEqual(value.front, { size: "225/50R17", pressure: "35", unit: "psi" });
    assert.deepEqual(value.rear, { size: "225/50R17", pressure: "35.0", unit: "psi" });
    assert.equal(value.location, "driver_door_jamb");
    assert.equal(validateObservation("tires.placard", plan.observation).ok, true);
  });

  test("a combined answer must include its primary reading", () => {
    const observation = {
      v: 1,
      state: "observed",
      value: { code: "0224" },
      source: "confirmed_extraction",
      extraction_id: id(101),
      extraction_ids: [id(102)],
    };
    assert.equal(validateObservation("tires.front_left.dot_date", observation, { inspectionDate: new Date("2026-09-26") }).ok, false);
  });
});
