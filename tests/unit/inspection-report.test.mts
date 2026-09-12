import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { parseInspectionReport, inspectionAge, inspectionCaveat, formatAnswer, sectionLabel } =
  await import("../../src/lib/marketplace/inspection-report.ts");

describe("redacted inspection report (plan 25.3)", () => {
  test("parses the SQL projection and rejects anything score-like", () => {
    const report = parseInspectionReport({
      request_id: "6d2a4c1e-6a8e-4d3f-9a4a-1c9b0f1e2a3b",
      scope: "dents_tires",
      inspected_at: "2026-01-10T10:00:00Z",
      performer_kind: "technician",
      performed_by: "Tess Technician",
      sections: [{ section_type: "wheels_tires", completion_state: "completed", items: [{ prompt: "Front tire tread depth (32nds)", answer_type: "number", value: "6" }], withheld: ["Notes"], notes_withheld: true, media_count: 2 }],
      withheld_count: 2,
      media_count: 2,
    });
    assert.ok(report);
    assert.equal(report.sections[0].items[0].prompt, "Front tire tread depth (32nds)");
    assert.equal(parseInspectionReport({ score: 87 }), null);
    assert.equal(parseInspectionReport(null), null);
  });

  test("age is plain and flags anything a year or older as stale", () => {
    const now = new Date("2026-09-12T00:00:00Z");
    assert.deepEqual(inspectionAge("2026-09-12T00:00:00Z", now).label, "today");
    assert.equal(inspectionAge("2026-09-01T00:00:00Z", now).label, "11 days ago");
    assert.equal(inspectionAge("2026-06-01T00:00:00Z", now).label, "3 months ago");
    const old = inspectionAge("2025-06-01T00:00:00Z", now);
    assert.equal(old.stale, true);
    assert.match(old.label, /15 months ago/);
    assert.equal(inspectionAge("2026-06-01T00:00:00Z", now).stale, false);
  });

  test("caveats name limited scope and age, and never promise current condition", () => {
    const now = new Date("2026-09-12T00:00:00Z");
    const stale = inspectionCaveat("dents_tires", inspectionAge("2025-01-01T00:00:00Z", now));
    assert.match(stale, /dents, body damage, wheels, and tires only/);
    assert.match(stale, /condition may have changed/);
    assert.match(inspectionCaveat("complete", inspectionAge("2026-09-01T00:00:00Z", now)), /not a guarantee/);
  });

  test("answers format plainly", () => {
    assert.equal(formatAnswer({ prompt: "x", answer_type: "yes_no", value: "no" }), "No");
    assert.equal(formatAnswer({ prompt: "x", answer_type: "number", value: "61250" }), "61,250");
    assert.equal(formatAnswer({ prompt: "x", answer_type: "select", value: "Fair" }), "Fair");
    assert.equal(sectionLabel("tires_brakes"), "Tires & Brakes");
    assert.equal(sectionLabel("future_section"), "future section");
  });
});
