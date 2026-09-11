import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { parsePostDetails, pollOptionsFromLabels, postTypeRequiresPhotos, postTypeRequiresVehicle, POST_TYPES } =
  await import("../../src/lib/community/post-types.ts");

describe("structured post types (plan 14.2)", () => {
  test("general and question posts carry no details", () => {
    assert.deepEqual(parsePostDetails("general", {}), { ok: true, details: {} });
    assert.equal(parsePostDetails("general", { stage: "planning" }).ok, false);
    assert.deepEqual(parsePostDetails("question", undefined), { ok: true, details: {} });
  });

  test("each type validates its own fields", () => {
    assert.equal(parsePostDetails("build_update", { stage: "someday" }).ok, false);
    assert.ok(parsePostDetails("build_update", { stage: "complete", parts: ["Coilovers"] }).ok);
    assert.equal(parsePostDetails("maintenance", { mileage: 10 }).ok, false);
    assert.ok(parsePostDetails("maintenance", { service: "Oil change", diy: true, cost_cents: 6500 }).ok);
    assert.equal(parsePostDetails("buying_advice", { year_min: 2020, year_max: 2010 }).ok, false);
    assert.ok(parsePostDetails("buying_advice", { makes: ["Mazda", "Toyota"], use_case: "Canyon car" }).ok);
    assert.equal(parsePostDetails("inspection_discussion", {}).ok, false);
  });

  test("polls need 2–6 distinct options and a fixed duration", () => {
    const options = pollOptionsFromLabels(["RE-71RS", " RT660 ", ""]);
    assert.deepEqual(options, [{ key: "opt1", label: "RE-71RS" }, { key: "opt2", label: "RT660" }]);
    assert.ok(parsePostDetails("poll", { poll: { duration_hours: 72, options } }).ok);
    assert.equal(parsePostDetails("poll", { poll: { duration_hours: 48, options } }).ok, false);
    assert.equal(parsePostDetails("poll", { poll: { duration_hours: 24, options: options.slice(0, 1) } }).ok, false);
    assert.equal(parsePostDetails("poll", { poll: { duration_hours: 24, options: [options[0], options[0]] } }).ok, false);
  });

  test("composer gates: photos for Before & After, a vehicle for Inspection Discussion", () => {
    assert.equal(postTypeRequiresPhotos("before_after"), 2);
    assert.equal(postTypeRequiresVehicle("inspection_discussion"), true);
    for (const type of POST_TYPES.filter((t) => t !== "before_after")) assert.equal(postTypeRequiresPhotos(type), 0);
  });
});
