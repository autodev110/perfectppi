import type { VscCoverageData, VscComponentDetermination } from "@/types/api";
import type { InspectionFactsV2 } from "../ppi/inspection-facts.ts";
import { formatTread, treadAtOrBelowReplacementThreshold } from "../ppi/inspection-units.ts";

/**
 * Coverage for a Dents & Tires inspection is decided here, in code, rather than
 * by the Stage 2 model.
 *
 * The rules are short, explicit, and stated as if-then by the business, so an
 * LLM adds nothing but variance: the existing prompt invents a different
 * component name on every run, and it hardcodes tires as an always-excluded
 * wear item — the exact opposite of what this product covers.
 */

/** Tread at or below this is worn enough that the program replaces the tire. */
export const TREAD_COVERAGE_THRESHOLD_32NDS = 2;
export const MAX_TREAD_DEPTH_32NDS = 32;

/**
 * A controlled vocabulary. Everywhere else in the codebase `component` is a
 * free-form string the model chooses, which makes coverage unqueryable and
 * unstable across regenerations of the same inspection.
 */
export const DENTS_TIRES_COMPONENTS = [
  "Front Left Tire",
  "Front Right Tire",
  "Rear Left Tire",
  "Rear Right Tire",
  "Wheels / Rims",
  "Left Front Fender",
  "Right Front Fender",
  "Hood",
  "Left Door",
  "Right Door",
  "Body Panels",
  "Bumper",
] as const;

export type DentsTiresComponent = (typeof DENTS_TIRES_COMPONENTS)[number];

export interface CoverageAnswer {
  id: string;
  prompt: string;
  answer_value: string | null;
}

export interface CoverageSection {
  section_type: string;
  answers: CoverageAnswer[];
}

export interface DentsTiresCoverageInput {
  sections: CoverageSection[];
  /** Used to distinguish "no evidence" from a photo the report found clean. */
  answerIdsWithMedia: Set<string>;
  standardizedFindings?: {
    prompt: string;
    answer: string;
    severity: "info" | "minor" | "moderate" | "major" | "critical";
  }[];
}

const TIRE_COMPONENTS: { prompt: string; component: DentsTiresComponent }[] = [
  { prompt: "Front left tire tread depth (in 32nds of an inch)", component: "Front Left Tire" },
  { prompt: "Front right tire tread depth (in 32nds of an inch)", component: "Front Right Tire" },
  { prompt: "Rear left tire tread depth (in 32nds of an inch)", component: "Rear Left Tire" },
  { prompt: "Rear right tire tread depth (in 32nds of an inch)", component: "Rear Right Tire" },
];

const WHEEL_PROMPT = "Any problems with the rims or tires?";

const BODY_COMPONENTS: { prompt: string; component: DentsTiresComponent }[] = [
  { prompt: "Left front fender — scratches or dents", component: "Left Front Fender" },
  { prompt: "Right front fender — scratches or dents", component: "Right Front Fender" },
  { prompt: "Hood — scratches or dents", component: "Hood" },
  { prompt: "Left door — scratches or dents", component: "Left Door" },
  { prompt: "Right door — scratches or dents", component: "Right Door" },
  { prompt: "Body panels — scratches or dents", component: "Body Panels" },
];

function parseTread(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_TREAD_DEPTH_32NDS
    ? parsed
    : null;
}

const DAMAGE_TERMS =
  /\b(dent(?:ed|s)?|scratch(?:ed|es)?|damage(?:d)?|crack(?:ed|s)?|bent|warped|deformed|curb rash|gouge(?:d|s)?|scuff(?:ed|s)?|chip(?:ped|s)?|bulge(?:d|s)?|cut(?:s)?|puncture(?:d|s)?|separation)\b/i;
const NEGATED_DAMAGE =
  /\b(no|not|none|without|free of|zero|neither|nothing|isn't|aren't|wasn't|weren't|doesn't have|do not have)\b[^.!;]{0,40}\b(damage|dents?|scratches?|issues?|problems?|cracks?|bends?|rash|gouges?|scuffs?|chips?|bulges?|cuts?|punctures?|separation)\b/i;

export function evaluateDentsTiresCoverage(
  input: DentsTiresCoverageInput,
): VscCoverageData {
  const answersByPrompt = new Map<string, CoverageAnswer>();
  for (const section of input.sections) {
    for (const answer of section.answers) {
      answersByPrompt.set(answer.prompt, answer);
    }
  }

  const findingsByPrompt = new Map(
    (input.standardizedFindings ?? []).map((finding) => [finding.prompt, finding]),
  );

  /** Coverage requires confirmed damage, not merely a completed field or photo. */
  function damageAssessment(prompt: string): { confirmed: boolean; hasPhoto: boolean } {
    const answer = answersByPrompt.get(prompt);
    if (!answer) return { confirmed: false, hasPhoto: false };

    const hasPhoto = input.answerIdsWithMedia.has(answer.id);
    const finding = findingsByPrompt.get(prompt);
    const findingText = finding?.answer ?? "";
    if (
      finding &&
      finding.severity !== "info" &&
      DAMAGE_TERMS.test(findingText) &&
      !NEGATED_DAMAGE.test(findingText)
    ) {
      return { confirmed: true, hasPhoto };
    }

    const typed = answer.answer_value?.trim() ?? "";
    return {
      confirmed: DAMAGE_TERMS.test(typed) && !NEGATED_DAMAGE.test(typed),
      hasPhoto,
    };
  }

  const components: VscComponentDetermination[] = [];

  for (const tire of TIRE_COMPONENTS) {
    const answer = answersByPrompt.get(tire.prompt);
    const tread = parseTread(answer?.answer_value ?? null);

    if (tread === null) {
      components.push({
        component: tire.component,
        category: "Tires",
        determination: "excluded",
        reasoning: "Tread depth was not reported for this tire.",
        conditions: [],
      });
    } else if (tread <= TREAD_COVERAGE_THRESHOLD_32NDS) {
      components.push({
        component: tire.component,
        category: "Tires",
        determination: "covered",
        reasoning: `Tread measured ${tread}/32, at or below the ${TREAD_COVERAGE_THRESHOLD_32NDS}/32 replacement threshold.`,
        conditions: [],
      });
    } else {
      components.push({
        component: tire.component,
        category: "Tires",
        determination: "excluded",
        reasoning: `Tread measured ${tread}/32, above the ${TREAD_COVERAGE_THRESHOLD_32NDS}/32 replacement threshold.`,
        conditions: [],
      });
    }
  }

  const wheels = damageAssessment(WHEEL_PROMPT);
  components.push({
    component: "Wheels / Rims",
    category: "Wheels",
    determination: wheels.confirmed ? "covered" : "excluded",
    reasoning: wheels.confirmed
      ? "Rim or wheel damage was reported during the inspection."
      : wheels.hasPhoto
        ? "A photo was attached, but the inspection report did not confirm rim or wheel damage."
        : "No rim or wheel damage was reported.",
    conditions: [],
  });

  for (const area of BODY_COMPONENTS) {
    const assessment = damageAssessment(area.prompt);
    components.push({
      component: area.component,
      category: "Body",
      determination: assessment.confirmed ? "covered" : "excluded",
      reasoning: assessment.confirmed
        ? "Scratches or dents were reported for this area."
        : assessment.hasPhoto
          ? "A photo was attached, but the inspection report did not confirm scratches or dents for this area."
          : "No scratches or dents were reported for this area.",
      conditions: [],
    });
  }

  // Emitted even though nothing asks about it: the plan surfaces exclusions to
  // the buyer, and saying so plainly beats silence on the one panel that is
  // never covered.
  components.push({
    component: "Bumper",
    category: "Body",
    determination: "excluded",
    reasoning: "Bumpers are excluded from Dents & Tires coverage.",
    conditions: [],
  });

  const covered = components.filter((c) => c.determination === "covered");

  return {
    overall_eligibility: covered.length > 0 ? "eligible" : "ineligible",
    eligibility_summary:
      covered.length > 0
        ? `${covered.length} component${covered.length === 1 ? "" : "s"} qualify for coverage: ${covered
            .map((c) => c.component)
            .join(", ")}. Bumper damage is excluded.`
        : "No tire wear or body damage qualifying for coverage was reported. Bumper damage is excluded.",
    components,
  };
}

// ============================================================================
// Catalog-2 adapter: the same coverage policy, read from typed facts.
//
// Tread uses the exact 2/32 in (1.5875 mm) threshold before any rounding. An
// unavailable reading is never zero tread. Wheel coverage comes only from
// recorded wheel/rim defects; tire punctures and other tire-condition rules
// (report recommendations) never grant coverage. Precise panels roll up into
// the existing six body groups and bumpers stay excluded.
// ============================================================================

const V2_TIRES: { corner: "front_left" | "front_right" | "rear_left" | "rear_right"; component: DentsTiresComponent }[] = [
  { corner: "front_left", component: "Front Left Tire" },
  { corner: "front_right", component: "Front Right Tire" },
  { corner: "rear_left", component: "Rear Left Tire" },
  { corner: "rear_right", component: "Rear Right Tire" },
];

const PANEL_GROUP: Record<string, DentsTiresComponent> = {
  left_front_fender: "Left Front Fender",
  right_front_fender: "Right Front Fender",
  hood: "Hood",
  left_front_door: "Left Door",
  left_rear_door: "Left Door",
  right_front_door: "Right Door",
  right_rear_door: "Right Door",
  roof: "Body Panels",
  trunk_tailgate: "Body Panels",
  left_rear_quarter: "Body Panels",
  right_rear_quarter: "Body Panels",
  left_rocker: "Body Panels",
  right_rocker: "Body Panels",
  other_body_panel: "Body Panels",
  front_bumper: "Bumper",
  rear_bumper: "Bumper",
};

export function evaluateDentsTiresCoverageFromFacts(facts: InspectionFactsV2): VscCoverageData {
  const components: VscComponentDetermination[] = [];

  for (const tire of V2_TIRES) {
    const tread = facts.tires[tire.corner].tread;
    const value = tread.observation_state === "observed" ? tread.value : null;
    if (!value) {
      components.push({
        component: tire.component,
        category: "Tires",
        determination: "excluded",
        reasoning: tread.observation_state === "unable_to_assess"
          ? "Tread depth was not measured for this tire, so eligibility could not be established."
          : "Tread depth was not reported for this tire.",
        conditions: [],
      });
      continue;
    }
    const readings = [value.reading, value.positions?.inner, value.positions?.center, value.positions?.outer]
      .filter((reading): reading is string => Boolean(reading));
    const worn = readings.some((reading) => treadAtOrBelowReplacementThreshold(reading, value.unit));
    const lowest = readings.find((reading) => treadAtOrBelowReplacementThreshold(reading, value.unit)) ?? value.reading;
    components.push({
      component: tire.component,
      category: "Tires",
      determination: worn ? "covered" : "excluded",
      reasoning: worn
        ? `Tread measured ${formatTread(lowest, value.unit)}, at or below the ${TREAD_COVERAGE_THRESHOLD_32NDS}/32 replacement threshold.`
        : `Tread measured ${formatTread(value.reading, value.unit)}, above the ${TREAD_COVERAGE_THRESHOLD_32NDS}/32 replacement threshold.`,
      conditions: [],
    });
  }

  const damagedWheels = V2_TIRES.filter(({ corner }) => {
    const wheel = facts.wheels[corner].damage;
    return wheel.observation_state === "observed"
      && (wheel.value?.defects ?? []).some((defect) => defect.certainty !== "suspected");
  });
  const suspectedWheels = V2_TIRES.filter(({ corner }) => (facts.wheels[corner].damage.value?.defects ?? []).length > 0);
  components.push({
    component: "Wheels / Rims",
    category: "Wheels",
    determination: damagedWheels.length > 0 ? "covered" : "excluded",
    reasoning: damagedWheels.length > 0
      ? `Rim or wheel damage was recorded at the ${damagedWheels.map(({ corner }) => corner.replace("_", " ")).join(", ")} wheel${damagedWheels.length === 1 ? "" : "s"}.`
      : suspectedWheels.length > 0
        ? "Possible wheel damage was noted but not confirmed."
        : "No rim or wheel damage was reported.",
    conditions: [],
  });

  const damagedGroups = new Set<DentsTiresComponent>();
  for (const [panel, fact] of Object.entries(facts.body)) {
    if (fact.observation_state !== "observed") continue;
    const value = fact.value as { condition?: string; defects?: unknown[] } | null;
    if (value?.condition === "damage_present" && (value.defects ?? []).length > 0) {
      const group = PANEL_GROUP[panel];
      if (group && group !== "Bumper") damagedGroups.add(group);
    }
  }
  for (const area of BODY_COMPONENTS) {
    const covered = damagedGroups.has(area.component);
    components.push({
      component: area.component,
      category: "Body",
      determination: covered ? "covered" : "excluded",
      reasoning: covered
        ? "Scratches or dents were reported for this area."
        : "No scratches or dents were reported for this area.",
      conditions: [],
    });
  }

  components.push({
    component: "Bumper",
    category: "Body",
    determination: "excluded",
    reasoning: "Bumpers are excluded from Dents & Tires coverage.",
    conditions: [],
  });

  const covered = components.filter((component) => component.determination === "covered");
  return {
    overall_eligibility: covered.length > 0 ? "eligible" : "ineligible",
    eligibility_summary:
      covered.length > 0
        ? `${covered.length} component${covered.length === 1 ? "" : "s"} qualify for coverage: ${covered
            .map((component) => component.component)
            .join(", ")}. Bumper damage is excluded.`
        : "No tire wear or body damage qualifying for coverage was reported. Bumper damage is excluded.",
    components,
  };
}
