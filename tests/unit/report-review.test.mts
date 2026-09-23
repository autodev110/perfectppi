import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { evaluateInspection } from "../../src/features/ppi/inspection-rules.ts";
import { buildInspectionReport, type InspectionReportV2 } from "../../src/features/ppi/inspection-report.ts";
import {
  applyReviewEdits,
  citedRefs,
  editedRegions,
  reviewDraft,
  reviewIssues,
  urgentRefs,
} from "../../src/features/ppi/report-review.ts";
import { fitReportToLayout } from "../../src/lib/pdf/inspection-report/fit.ts";
import { createReportMeasurer, renderInspectionReportPdf } from "../../src/lib/pdf/inspection-report/render.ts";
import { buildReportViewModel } from "../../src/lib/pdf/inspection-report/view-model.ts";
import { loadLayoutAssets } from "../../src/lib/pdf/inspection-report/canvas.ts";
import { INSPECTION_DATE, buildFacts, cleanCorner, cleanObservations, observed, v2Sections } from "./inspection-v2-fixtures.mts";

/** A dense urgent inspection whose priority box is forced to overflow. */
async function heldReport(): Promise<InspectionReportV2> {
  const corner = (name: string) =>
    cleanCorner(name, {
      [`tires.${name}.damage`]: observed({ defects: [{ id: `${name.replace("_", "")}-a`, type: "puncture", location: "tread", certainty: "confirmed" }] }),
      [`tires.${name}.tread`]: observed({ reading: "1", unit: "thirty_seconds_inch", method: "tread_depth_gauge" }),
    });
  const facts = buildFacts(
    "dents_tires",
    v2Sections("dents_tires", {
      ...cleanObservations("dents_tires"),
      ...corner("front_left"),
      ...corner("rear_right"),
      "body.hood.condition": observed({ condition: "damage_present", defects: [{ id: "hood-1", type: "dent", severity: "severe", structural: true }] }),
    }),
  );
  const assessment = evaluateInspection(facts, { inspectionDate: new Date(INSPECTION_DATE) });
  const report = buildInspectionReport({ facts, assessment, factsHash: "0".repeat(64), generatedAt: INSPECTION_DATE });
  const real = await createReportMeasurer();
  // Simulate the overflow: nothing fits the priority box during automatic fitting.
  const { report: held } = await fitReportToLayout(report, { ...real, priorityFits: () => false });
  assert.equal(held.status, "needs_review");
  assert.deepEqual(held.review_reasons, ["layout_overflow:priority_actions"]);
  return held;
}

async function pageCount(report: InspectionReportV2) {
  const vm = buildReportViewModel(report, {
    submissionId: "5a3c9e10-0000-4000-8000-000000000001",
    outputVersion: 1,
    diagram: loadLayoutAssets().spec.diagram,
  });
  return (await PDFDocument.load(await renderInspectionReportPdf(vm))).getPageCount();
}

describe("held report review", () => {
  test("citations are read singly or as lists", () => {
    assert.deepEqual(citedRefs("Replace [T1] and [T2, T5]; see [B1]. Not [note] or [T1 and T2]."), ["T1", "T2", "T5", "B1"]);
  });

  test("the unchanged draft has no edits and no issues", async () => {
    const report = await heldReport();
    const draft = reviewDraft(report);
    assert.deepEqual(editedRegions(report, draft), []);
    assert.deepEqual(reviewIssues(report, draft), []);
  });

  test("an edited priority box must keep every urgent finding", async () => {
    const report = await heldReport();
    const urgent = urgentRefs(report);
    assert.ok(urgent.length >= 3, "fixture has several urgent findings");
    const dropped = { ...reviewDraft(report), priority_actions: `Replace the front-left and rear-right tires [${urgent.slice(0, 1).join(", ")}].` };
    const issues = reviewIssues(report, dropped);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].region, "priority_actions");
    for (const ref of urgent.slice(1)) assert.match(issues[0].message, new RegExp(`\\[${ref}\\]`));

    const complete = { ...reviewDraft(report), priority_actions: `Replace the front-left and rear-right tires; have the hood structure assessed [${urgent.join(", ")}].` };
    assert.deepEqual(reviewIssues(report, complete), []);
  });

  test("edited text may not add findings, prices, AI labels or pass/fail", async () => {
    const report = await heldReport();
    const refs = urgentRefs(report).join(", ");
    const base = reviewDraft(report);
    const messages = (priority: string) => reviewIssues(report, { ...base, priority_actions: priority }).map((issue) => issue.message).join(" ");
    assert.match(messages(`Replace tires [${refs}, T99].`), /do not exist: T99/);
    assert.match(messages(`Replace tires for about $400 [${refs}].`), /may not print/);
    assert.match(messages(`AI summary: replace tires [${refs}].`), /may not print/);
    assert.match(messages(`The tires failed [${refs}].`), /may not print/);
    assert.match(messages(" "), /cannot be empty/);
    assert.match(messages(`${"x".repeat(701)} [${refs}]`), /limit is 700/);
  });

  test("an edited category block must cite its own urgent findings", async () => {
    const report = await heldReport();
    const tires = report.overview.find((block) => block.category === "tires")!;
    const tireUrgent = report.assessment.findings
      .filter((finding) => tires.finding_ids.includes(finding.finding_id) && finding.action === "urgent")
      .map((finding) => finding.ref);
    assert.ok(tireUrgent.length > 0);
    const draft = reviewDraft(report);
    const edit = (observation: string) => ({
      ...draft,
      overview: draft.overview.map((block) => (block.category === "tires" ? { ...block, observation } : block)),
    });
    const missing = reviewIssues(report, edit("Two tires need replacement."));
    assert.equal(missing[0]?.region, "overview.tires");
    assert.deepEqual(reviewIssues(report, edit(`Two tires need replacement [${tireUrgent.join(", ")}].`)), []);
    const reordered = { ...draft, overview: [...draft.overview].reverse() };
    assert.match(reviewIssues(report, reordered)[0].message, /cannot be added, removed or reordered/);
  });

  test("a faithful shorter summary is released as ready and fits two pages", async () => {
    const report = await heldReport();
    const measurer = await createReportMeasurer();
    const summary = `Replace the front-left and rear-right tires (puncture, tread at 1/32 in). Have the hood and surrounding structure assessed [${urgentRefs(report).join(", ")}].`;
    const edits = { ...reviewDraft(report), priority_actions: summary };
    assert.deepEqual(reviewIssues(report, edits), []);
    assert.ok(measurer.priorityFits(summary));

    const released = applyReviewEdits(report, edits, "2026-09-23T12:00:00.000Z");
    assert.equal(released.status, "ready");
    assert.deepEqual(released.review_reasons, []);
    assert.deepEqual(released.review_resolution, {
      resolved_at: "2026-09-23T12:00:00.000Z",
      edited_regions: ["priority_actions"],
      resolved_reasons: ["layout_overflow:priority_actions"],
    });
    assert.equal(released.priority_actions, summary);
    // Untouched regions keep their exact text and provenance.
    assert.deepEqual(released.overview, report.overview);
    assert.equal(released.scope_and_evidence, report.scope_and_evidence);
    // Findings, statuses and actions are never edited.
    assert.deepEqual(released.assessment, report.assessment);
    assert.equal(await pageCount(released), 2);
  });

  test("edited category text is marked as editor-written", async () => {
    const report = await heldReport();
    const draft = reviewDraft(report);
    const bodyBlock = report.overview.find((block) => block.category === "body")!;
    const refs = report.assessment.findings
      .filter((finding) => bodyBlock.finding_ids.includes(finding.finding_id) && finding.action === "urgent")
      .map((finding) => finding.ref);
    const edits = {
      ...draft,
      overview: draft.overview.map((block) =>
        block.category === "body" ? { ...block, observation: `Severe hood dent with possible structural involvement [${refs.join(", ")}].` } : block,
      ),
    };
    const released = applyReviewEdits(report, edits, "2026-09-23T12:00:00.000Z");
    assert.equal(released.overview.find((block) => block.category === "body")!.text_source, "editor");
    assert.ok(released.overview.filter((block) => block.category !== "body").every((block) => block.text_source !== "editor"));
    assert.deepEqual(released.review_resolution?.edited_regions, ["overview.body"]);
  });
});
