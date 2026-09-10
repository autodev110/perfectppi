import assert from "node:assert/strict";
import { describe, test } from "node:test";

const {
  SAFETY_TOPIC_CODES,
  SAFETY_TOPIC_LABELS,
  detectSafetyTopics,
  buildSafetyNotice,
} = await import("../../src/lib/moderation/safety-notice.ts");

describe("safety notice (plan 15.5)", () => {
  test("every topic code has a label", () => {
    for (const code of SAFETY_TOPIC_CODES) {
      assert.ok(SAFETY_TOPIC_LABELS[code].length > 0, code);
    }
  });

  test("detects each plan topic from ordinary member phrasing", () => {
    assert.deepEqual(detectSafetyTopics("My brakes squeal when cold, pads look fine"), ["brakes"]);
    assert.deepEqual(detectSafetyTopics("Replacing the caliper on the rear driver side"), ["brakes"]);
    assert.deepEqual(detectSafetyTopics("ABS light came on after a rotor swap"), ["brakes"]);
    assert.deepEqual(detectSafetyTopics("SRS warning after replacing the clock spring"), ["airbags"]);
    assert.deepEqual(detectSafetyTopics("Where are the jack points on a 2019 Model 3?"), ["lifting"]);
    assert.deepEqual(detectSafetyTopics("Jacked it up on the pinch weld and it bent"), ["lifting"]);
    assert.deepEqual(detectSafetyTopics("Strong gas smell in the garage, is the fuel pump leaking?"), ["fuel_system"]);
    assert.deepEqual(detectSafetyTopics("Smells like fuel after a fill-up"), ["fuel_system"]);
    assert.deepEqual(detectSafetyTopics("Can I unplug the orange cables to swap the inverter?"), ["high_voltage"]);
    assert.deepEqual(detectSafetyTopics("Hybrid battery reads 12V at the HV disconnect"), ["high_voltage"]);
  });

  test("returns topics in canonical order when several match", () => {
    const topics = detectSafetyTopics("Lifted the car on the 2-post lift, then bled the brakes and found a fuel line leak");
    assert.deepEqual(topics, ["brakes", "lifting", "fuel_system"]);
  });

  test("does not fire on casual or unrelated mentions", () => {
    assert.deepEqual(detectSafetyTopics("Great fuel economy on the highway this week"), []);
    assert.deepEqual(detectSafetyTopics("Jack sold me the car last spring"), []);
    assert.deepEqual(detectSafetyTopics("Third brake light bulb replacement, easy job"), []);
    assert.deepEqual(detectSafetyTopics("The 12V battery died again"), []);
    assert.deepEqual(detectSafetyTopics("Detailed the interior and lifted the floor mats"), []);
    assert.deepEqual(detectSafetyTopics(""), []);
    assert.deepEqual(detectSafetyTopics(null), []);
  });

  test("notice message names the topics and disclaims professional diagnosis", () => {
    const notice = buildSafetyNotice("Bleeding the brakes with the car on jack stands");
    assert.ok(notice);
    assert.deepEqual(notice.topics, ["brakes", "lifting"]);
    assert.match(notice.message, /^Safety notice: this post involves brakes and lifting or working under a vehicle\./);
    assert.match(notice.message, /not a professional diagnosis/);
    assert.match(notice.message, /qualified technician/);

    const three = buildSafetyNotice("Airbag light, brake pads, and fuel pressure all wrong");
    assert.ok(three);
    assert.match(three.message, /involves brakes, airbags and restraint systems, and fuel systems\./);
  });

  test("no notice for posts outside the plan topics", () => {
    assert.equal(buildSafetyNotice("Washed and waxed, looking for tire recommendations"), null);
  });
});
