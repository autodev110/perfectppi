import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  TREAD_COVERAGE_THRESHOLD_32NDS,
  evaluateDentsTiresCoverage,
} from "../../src/features/warranty/dents-tires-coverage.ts";

// ============================================================================
// Coverage for a Dents & Tires inspection is decided in code, not by the model,
// so it has to be exactly reproducible. These are the rules the business
// stated, written down as assertions.
// ============================================================================

const TIRE_PROMPTS = [
  "Front left tire tread depth (in 32nds of an inch)",
  "Front right tire tread depth (in 32nds of an inch)",
  "Rear left tire tread depth (in 32nds of an inch)",
  "Rear right tire tread depth (in 32nds of an inch)",
];

function build(
  answers: Record<string, string | null>,
  answerIdsWithMedia: string[] = [],
  standardizedFindings: {
    prompt: string;
    answer: string;
    severity: "info" | "minor" | "moderate" | "major" | "critical";
  }[] = [],
) {
  return evaluateDentsTiresCoverage({
    sections: [
      {
        section_type: "wheels_tires",
        answers: Object.entries(answers).map(([prompt, answer_value]) => ({
          id: prompt,
          prompt,
          answer_value,
        })),
      },
    ],
    answerIdsWithMedia: new Set(answerIdsWithMedia),
    standardizedFindings,
  });
}

function find(coverage: ReturnType<typeof build>, component: string) {
  const match = coverage.components.find((c) => c.component === component);
  assert.ok(match, `no determination for ${component}`);
  return match;
}

/** Every tire well above the threshold, nothing else reported. */
const HEALTHY = Object.fromEntries(TIRE_PROMPTS.map((p) => [p, "9"]));

describe("dents & tires coverage", () => {
  test("covers a tire at the threshold and excludes one above it", () => {
    const coverage = build({
      ...HEALTHY,
      [TIRE_PROMPTS[0]]: String(TREAD_COVERAGE_THRESHOLD_32NDS),
      [TIRE_PROMPTS[1]]: String(TREAD_COVERAGE_THRESHOLD_32NDS + 1),
    });

    assert.equal(find(coverage, "Front Left Tire").determination, "covered");
    assert.equal(find(coverage, "Front Right Tire").determination, "excluded");
  });

  test("covers a tire below the threshold", () => {
    const coverage = build({
      ...HEALTHY,
      [TIRE_PROMPTS[2]]: String(TREAD_COVERAGE_THRESHOLD_32NDS - 1),
    });
    assert.equal(find(coverage, "Rear Left Tire").determination, "covered");
  });

  test("excludes a tire whose tread was never reported", () => {
    const coverage = build({ ...HEALTHY, [TIRE_PROMPTS[3]]: null });
    const rearRight = find(coverage, "Rear Right Tire");
    assert.equal(rearRight.determination, "excluded");
    assert.match(rearRight.reasoning, /not reported/i);
  });

  test("excludes a tire whose tread is not a number", () => {
    const coverage = build({ ...HEALTHY, [TIRE_PROMPTS[0]]: "  " });
    assert.equal(find(coverage, "Front Left Tire").determination, "excluded");
  });

  test("covers rims when damage is typed", () => {
    const coverage = build({
      ...HEALTHY,
      "Any problems with the rims or tires?": "Curb rash on the front right rim",
    });
    assert.equal(find(coverage, "Wheels / Rims").determination, "covered");
  });

  test("covers rims when the report confirms damage from a photo", () => {
    const prompt = "Any problems with the rims or tires?";
    const coverage = build(
      { ...HEALTHY, [prompt]: null },
      [prompt],
      [{ prompt, answer: "Visible curb rash on the rim", severity: "minor" }],
    );
    assert.equal(find(coverage, "Wheels / Rims").determination, "covered");
  });

  test("does not treat an attached photo alone as proof of damage", () => {
    const prompt = "Any problems with the rims or tires?";
    const coverage = build({ ...HEALTHY, [prompt]: null }, [prompt]);
    assert.equal(find(coverage, "Wheels / Rims").determination, "excluded");
  });

  test("does not treat an explicit no-damage answer as covered", () => {
    const coverage = build({
      ...HEALTHY,
      "Any problems with the rims or tires?": "No damage or problems found",
      "Left door — scratches or dents": "No scratches or dents",
    });
    assert.equal(find(coverage, "Wheels / Rims").determination, "excluded");
    assert.equal(find(coverage, "Left Door").determination, "excluded");
  });

  test("does not treat natural-language damage negations as covered", () => {
    const coverage = build({
      ...HEALTHY,
      "Left door — scratches or dents": "There aren't any scratches or dents",
    });
    assert.equal(find(coverage, "Left Door").determination, "excluded");
  });

  test("excludes rims when nothing was reported", () => {
    const coverage = build({ ...HEALTHY, "Any problems with the rims or tires?": "" });
    assert.equal(find(coverage, "Wheels / Rims").determination, "excluded");
  });

  test("covers a body area from a note, and another from a photo alone", () => {
    const photoOnly = "Hood — scratches or dents";
    const coverage = build(
      {
        ...HEALTHY,
        "Left door — scratches or dents": "Deep scratch below the handle",
        [photoOnly]: null,
      },
      [photoOnly],
      [{ prompt: photoOnly, answer: "A dent is visible in the hood", severity: "minor" }],
    );

    assert.equal(find(coverage, "Left Door").determination, "covered");
    assert.equal(find(coverage, "Hood").determination, "covered");
    assert.equal(find(coverage, "Right Door").determination, "excluded");
  });

  test("never covers the bumper, even when everything else is damaged", () => {
    const coverage = build(
      {
        ...Object.fromEntries(TIRE_PROMPTS.map((p) => [p, "1"])),
        "Any problems with the rims or tires?": "Bent rim",
        "Left front fender — scratches or dents": "Dent",
        "Right front fender — scratches or dents": "Dent",
        "Hood — scratches or dents": "Scratches",
        "Left door — scratches or dents": "Dent",
        "Right door — scratches or dents": "Dent",
        "Body panels — scratches or dents": "Scratches",
      },
    );

    const bumper = find(coverage, "Bumper");
    assert.equal(bumper.determination, "excluded");
    assert.equal(coverage.overall_eligibility, "eligible");
  });

  test("is ineligible when a clean vehicle has nothing to cover", () => {
    const coverage = build(HEALTHY);

    assert.equal(coverage.overall_eligibility, "ineligible");
    assert.ok(coverage.components.every((c) => c.determination === "excluded"));
  });

  test("emits no 'limited' determinations", () => {
    // buildPlansFromCoverage drops `limited` into neither inclusions nor
    // exclusions, so a limited row would vanish from the buyer's plan.
    const coverage = build({ ...HEALTHY, [TIRE_PROMPTS[0]]: "3" });
    assert.ok(coverage.components.every((c) => c.determination !== "limited"));
  });

  test("rejects malformed and out-of-range tread values", () => {
    for (const value of ["2abc", "-1", "33", "2.5"]) {
      const coverage = build({ ...HEALTHY, [TIRE_PROMPTS[0]]: value });
      assert.equal(find(coverage, "Front Left Tire").determination, "excluded", value);
    }
  });
});
