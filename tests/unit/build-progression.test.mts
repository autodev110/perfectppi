import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { groupBuildByStage, buildProgress, sortEntries, stageShortLabel } = await import("../../src/lib/vehicles/build-progression.ts");

const stages = [
  { id: "s2", title: "Stage 2: Turbo", position: 1, status: "planned" as const, created_at: "2026-01-02" },
  { id: "s1", title: "Stage 1: Bolt-ons", position: 0, status: "complete" as const, created_at: "2026-01-01" },
];
const entries = [
  { id: "e1", stage_id: "s1", status: "installed" as const, installed_on: "2026-02-01", created_at: "2026-02-01", cost_cents: 35000, labor_cents: 12000, labor_hours: 1.5 },
  { id: "e2", stage_id: "s1", status: "planned" as const, installed_on: null, created_at: "2026-02-02", cost_cents: 90000 },
  { id: "e3", stage_id: "missing-stage", status: "installed" as const, installed_on: "2026-03-01", created_at: "2026-03-01" },
  { id: "e4", stage_id: null, status: "removed" as const, installed_on: null, created_at: "2026-01-15" },
];

describe("build progression (Renditions doc)", () => {
  test("groups entries under stages in position order, then unstaged", () => {
    const groups = groupBuildByStage(stages, entries);
    assert.deepEqual(groups.map((g) => g.stage?.id ?? null), ["s1", "s2", null]);
    assert.deepEqual(groups[0].entries.map((e) => e.id), ["e1", "e2"]);
    assert.equal(groups[0].progress, 0.5);
    assert.deepEqual(groups[0].totals, { entry_count: 2, installed_count: 1, parts_cents: 125000, labor_cents: 12000, labor_hours: 1.5 });
    assert.deepEqual(groups[1].entries, []);
    // An entry pointing at a stage that is not in the list is treated as unstaged.
    assert.deepEqual(groups[2].entries.map((e) => e.id), ["e3", "e4"]);
  });

  test("public callers get counts without costs", () => {
    const publicEntries = entries.map((entry) => ({ id: entry.id, stage_id: entry.stage_id, status: entry.status, installed_on: entry.installed_on, created_at: entry.created_at }));
    const groups = groupBuildByStage(stages, publicEntries);
    assert.equal(groups[0].totals.parts_cents, 0);
    assert.equal(groups[0].totals.installed_count, 1);
  });

  test("overall progress counts complete stages, or installed entries without stages", () => {
    assert.deepEqual(buildProgress(stages, entries), { done: 1, total: 2, percent: 50 });
    assert.deepEqual(buildProgress([], entries), { done: 2, total: 4, percent: 50 });
    assert.deepEqual(buildProgress([], []), { done: 0, total: 0, percent: 0 });
  });

  test("entries sort newest install first, undated last", () => {
    assert.deepEqual(sortEntries(entries).map((e) => e.id), ["e3", "e1", "e2", "e4"]);
    assert.equal(stageShortLabel("Stage 12: Big turbo"), "S12");
    assert.equal(stageShortLabel("Track prep"), "Track prep");
  });
});
