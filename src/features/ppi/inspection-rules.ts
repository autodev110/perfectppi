import {
  BODY_PANELS,
  CORNERS,
  CORNER_LABELS,
  DEFECT_LABELS,
  PANEL_LABELS,
  REASON_LABELS,
  SCALE_LABELS,
  cornerAxle,
  type BodyPanel,
  type Corner,
  type ExceptionReasonCode,
  type ObservationState,
} from "./inspection-schema.ts";
import {
  compareDecimals,
  comparePressure,
  formatPressure,
  formatTread,
  parseDotCode,
  treadAtOrBelowReplacementThreshold,
  type TreadUnit,
} from "./inspection-units.ts";
import type {
  BodyDefect,
  Fact,
  InspectionFactsV2,
  PanelValue,
  PlacardValue,
  TireDefect,
  TireMarkings,
  TreadValue,
} from "./inspection-facts.ts";

// ============================================================================
// Deterministic condition rules (06-field-map-and-rules.md §7).
//
// Rules read confirmed facts only and return versioned findings. They run
// before any model and again as the final invariant; no classifier or prose
// can lower an action produced here. Condition findings never decide warranty
// eligibility, which stays a separate policy output.
// ============================================================================

export const RULES_VERSION = "inspection-rules/1.0.0";

export type ActionLevel = "none" | "monitor" | "service_recommended" | "urgent";
const ACTION_RANK: Record<ActionLevel, number> = { none: 0, monitor: 1, service_recommended: 2, urgent: 3 };

export function maxAction(levels: ActionLevel[]): ActionLevel {
  return levels.reduce<ActionLevel>((best, level) => (ACTION_RANK[level] > ACTION_RANK[best] ? level : best), "none");
}

export function actionRank(level: ActionLevel): number {
  return ACTION_RANK[level];
}

export type Completeness = "complete" | "partial" | "not_assessed" | "outside_scope";
/** Presentation status: an action, or why there is no clean result. */
export type DisplayStatus =
  | "checked"
  | "monitor"
  | "service"
  | "urgent"
  | "unknown"
  | "not_inspected"
  | "not_applicable"
  | "outside_scope";

export type Category =
  | "tires_wheels"
  | "body_exterior"
  | "interior_controls"
  | "engine_fluids"
  | "brakes_chassis"
  | "road_test_diagnostics"
  | "tires"
  | "wheels"
  | "body"
  | "fitment"
  | "unavailable_measurements"
  | "scope";

export interface Finding {
  finding_id: string;
  /** Short printed reference: T1 (tires/wheels), B1 (body marker), C07 (checklist), N1 (note). */
  ref: string;
  category: Category;
  corners: Corner[];
  panels: BodyPanel[];
  row_id: string | null;
  title: string;
  observation: string;
  significance: string;
  next_step: string;
  action: ActionLevel;
  origin: "deterministic_rule" | "confirmed_observation" | "model_suggestion";
  rule_id: string | null;
  fact_ids: string[];
  evidence_ids: string[];
  certainty: "confirmed" | "suspected" | "insufficient_evidence";
  review_state: "accepted" | "needs_review" | "rejected";
  /** Body-map marker in [0,1] diagram coordinates, when recorded. */
  marker?: { x: number; y: number } | null;
}

export interface Limitation {
  key: string;
  category: Category;
  text: string;
}

export interface ChecklistRow {
  row_id: string;
  label: string;
  group: string;
  source_fact_ids: string[];
  action_level: ActionLevel;
  inspection_completeness: Completeness;
  missing_fact_ids: string[];
  finding_ids: string[];
  status: DisplayStatus;
}

export interface FitmentResult {
  state: "match" | "differs_from_reference" | "documented_alternative" | "unknown";
  compared: { field: "size" | "load_index" | "speed_rating"; installed: string | null; reference: string | null; matches: boolean | null }[];
  reference_axle: "front" | "rear";
}

export interface TireCard {
  corner: Corner;
  status: DisplayStatus;
  action: ActionLevel;
  partial: boolean;
  tread: string;
  pressure: string;
  size: string;
  load_speed: string;
  dot: string;
  dot_age_years: number | null;
  cracking: string;
  cracking_status: DisplayStatus;
  wear: string;
  wear_status: DisplayStatus;
  tire_damage: string;
  wheel_damage: string;
  fitment: FitmentResult;
  fitment_label: string;
  finding_ids: string[];
}

export interface EvidenceCompleteness {
  expected: number;
  available: number;
  exceptions: number;
  missing: { fact_id: string; label: string }[];
  photos_total: number;
  videos_total: number;
}

export interface InspectionAssessment {
  rules_version: string;
  findings: Finding[];
  checklist: ChecklistRow[];
  tires: Record<Corner, TireCard>;
  limitations: Limitation[];
  evidence: EvidenceCompleteness;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const lowerCorner = (corner: Corner) => CORNER_LABELS[corner].toLowerCase();
const hyphenCorner = (corner: Corner) => lowerCorner(corner).replace(" ", "-");

function reasonText(fact: Fact<unknown>): string {
  const code = fact.reason?.code;
  if (!code) return "";
  if (code === "not_recorded") return "not recorded in this inspection version";
  if (code === "outside_scope") return "outside this inspection's scope";
  const label = REASON_LABELS[code as ExceptionReasonCode] ?? code;
  return fact.reason?.explanation ? `${label.toLowerCase()} (${fact.reason.explanation})` : label.toLowerCase();
}

function isObserved(fact: Fact<unknown>): boolean {
  return fact.observation_state === "observed";
}

function statusFromAction(action: ActionLevel): DisplayStatus {
  switch (action) {
    case "urgent":
      return "urgent";
    case "service_recommended":
      return "service";
    case "monitor":
      return "monitor";
    default:
      return "checked";
  }
}

/** Fallback order when no action exists (field map §7). */
function noActionStatus(states: ObservationState[]): DisplayStatus {
  if (states.length === 0) return "not_inspected";
  if (states.every((state) => state === "outside_scope")) return "outside_scope";
  const applicable = states.filter((state) => state !== "outside_scope" && state !== "not_applicable");
  if (applicable.length === 0) return "not_applicable";
  if (applicable.some((state) => state === "unable_to_assess")) return "unknown";
  if (applicable.some((state) => state === "not_inspected" || state === "not_recorded")) return "not_inspected";
  return "checked";
}

function normalizeSize(size: string | null | undefined): string | null {
  if (!size) return null;
  // "ZR" inside a size designation is a speed marking; the dimensions are what
  // identify fitment, so 225/50ZR17 and 225/50R17 compare as the same size.
  return size.toUpperCase().replace(/\s+/g, "").replace(/^P(?=\d)/, "").replace("ZR", "R");
}

const SPEED_ORDER = ["L", "M", "N", "P", "Q", "R", "S", "T", "U", "H", "V", "W", "Y"];
function speedRank(symbol: string | null | undefined): number | null {
  if (!symbol) return null;
  const clean = symbol.replace(/[()]/g, "").toUpperCase();
  if (clean === "Z" || clean === "ZR") return SPEED_ORDER.indexOf("V");
  const index = SPEED_ORDER.indexOf(clean);
  return index >= 0 ? index : null;
}

function firstLoadIndex(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{2,3})/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Tires and wheels
// ---------------------------------------------------------------------------

export function evaluateFitment(corner: Corner, markings: Fact<TireMarkings>, placard: Fact<PlacardValue>): FitmentResult {
  const axle = cornerAxle(corner);
  const reference = isObserved(placard) ? placard.value?.[axle] ?? null : null;
  const installed = isObserved(markings) ? markings.value : null;
  const compared: FitmentResult["compared"] = [];

  const installedSize = normalizeSize(installed?.size ?? null);
  const referenceSize = normalizeSize(reference?.size ?? null);
  compared.push({
    field: "size",
    installed: installed?.size ?? null,
    reference: reference?.size ?? null,
    matches: installedSize && referenceSize ? installedSize === referenceSize : null,
  });

  const installedLoad = firstLoadIndex(installed?.load_index);
  const referenceLoad = firstLoadIndex(placard.value?.load_index);
  if (installedLoad !== null && referenceLoad !== null) {
    compared.push({
      field: "load_index",
      installed: installed?.load_index ?? null,
      reference: placard.value?.load_index ?? null,
      matches: installedLoad >= referenceLoad,
    });
  }
  const installedSpeed = speedRank(installed?.speed_rating);
  const referenceSpeed = speedRank(placard.value?.speed_rating);
  if (installedSpeed !== null && referenceSpeed !== null) {
    compared.push({
      field: "speed_rating",
      installed: installed?.speed_rating ?? null,
      reference: placard.value?.speed_rating ?? null,
      matches: installedSpeed >= referenceSpeed,
    });
  }

  if (compared[0].matches === null) return { state: "unknown", compared, reference_axle: axle };
  const differs = compared.some((entry) => entry.matches === false);
  if (!differs) return { state: "match", compared, reference_axle: axle };
  if (placard.value?.documented_alternative?.trim()) {
    return { state: "documented_alternative", compared, reference_axle: axle };
  }
  return { state: "differs_from_reference", compared, reference_axle: axle };
}

/** The lowest of the entered readings (all share one unit). */
function lowestTread(value: TreadValue): string {
  const readings = [value.reading, value.positions?.inner, value.positions?.center, value.positions?.outer]
    .filter((reading): reading is string => Boolean(reading));
  return readings.reduce((low, reading) => (compareDecimals(reading, low) < 0 ? reading : low));
}

interface Draft extends Omit<Finding, "ref"> {
  sort: number;
}

function tireFindings(facts: InspectionFactsV2, corner: Corner, inspectionDate: Date): Draft[] {
  const tire = facts.tires[corner];
  const wheel = facts.wheels[corner].damage;
  const label = CORNER_LABELS[corner];
  const lower = lowerCorner(corner);
  const category: Category = facts.scope === "dents_tires" ? "tires" : "tires_wheels";
  const wheelCategory: Category = facts.scope === "dents_tires" ? "wheels" : "tires_wheels";
  const drafts: Draft[] = [];
  const cornerIndex = CORNERS.indexOf(corner);
  const base = {
    corners: [corner],
    panels: [] as BodyPanel[],
    row_id: null,
    origin: "deterministic_rule" as const,
    review_state: "accepted" as const,
  };

  // Pressure-loss context is appended to replacement findings, never used to
  // cancel them.
  const pressure = isObserved(tire.pressure) ? tire.pressure.value : null;
  const lossContext =
    pressure?.pressure_loss === "observed"
      ? " Pressure loss was also observed."
      : pressure?.pressure_loss === "not_observed_during_test"
        ? " The tire held pressure during the test; the policy still applies."
        : "";

  // TREAD-001
  if (isObserved(tire.tread) && tire.tread.value) {
    const value = tire.tread.value;
    const low = lowestTread(value);
    if (treadAtOrBelowReplacementThreshold(low, value.unit as TreadUnit)) {
      drafts.push({
        ...base,
        finding_id: `TREAD-001:${tire.tread.fact_id}`,
        category,
        title: `${label} tire - tread at or below 2/32 in`,
        observation: `Lowest measured tread ${formatTread(low, value.unit)}.`,
        significance: "Tread at or below 2/32 in is worn out under this report's program rule.",
        next_step: `Replace the ${lower} tire.`,
        action: "urgent",
        rule_id: "TREAD-001",
        fact_ids: [tire.tread.fact_id],
        evidence_ids: tire.tread.evidence_ids,
        certainty: "confirmed",
        sort: cornerIndex * 100 + 1,
      });
    }
  }

  // DAMAGE-001..006
  if (isObserved(tire.damage)) {
    for (const defect of (tire.damage.value?.defects ?? []) as TireDefect[]) {
      const suspected = defect.certainty === "suspected";
      const where = defect.location && defect.location !== "unknown" ? ` in the ${defect.location}` : "";
      const note = defect.note ? ` Note: ${defect.note}` : "";
      const common = {
        ...base,
        category,
        fact_ids: [tire.damage.fact_id],
        evidence_ids: tire.damage.evidence_ids,
        sort: cornerIndex * 100 + 2,
      };
      const id = `${tire.damage.fact_id}:${defect.id}`;

      if (suspected) {
        const critical = ["puncture", "foreign_object", "bulge", "exposed_cords", "suspected_separation", "cut"].includes(defect.type);
        drafts.push({
          ...common,
          finding_id: `DAMAGE-006:${id}`,
          title: `${label} tire - suspected ${DEFECT_LABELS[defect.type]?.toLowerCase() ?? defect.type}`,
          observation: `Possible ${DEFECT_LABELS[defect.type]?.toLowerCase() ?? defect.type}${where}; not confirmed.${note}`,
          significance: "An unconfirmed defect of this kind can affect tire safety.",
          next_step: `Have the ${lower} tire inspected before relying on it.`,
          action: critical ? "urgent" : "service_recommended",
          rule_id: "DAMAGE-006",
          certainty: "suspected",
          review_state: "needs_review",
        });
        continue;
      }

      if (defect.type === "puncture" || defect.type === "foreign_object") {
        drafts.push({
          ...common,
          finding_id: `DAMAGE-001:${id}`,
          title: `${label} tire - ${defect.type === "puncture" ? "puncture" : "embedded object"}`,
          observation: `${defect.type === "puncture" ? "A puncture" : "An embedded foreign object"} was confirmed${where}.${lossContext}${note}`,
          significance: "Replacement required under PerfectPPI's puncture/foreign-object policy.",
          next_step: `Replace the ${lower} tire.`,
          action: "urgent",
          rule_id: "DAMAGE-001",
          certainty: "confirmed",
        });
      } else if (defect.type === "bulge" || defect.type === "exposed_cords" || defect.type === "missing_rubber") {
        const rule = defect.type === "bulge" ? "DAMAGE-002" : defect.type === "exposed_cords" ? "DAMAGE-003" : "DAMAGE-004";
        drafts.push({
          ...common,
          finding_id: `${rule}:${id}`,
          title: `${label} tire - ${DEFECT_LABELS[defect.type].toLowerCase()}`,
          observation: `${DEFECT_LABELS[defect.type]} confirmed${where}.${note}`,
          significance: "This damage can lead to sudden tire failure.",
          next_step: `Replace the ${lower} tire before further driving.`,
          action: "urgent",
          rule_id: rule,
          certainty: "confirmed",
        });
      } else if (defect.type === "suspected_separation" || (defect.type === "cut" && defect.structural === true)) {
        drafts.push({
          ...common,
          finding_id: `DAMAGE-005:${id}`,
          title: `${label} tire - ${defect.type === "cut" ? "deep / structural cut" : "separation"}`,
          observation: `${defect.type === "cut" ? "A cut reaching the tire structure" : "Tread or ply separation"} was confirmed${where}.${note}`,
          significance: "Structural tire damage can cause sudden failure.",
          next_step: `Remove the ${lower} tire from service and replace it.`,
          action: "urgent",
          rule_id: "DAMAGE-005",
          certainty: "confirmed",
        });
      } else if (defect.type === "cut") {
        drafts.push({
          ...common,
          finding_id: `DAMAGE-005:${id}`,
          title: `${label} tire - cut`,
          observation: `A cut was recorded${where}; its depth was not confirmed.${note}`,
          significance: "A cut's depth decides whether the tire remains serviceable.",
          next_step: `Have the ${lower} tire assessed by a tire professional.`,
          action: "service_recommended",
          rule_id: "DAMAGE-005",
          certainty: "confirmed",
        });
      } else {
        drafts.push({
          ...common,
          finding_id: `DAMAGE-OTHER:${id}`,
          title: `${label} tire - other damage`,
          observation: `Other tire damage was recorded${where}.${note}`,
          significance: "Recorded tire damage needs a professional look.",
          next_step: `Have the ${lower} tire assessed.`,
          action: "service_recommended",
          rule_id: "DAMAGE-OTHER",
          certainty: "confirmed",
        });
      }
    }
  }

  // CRACK-001..003
  if (isObserved(tire.cracking)) {
    const level = tire.cracking.value?.level;
    const rule =
      level === "starting"
        ? { id: "CRACK-001", action: "monitor" as const, significance: "Early surface cracking; not by itself a replacement.", next: `Monitor the ${lower} tire for progression.` }
        : level === "significant"
          ? { id: "CRACK-002", action: "service_recommended" as const, significance: "Significant cracking weakens the rubber over time.", next: `Replacement of the ${lower} tire is recommended.` }
          : level === "severe"
            ? { id: "CRACK-003", action: "urgent" as const, significance: "Severe cracking can lead to tire failure.", next: `Replace the ${lower} tire.` }
            : null;
    if (rule) {
      drafts.push({
        ...base,
        finding_id: `${rule.id}:${tire.cracking.fact_id}`,
        category,
        title: `${label} tire - ${SCALE_LABELS[level!].toLowerCase()} cracking`,
        observation: `${SCALE_LABELS[level!]} visible cracking / dry rot was recorded.`,
        significance: rule.significance,
        next_step: rule.next,
        action: rule.action,
        rule_id: rule.id,
        fact_ids: [tire.cracking.fact_id],
        evidence_ids: tire.cracking.evidence_ids,
        certainty: "confirmed",
        sort: cornerIndex * 100 + 3,
      });
    }
  }

  // AGE-001: a recent date code with severe cracking is a discrepancy to confirm.
  if (isObserved(tire.dot_date) && isObserved(tire.cracking) && tire.dot_date.value?.code) {
    const dot = parseDotCode(tire.dot_date.value.code, inspectionDate);
    if (dot.ok && dot.ageYears < 3 && tire.cracking.value?.level === "severe") {
      drafts.push({
        ...base,
        finding_id: `AGE-001:${tire.dot_date.fact_id}`,
        category,
        title: `${label} tire - date code and condition disagree`,
        observation: `DOT ${tire.dot_date.value.code} indicates a tire under three years old, yet severe cracking was recorded.`,
        significance: "The date code, tire identity or condition entry may need confirmation.",
        next_step: `Confirm the ${lower} date code and tire identity.`,
        action: "monitor",
        rule_id: "AGE-001",
        fact_ids: [tire.dot_date.fact_id, tire.cracking.fact_id],
        evidence_ids: [...tire.dot_date.evidence_ids, ...tire.cracking.evidence_ids],
        certainty: "suspected",
        review_state: "needs_review",
        sort: cornerIndex * 100 + 4,
      });
    }
  }

  // WEAR-001..002
  if (isObserved(tire.wear)) {
    const level = tire.wear.value?.level;
    const patterns = tire.wear.value?.patterns?.length
      ? ` Pattern: ${tire.wear.value.patterns.map((pattern) => pattern.replace(/_/g, " ")).join(", ")}.`
      : "";
    if (level === "uneven_monitor" || level === "severe_uneven") {
      const severe = level === "severe_uneven";
      drafts.push({
        ...base,
        finding_id: `${severe ? "WEAR-002" : "WEAR-001"}:${tire.wear.fact_id}`,
        category,
        title: `${label} tire - ${severe ? "severe uneven" : "uneven"} wear`,
        observation: `${severe ? "Severe uneven" : "Mild uneven"} tread wear was recorded.${patterns}`,
        significance: "Uneven wear can point to inflation, alignment or suspension issues; it does not prove a failed part.",
        next_step: severe
          ? `Have the ${lower} tire, alignment and suspension assessed soon.`
          : "Check inflation and alignment; monitor the wear.",
        action: severe ? "urgent" : "monitor",
        rule_id: severe ? "WEAR-002" : "WEAR-001",
        fact_ids: [tire.wear.fact_id],
        evidence_ids: tire.wear.evidence_ids,
        certainty: "confirmed",
        sort: cornerIndex * 100 + 5,
      });
    }
  }

  // PRESSURE-001..002
  if (pressure) {
    if (pressure.pressure_loss === "observed" || pressure.pressure_loss === "reported") {
      const observed = pressure.pressure_loss === "observed";
      drafts.push({
        ...base,
        finding_id: `PRESSURE-001:${tire.pressure.fact_id}`,
        category,
        title: `${label} tire - ${observed ? "pressure loss" : "reported pressure loss"}`,
        observation: observed
          ? "The tire lost pressure during the inspection."
          : "Pressure loss was reported for this tire but not observed during the inspection.",
        significance: "Losing pressure can indicate a leak or damage.",
        next_step: `Have the ${lower} tire and wheel checked for the source of the leak.`,
        action: observed ? "urgent" : "service_recommended",
        rule_id: "PRESSURE-001",
        fact_ids: [tire.pressure.fact_id],
        evidence_ids: tire.pressure.evidence_ids,
        certainty: observed ? "confirmed" : "suspected",
        sort: cornerIndex * 100 + 6,
      });
    }
    const target = isObserved(facts.placard) ? facts.placard.value?.[cornerAxle(corner)] : null;
    if (target?.pressure && pressure.context === "cold") {
      const difference = comparePressure(
        { reading: pressure.reading, unit: pressure.unit },
        { reading: target.pressure, unit: target.unit ?? "psi" },
      );
      if (difference !== 0) {
        drafts.push({
          ...base,
          finding_id: `PRESSURE-002:${tire.pressure.fact_id}`,
          category,
          title: `${label} tire - pressure differs from placard`,
          observation: `Cold pressure ${formatPressure(pressure.reading, pressure.unit)}; placard ${formatPressure(target.pressure, target.unit ?? "psi")}.`,
          significance: "Incorrect pressure affects wear, handling and fuel use.",
          next_step: `Set the ${lower} tire to the placard pressure and recheck.`,
          // A confirmed cold-pressure discrepancy is a service item (spec
          // PRESSURE-002); no tolerance band is invented.
          action: "service_recommended",
          rule_id: "PRESSURE-002",
          fact_ids: [tire.pressure.fact_id, facts.placard.fact_id],
          evidence_ids: tire.pressure.evidence_ids,
          certainty: "confirmed",
          sort: cornerIndex * 100 + 7,
        });
      }
    }
  }

  // FITMENT-001..003
  const fitment = evaluateFitment(corner, tire.sidewall, facts.placard);
  if (fitment.state === "differs_from_reference") {
    const differing = fitment.compared.filter((entry) => entry.matches === false);
    drafts.push({
      ...base,
      finding_id: `FITMENT-001:${tire.sidewall.fact_id}`,
      category: facts.scope === "dents_tires" ? "fitment" : category,
      title: `${label} tire - differs from placard`,
      observation: differing
        .map((entry) => `Installed ${entry.field.replace("_", " ")} ${entry.installed} vs ${cornerAxle(corner)} reference ${entry.reference}.`)
        .join(" "),
      significance: "Tires that differ from the vehicle specification can affect handling and load capacity. This does not fail the inspection.",
      next_step: `Fit tires matching the placard, or verify an approved alternative for the ${lower} position.`,
      action: "service_recommended",
      rule_id: "FITMENT-001",
      fact_ids: [tire.sidewall.fact_id, facts.placard.fact_id],
      evidence_ids: [...tire.sidewall.evidence_ids, ...facts.placard.evidence_ids],
      certainty: "confirmed",
      sort: cornerIndex * 100 + 8,
    });
  }

  // WHEEL-001..003
  if (isObserved(wheel)) {
    for (const defect of wheel.value?.defects ?? []) {
      const suspected = defect.certainty === "suspected";
      const note = defect.note ? ` Note: ${defect.note}` : "";
      const rule =
        defect.type === "scratch_curb_rash"
          ? { id: "WHEEL-001", action: "monitor" as const, significance: "Cosmetic wheel damage.", next: "Cosmetic repair is optional." }
          : defect.type === "bent" || defect.type === "cracked"
            ? { id: "WHEEL-003", action: "urgent" as const, significance: "A bent or cracked wheel can lose air or fail.", next: `Have the ${lower} wheel and tire assembly professionally assessed.` }
            : { id: "WHEEL-002", action: "service_recommended" as const, significance: "Material loss may affect the wheel's structure.", next: `Have the ${lower} wheel inspected for structural damage.` };
      drafts.push({
        ...base,
        finding_id: `${rule.id}:${wheel.fact_id}:${defect.id}`,
        category: wheelCategory,
        title: `${label} wheel - ${(DEFECT_LABELS[defect.type] ?? defect.type).toLowerCase()}`,
        observation: `${suspected ? "Possible" : "Recorded"} ${(DEFECT_LABELS[defect.type] ?? defect.type).toLowerCase()} on the ${lower} wheel.${note}`,
        significance: rule.significance,
        next_step: rule.next,
        action: rule.action,
        rule_id: rule.id,
        fact_ids: [wheel.fact_id],
        evidence_ids: wheel.evidence_ids,
        certainty: suspected ? "suspected" : "confirmed",
        review_state: suspected ? "needs_review" : "accepted",
        sort: cornerIndex * 100 + 9,
      });
    }
  }

  return drafts;
}

function tireCard(facts: InspectionFactsV2, corner: Corner, drafts: Draft[], inspectionDate: Date): TireCard {
  const tire = facts.tires[corner];
  const wheel = facts.wheels[corner].damage;
  const cornerDrafts = drafts.filter((draft) => draft.corners.includes(corner));
  const action = maxAction(cornerDrafts.map((draft) => draft.action));

  const unavailable = (fact: Fact<unknown>) =>
    fact.observation_state === "unable_to_assess"
      ? "Unavailable"
      : fact.observation_state === "not_recorded"
        ? "Not recorded"
        : fact.observation_state === "not_applicable"
          ? "N/A"
          : "Not inspected";

  const tread = isObserved(tire.tread) && tire.tread.value
    ? formatTread(lowestTread(tire.tread.value), tire.tread.value.unit)
    : unavailable(tire.tread);
  const pressureValue = tire.pressure.value;
  const pressure = isObserved(tire.pressure) && pressureValue
    ? `${formatPressure(pressureValue.reading, pressureValue.unit)}${pressureValue.context === "unknown" ? " (context unknown)" : ` (${pressureValue.context})`}`
    : unavailable(tire.pressure);

  const markings = isObserved(tire.sidewall) ? tire.sidewall.value : null;
  const size = markings?.size ?? (isObserved(tire.sidewall) ? "Not readable" : unavailable(tire.sidewall));
  const load = markings?.load_index ?? "-";
  const speed = markings?.speed_rating ?? "-";
  const loadSpeed = isObserved(tire.sidewall) ? `${load} / ${speed}` : unavailable(tire.sidewall);

  let dotAge: number | null = null;
  let dot = unavailable(tire.dot_date);
  if (isObserved(tire.dot_date) && tire.dot_date.value?.code) {
    dot = tire.dot_date.value.code;
    const parsed = parseDotCode(tire.dot_date.value.code, inspectionDate);
    if (parsed.ok) dotAge = parsed.ageYears;
  }

  const scaleStatus = (fact: Fact<{ level: string }>, map: Record<string, ActionLevel>): DisplayStatus =>
    isObserved(fact) && fact.value ? statusFromAction(map[fact.value.level] ?? "none") : noActionStatus([fact.observation_state]);
  const cracking = isObserved(tire.cracking) && tire.cracking.value ? SCALE_LABELS[tire.cracking.value.level] ?? tire.cracking.value.level : unavailable(tire.cracking);
  const wear = isObserved(tire.wear) && tire.wear.value ? SCALE_LABELS[tire.wear.value.level] ?? tire.wear.value.level : unavailable(tire.wear);

  const defectSummary = (fact: Fact<{ none_observed?: boolean; defects?: { type: string; certainty?: string }[] }>, short: Record<string, string>) => {
    if (!isObserved(fact)) return unavailable(fact);
    const defects = fact.value?.defects ?? [];
    if (!defects.length) return "None";
    return defects.map((defect) => `${short[defect.type] ?? "Other"}${defect.certainty === "suspected" ? "?" : ""}`).join(", ");
  };
  const tireShort: Record<string, string> = {
    puncture: "Puncture",
    foreign_object: "Object",
    cut: "Cut",
    missing_rubber: "Chunk",
    bulge: "Bulge",
    exposed_cords: "Cords",
    suspected_separation: "Separation",
    other: "Other",
  };
  const wheelShort: Record<string, string> = {
    scratch_curb_rash: "Rash",
    gouge_chipped_material: "Gouge",
    bent: "Bent",
    cracked: "Cracked",
    other: "Other",
  };

  const fitment = evaluateFitment(corner, tire.sidewall, facts.placard);
  const fitmentLabel =
    fitment.state === "match"
      ? "Matches placard"
      : fitment.state === "differs_from_reference"
        ? "Differs from placard"
        : fitment.state === "documented_alternative"
          ? "Approved alternative"
          : "Unable to verify";

  const constituents: Fact<unknown>[] = [tire.sidewall, tire.dot_date, tire.tread, tire.pressure, tire.cracking, tire.wear, tire.damage, wheel];
  const incomplete = constituents.some((fact) => !isObserved(fact));
  const measurementsMissing = !isObserved(tire.tread) || !isObserved(tire.pressure);
  const status = action !== "none" ? statusFromAction(action) : noActionStatus(constituents.map((fact) => fact.observation_state));

  return {
    corner,
    status,
    action,
    partial: (action !== "none" && incomplete) || measurementsMissing,
    tread,
    pressure,
    size,
    load_speed: loadSpeed,
    dot,
    dot_age_years: dotAge,
    cracking,
    cracking_status: scaleStatus(tire.cracking, { none: "none", starting: "monitor", significant: "service_recommended", severe: "urgent" }),
    wear,
    wear_status: scaleStatus(tire.wear, { even: "none", uneven_monitor: "monitor", severe_uneven: "urgent" }),
    tire_damage: defectSummary(tire.damage, tireShort),
    wheel_damage: defectSummary(wheel, wheelShort),
    fitment,
    fitment_label: fitmentLabel,
    finding_ids: cornerDrafts.map((draft) => draft.finding_id),
  };
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

function bodyFindings(facts: InspectionFactsV2): Draft[] {
  const drafts: Draft[] = [];
  const category: Category = facts.scope === "dents_tires" ? "body" : "body_exterior";
  BODY_PANELS.forEach((panel, panelIndex) => {
    const fact = facts.body[panel];
    if (!isObserved(fact)) return;
    const value = fact.value as PanelValue | null;
    if (value?.legacy_note) {
      drafts.push({
        finding_id: `BODY-LEGACY:${fact.fact_id}`,
        category,
        corners: [],
        panels: [panel],
        row_id: facts.scope === "complete" ? "R02" : null,
        title: `${PANEL_LABELS[panel]} - recorded note`,
        observation: `Inspector note: “${value.legacy_note}”`,
        significance: "This historical note was recorded as free text and was not classified.",
        next_step: "Review the note and photos in the full findings.",
        action: "none",
        origin: "confirmed_observation",
        rule_id: null,
        fact_ids: [fact.fact_id],
        evidence_ids: fact.evidence_ids,
        certainty: "insufficient_evidence",
        review_state: "needs_review",
        sort: 1000 + panelIndex,
      });
      return;
    }
    for (const defect of (value?.defects ?? []) as BodyDefect[]) {
      const structural = defect.structural === true || (defect.type === "rust" && defect.severity === "severe");
      const action: ActionLevel = structural ? "urgent" : defect.severity === "minor" ? "monitor" : "service_recommended";
      const typeLabel = (DEFECT_LABELS[defect.type] ?? defect.type).toLowerCase();
      drafts.push({
        finding_id: `${structural ? "BODY-002" : "BODY-001"}:${fact.fact_id}:${defect.id}`,
        category,
        corners: [],
        panels: [panel],
        row_id: facts.scope === "complete" ? "R02" : null,
        title: `${PANEL_LABELS[panel]} - ${typeLabel}`,
        observation: `${defect.severity ? `${defect.severity[0].toUpperCase()}${defect.severity.slice(1)} ` : ""}${typeLabel}.${defect.note ? ` ${defect.note}` : ""}`,
        significance: structural
          ? "Damage may involve the vehicle's structure."
          : defect.severity === "minor"
            ? "Cosmetic damage."
            : "Visible damage that may need body or paint repair.",
        next_step: structural
          ? `Have the ${PANEL_LABELS[panel].toLowerCase()} and surrounding structure assessed.`
          : defect.severity === "minor"
            ? "Cosmetic repair is optional."
            : `Obtain a body repair assessment for the ${PANEL_LABELS[panel].toLowerCase()}.`,
        action,
        origin: "deterministic_rule",
        rule_id: structural ? "BODY-002" : "BODY-001",
        fact_ids: [fact.fact_id],
        evidence_ids: fact.evidence_ids,
        certainty: "confirmed",
        review_state: "accepted",
        marker: defect.marker ?? null,
        sort: 1000 + panelIndex,
      });
    }
  });

  for (const note of facts.legacy_body_notes) {
    drafts.push({
      finding_id: `BODY-LEGACY:${note.fact_id}`,
      category,
      corners: [],
      panels: [],
      row_id: facts.scope === "complete" ? "R02" : null,
      title: `${note.prompt ?? "Body"} - recorded note`,
      observation: `Inspector note: “${note.value?.note ?? ""}” Location not recorded to a specific panel.`,
      significance: "This historical note was recorded as free text and was not classified.",
      next_step: "Review the note and photos in the full findings.",
      action: "none",
      origin: "confirmed_observation",
      rule_id: null,
      fact_ids: [note.fact_id],
      evidence_ids: note.evidence_ids,
      certainty: "insufficient_evidence",
      review_state: "needs_review",
      sort: 1100,
    });
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// Complete checklist rows (R01–R25)
// ---------------------------------------------------------------------------

type OptionOutcome = { action: ActionLevel } | { state: "unable_to_assess" | "not_applicable" };
type Mapper = (answer: string, facts: InspectionFactsV2) => OptionOutcome | null;

const yesIsConcern = (level: ActionLevel): Mapper => (answer) =>
  answer === "yes" ? { action: level } : answer === "no" ? { action: "none" } : null;
const noIsConcern = (level: ActionLevel): Mapper => (answer) =>
  answer === "no" ? { action: level } : answer === "yes" ? { action: "none" } : null;
const options = (map: Record<string, ActionLevel | "unable_to_assess" | "not_applicable">): Mapper => (answer) => {
  const outcome = map[answer];
  if (!outcome) return null;
  return outcome === "unable_to_assess" || outcome === "not_applicable" ? { state: outcome } : { action: outcome };
};
const recordedOnly: Mapper = () => ({ action: "none" });

const vinMapper: Mapper = (answer, facts) => {
  const intake = facts.vehicle.vin?.trim().toUpperCase();
  const observed = answer.trim().toUpperCase().replace(/\s+/g, "");
  if (!intake || !observed) return { action: "none" };
  return observed === intake ? { action: "none" } : { action: "service_recommended" };
};

interface RowConstituent {
  key: string;
  label: string;
  map: Mapper;
  next?: string;
}

interface RowDefinition {
  id: string;
  label: string;
  group: string;
  category: Category;
  constituents: RowConstituent[];
}

const CONDITION_4 = { Excellent: "none", Good: "none", Fair: "monitor", Poor: "service_recommended" } as const;

export const CHECKLIST_ROWS: RowDefinition[] = [
  {
    id: "R01", label: "Identity / title / history", group: "IDENTITY & EXTERIOR", category: "body_exterior",
    constituents: [
      { key: "vehicle.vin_confirmation", label: "VIN on the vehicle", map: vinMapper, next: "Verify the vehicle's identity before purchase." },
      { key: "vehicle.odometer", label: "Odometer", map: recordedOnly },
      { key: "vehicle.title_status", label: "Title status", map: options({ Clean: "none", Salvage: "service_recommended", Rebuilt: "service_recommended", "Lemon Law": "service_recommended", Unknown: "unable_to_assess" }), next: "Review the title documentation before purchase." },
      { key: "vehicle.history_accidents_reported", label: "Reported accident history", map: yesIsConcern("monitor"), next: "Review the accident history and repair quality." },
    ],
  },
  {
    id: "R02", label: "Paint / panels / body damage", group: "IDENTITY & EXTERIOR", category: "body_exterior",
    constituents: [
      { key: "exterior.paint_condition", label: "Paint condition", map: options(CONDITION_4) },
      { key: "exterior.dents_present", label: "Dents or dings (reported)", map: yesIsConcern("monitor") },
      { key: "exterior.body_rust_present", label: "Visible body rust", map: yesIsConcern("monitor"), next: "Have the rust assessed before it spreads." },
      { key: "exterior.panel_mismatch_or_repaint", label: "Mismatched or repainted panels", map: yesIsConcern("monitor"), next: "Ask about prior repairs; a repaint alone is not a fault." },
    ],
  },
  { id: "R03", label: "Windshield", group: "IDENTITY & EXTERIOR", category: "body_exterior", constituents: [
    { key: "exterior.windshield_condition", label: "Windshield", map: options({ "No damage": "none", "Small chip": "monitor", Crack: "service_recommended", "Multiple cracks": "service_recommended" }), next: "Have the windshield repaired or replaced." },
  ] },
  { id: "R04", label: "Exterior lamps / lenses", group: "IDENTITY & EXTERIOR", category: "body_exterior", constituents: [
    { key: "exterior.lamp_lens_condition", label: "Lamp lenses", map: options({ "Clear and intact": "none", "Minor yellowing": "monitor", "Cracked/broken": "service_recommended", Missing: "service_recommended" }) },
    { key: "electrical.exterior_lights_operation", label: "Exterior light operation", map: noIsConcern("service_recommended"), next: "Repair inoperative exterior lights before driving at night." },
  ] },
  { id: "R05", label: "Seats / upholstery / adjustments", group: "CABIN & CONTROLS", category: "interior_controls", constituents: [
    { key: "interior.overall_condition", label: "Interior condition", map: options(CONDITION_4) },
    { key: "interior.seat_damage_present", label: "Seat rips, tears or stains", map: yesIsConcern("monitor") },
    { key: "interior.power_seat_operation", label: "Power seat adjustment", map: noIsConcern("service_recommended") },
  ] },
  { id: "R06", label: "Carpet / floor mats", group: "CABIN & CONTROLS", category: "interior_controls", constituents: [
    { key: "interior.carpet_mats_condition", label: "Carpet and mats", map: options({ Excellent: "none", Good: "none", Stained: "monitor", "Torn/worn through": "service_recommended" }) },
  ] },
  { id: "R07", label: "Interior odors", group: "CABIN & CONTROLS", category: "interior_controls", constituents: [
    { key: "interior.unusual_odor", label: "Unusual odor", map: yesIsConcern("monitor"), next: "Identify the odor source; an odor alone does not confirm its cause." },
  ] },
  { id: "R08", label: "Windows / door locks", group: "CABIN & CONTROLS", category: "interior_controls", constituents: [
    { key: "electrical.windows_operation", label: "Window operation", map: noIsConcern("service_recommended") },
    { key: "electrical.door_locks_operation", label: "Door lock operation", map: noIsConcern("service_recommended") },
    { key: "electrical.legacy_locks_and_windows", label: "Locks and windows (combined)", map: noIsConcern("service_recommended") },
  ] },
  { id: "R09", label: "Air conditioning / heat", group: "CABIN & CONTROLS", category: "interior_controls", constituents: [
    { key: "electrical.ac_operation", label: "Air conditioning", map: noIsConcern("service_recommended") },
    { key: "electrical.heater_operation", label: "Heater", map: noIsConcern("service_recommended") },
  ] },
  { id: "R10", label: "Infotainment / other electrical", group: "CABIN & CONTROLS", category: "interior_controls", constituents: [
    { key: "electrical.infotainment_operation", label: "Infotainment", map: noIsConcern("service_recommended") },
  ] },
  { id: "R11", label: "Starting / transmission", group: "DRIVE & DIAGNOSTICS", category: "road_test_diagnostics", constituents: [
    { key: "road_test.smooth_start", label: "Engine start", map: noIsConcern("service_recommended") },
    { key: "road_test.smooth_shifts", label: "Transmission shifting", map: noIsConcern("service_recommended") },
  ] },
  { id: "R12", label: "Braking during road test", group: "DRIVE & DIAGNOSTICS", category: "road_test_diagnostics", constituents: [
    { key: "road_test.straight_line_braking", label: "Straight-line braking", map: noIsConcern("service_recommended"), next: "Have the brakes and steering inspected promptly." },
  ] },
  { id: "R13", label: "Road vibration / noise", group: "DRIVE & DIAGNOSTICS", category: "road_test_diagnostics", constituents: [
    { key: "road_test.highway_vibration", label: "Highway-speed vibration", map: yesIsConcern("service_recommended") },
    { key: "road_test.unusual_noise", label: "Driving noises", map: yesIsConcern("service_recommended") },
  ] },
  { id: "R14", label: "Dashboard / warning lamps", group: "DRIVE & DIAGNOSTICS", category: "road_test_diagnostics", constituents: [
    { key: "dashboard.warning_lights_present", label: "Warning lights", map: yesIsConcern("service_recommended"), next: "Have the active warnings diagnosed." },
    { key: "dashboard.check_engine_light", label: "Check engine light", map: yesIsConcern("service_recommended"), next: "Have the check engine light diagnosed." },
    { key: "dashboard.abs_traction_warning", label: "ABS / traction warning", map: yesIsConcern("service_recommended"), next: "Have the ABS / traction warning diagnosed." },
  ] },
  { id: "R15", label: "Diagnostic scan findings", group: "DRIVE & DIAGNOSTICS", category: "road_test_diagnostics", constituents: [] },
  { id: "R16", label: "Engine-bay fluid / coolant leaks", group: "ENGINE & FLUIDS", category: "engine_fluids", constituents: [
    { key: "engine_bay.visible_fluid_leak", label: "Visible fluid leak", map: yesIsConcern("service_recommended"), next: "Have the leak source identified and repaired." },
    { key: "engine_bay.coolant_leak_signs", label: "Coolant leak signs", map: yesIsConcern("service_recommended"), next: "Have the cooling system pressure-tested." },
  ] },
  { id: "R17", label: "Idle noise / engine concerns", group: "ENGINE & FLUIDS", category: "engine_fluids", constituents: [
    { key: "engine_bay.idle_noise", label: "Idle noise", map: yesIsConcern("service_recommended") },
  ] },
  { id: "R18", label: "Drive belt", group: "ENGINE & FLUIDS", category: "engine_fluids", constituents: [
    { key: "engine_bay.drive_belt_condition", label: "Drive belt", map: options({ Good: "none", Worn: "service_recommended", Cracked: "service_recommended", "Not visible": "unable_to_assess" }), next: "Replace the drive belt." },
  ] },
  { id: "R19", label: "Battery terminals", group: "ENGINE & FLUIDS", category: "engine_fluids", constituents: [
    { key: "engine_bay.battery_terminal_corrosion", label: "Battery terminal corrosion", map: yesIsConcern("monitor"), next: "Clean the terminals; a battery test is separate." },
  ] },
  { id: "R20", label: "Fluids observed", group: "ENGINE & FLUIDS", category: "engine_fluids", constituents: [
    { key: "fluids.engine_oil_condition", label: "Engine oil", map: options({ "Clean (amber)": "none", "Dark (due for change)": "service_recommended", "Very dark/dirty": "service_recommended", "Milky (coolant contamination)": "urgent" }), next: "Change the oil; have a milky appearance assessed before driving." },
    { key: "fluids.coolant_level", label: "Coolant level", map: options({ Full: "none", Low: "service_recommended", Empty: "urgent", "Not checkable": "unable_to_assess" }), next: "Top up coolant and check for leaks." },
    { key: "fluids.brake_fluid_color", label: "Brake fluid", map: options({ "Clear/light yellow (good)": "none", "Amber (ok)": "none", "Dark brown (old)": "service_recommended", "Not checkable": "unable_to_assess" }), next: "Have the brake fluid replaced." },
    { key: "fluids.transmission_fluid_condition", label: "Transmission fluid", map: options({ "Pink/clear (good)": "none", "Brown (aging)": "monitor", "Dark/burnt smell": "service_recommended", "Not checkable": "unable_to_assess" }), next: "Have the transmission fluid checked using the applicable procedure." },
    { key: "fluids.power_steering_level", label: "Power steering fluid", map: options({ Full: "none", Low: "service_recommended", "Not applicable (electric steering)": "not_applicable", "Not checkable": "unable_to_assess" }) },
  ] },
  { id: "R21", label: "Pad estimate / visible rotors", group: "BRAKES, CHASSIS & OTHER", category: "brakes_chassis", constituents: [
    { key: "brakes.pad_life_estimate", label: "Estimated pad life", map: options({ ">75%": "none", "50–75%": "none", "25–50%": "monitor", "<25% (needs replacement)": "service_recommended" }), next: "Plan brake pad replacement." },
    { key: "brakes.visible_rotor_condition", label: "Visible rotors", map: options({ Good: "none", "Surface rust (normal)": "none", "Grooved/scored": "service_recommended", "Not visible": "unable_to_assess" }), next: "Have the rotors measured and resurfaced or replaced." },
  ] },
  { id: "R22", label: "Steering / tracking", group: "BRAKES, CHASSIS & OTHER", category: "brakes_chassis", constituents: [
    { key: "steering.play_or_looseness", label: "Steering play", map: yesIsConcern("service_recommended"), next: "Have the steering components inspected." },
    { key: "steering.pulls_to_side", label: "Pulls to one side", map: yesIsConcern("service_recommended"), next: "Have the alignment and tires checked." },
  ] },
  { id: "R23", label: "Suspension / ride", group: "BRAKES, CHASSIS & OTHER", category: "brakes_chassis", constituents: [
    { key: "suspension.bounce_test", label: "Bounce test", map: options({ "Firm (good shocks)": "none", "One bounce (acceptable)": "none", "Bouncy (worn shocks)": "service_recommended" }), next: "Have the shocks / struts assessed." },
    { key: "suspension.noise_over_bumps", label: "Noise over bumps", map: yesIsConcern("service_recommended") },
  ] },
  { id: "R24", label: "Frame / underside / exhaust", group: "BRAKES, CHASSIS & OTHER", category: "brakes_chassis", constituents: [
    { key: "underbody.frame_rust", label: "Frame rust", map: options({ None: "none", "Surface rust (minor)": "monitor", "Moderate rust": "service_recommended", "Severe/structural rust": "urgent" }), next: "Have the frame professionally assessed before driving." },
    { key: "underbody.visible_fluid_leak", label: "Underside leak", map: yesIsConcern("service_recommended") },
    { key: "underbody.exhaust_condition", label: "Exhaust", map: options({ Good: "none", "Surface rust (normal)": "none", "Holes/cracks": "service_recommended", "Missing sections": "service_recommended" }), next: "Repair the exhaust; leaks can let fumes into the cabin." },
  ] },
  { id: "R25", label: "Modifications / other concerns", group: "BRAKES, CHASSIS & OTHER", category: "brakes_chassis", constituents: [
    { key: "modifications.present", label: "Aftermarket modifications", map: recordedOnly },
  ] },
];

const NEXT_BY_ACTION: Record<ActionLevel, (label: string) => string> = {
  none: () => "No action indicated.",
  monitor: (label) => `Note the ${label.toLowerCase()} and recheck at the next service.`,
  service_recommended: (label) => `Have the ${label.toLowerCase()} assessed and repaired as needed.`,
  urgent: (label) => `Have the ${label.toLowerCase()} assessed before relying on the vehicle.`,
};

const SIGNIFICANCE_BY_ACTION: Record<ActionLevel, string> = {
  none: "",
  monitor: "A low-level concern worth noting.",
  service_recommended: "A condition that warrants service or assessment.",
  urgent: "A condition that needs prompt attention.",
};

function checklistFindings(facts: InspectionFactsV2, bodyDrafts: Draft[]): { rows: ChecklistRow[]; drafts: Draft[]; limitations: Limitation[] } {
  const rows: ChecklistRow[] = [];
  const drafts: Draft[] = [];
  const limitations: Limitation[] = [];

  CHECKLIST_ROWS.forEach((row, rowIndex) => {
    const rowDrafts: Draft[] = [];
    const states: ObservationState[] = [];
    const missing: string[] = [];
    const sourceIds: string[] = [];

    if (row.id === "R15") {
      const diagnostics = facts.diagnostics;
      const scanNotes = facts.checks["diagnostics.scan_notes"];
      if (scanNotes) sourceIds.push(scanNotes.fact_id);
      if (diagnostics?.present) {
        sourceIds.push("diagnostics.obd_snapshot");
        states.push("observed");
        const codes = [...diagnostics.stored_dtcs, ...diagnostics.pending_dtcs, ...diagnostics.permanent_dtcs];
        if (codes.length || diagnostics.mil_on) {
          rowDrafts.push({
            finding_id: `CHECK-R15:diagnostics.obd_snapshot`,
            category: row.category,
            corners: [],
            panels: [],
            row_id: row.id,
            title: "Diagnostic trouble codes",
            observation: codes.length
              ? `Scan reported ${codes.join(", ")}${diagnostics.mil_on ? "; MIL on" : ""}.`
              : "The malfunction indicator (MIL) was reported on.",
            significance: "Stored or pending codes indicate a fault the vehicle has detected.",
            next_step: "Have the reported codes diagnosed.",
            action: "service_recommended",
            origin: "deterministic_rule",
            rule_id: "CHECK-R15",
            fact_ids: ["diagnostics.obd_snapshot"],
            evidence_ids: [],
            certainty: "confirmed",
            review_state: "accepted",
            sort: 2000 + rowIndex,
          });
        }
        if (diagnostics.incomplete_monitor_count > 0) {
          limitations.push({ key: "diagnostics.monitors", category: row.category, text: `${diagnostics.incomplete_monitor_count} emissions readiness monitor(s) not complete.` });
        }
      } else if (scanNotes && scanNotes.observation_state === "observed") {
        // Free-text scan notes without a scan record cannot establish "no codes".
        states.push("unable_to_assess");
        limitations.push({ key: "diagnostics.scan_notes", category: row.category, text: "Scan notes were recorded without an attached scan; see full findings." });
      } else {
        states.push("not_inspected");
        missing.push("diagnostics.obd_snapshot");
      }
    }

    for (const constituent of row.constituents) {
      const fact = facts.checks[constituent.key];
      if (!fact) continue;
      sourceIds.push(fact.fact_id);
      if (fact.observation_state !== "observed") {
        states.push(fact.observation_state);
        if (fact.required || fact.observation_state === "not_recorded") missing.push(fact.fact_id);
        continue;
      }
      const answer = fact.value?.answer ?? "";
      const outcome = constituent.map(answer, facts);
      if (!outcome) {
        states.push("unable_to_assess");
        limitations.push({ key: fact.fact_id, category: row.category, text: `${constituent.label}: unrecognized answer “${answer}”.` });
        continue;
      }
      if ("state" in outcome) {
        states.push(outcome.state);
        if (outcome.state === "unable_to_assess") {
          missing.push(fact.fact_id);
          limitations.push({ key: fact.fact_id, category: row.category, text: `${constituent.label} could not be checked.` });
        }
        continue;
      }
      states.push("observed");
      if (outcome.action !== "none") {
        rowDrafts.push({
          finding_id: `CHECK-${row.id}:${fact.fact_id}`,
          category: row.category,
          corners: [],
          panels: [],
          row_id: row.id,
          title: `${constituent.label} - ${answer === "yes" ? "yes" : answer === "no" ? "no" : answer}`,
          observation: `${constituent.label}: ${answer === "yes" ? "Yes" : answer === "no" ? "No" : answer}.`,
          significance: SIGNIFICANCE_BY_ACTION[outcome.action],
          next_step: constituent.next ?? NEXT_BY_ACTION[outcome.action](constituent.label),
          action: outcome.action,
          origin: "deterministic_rule",
          rule_id: `CHECK-${row.id}`,
          fact_ids: [fact.fact_id],
          evidence_ids: fact.evidence_ids,
          certainty: "confirmed",
          review_state: "accepted",
          sort: 2000 + rowIndex,
        });
      }
    }

    // Structured body facts roll up into R02.
    const extraIds: string[] = [];
    if (row.id === "R02") {
      for (const panel of BODY_PANELS) {
        const fact = facts.body[panel];
        if (fact.observation_state === "outside_scope") continue;
        if (fact.source_answer_ids.length === 0 && fact.observation_state === "not_recorded") continue;
        sourceIds.push(fact.fact_id);
        states.push(fact.observation_state);
        if (fact.required && fact.observation_state !== "observed" && fact.observation_state !== "not_applicable") missing.push(fact.fact_id);
      }
      extraIds.push(...bodyDrafts.map((draft) => draft.finding_id));
    }

    const actions = [...rowDrafts.map((draft) => draft.action), ...(row.id === "R02" ? bodyDrafts.map((draft) => draft.action) : [])];
    const action = maxAction(actions);
    const observedCount = states.filter((state) => state === "observed" || state === "not_applicable").length;
    const completeness: Completeness =
      states.length > 0 && states.every((state) => state === "outside_scope")
        ? "outside_scope"
        : observedCount === 0
          ? "not_assessed"
          : missing.length > 0
            ? "partial"
            : "complete";
    rows.push({
      row_id: row.id,
      label: row.label,
      group: row.group,
      source_fact_ids: sourceIds,
      action_level: action,
      inspection_completeness: completeness,
      missing_fact_ids: missing,
      finding_ids: [...rowDrafts.map((draft) => draft.finding_id), ...extraIds],
      status: action !== "none" ? statusFromAction(action) : completeness === "complete" ? "checked" : noActionStatus(states),
    });
    drafts.push(...rowDrafts);
  });

  return { rows, drafts, limitations };
}

// ---------------------------------------------------------------------------
// Limitations and evidence
// ---------------------------------------------------------------------------

function tireLimitations(facts: InspectionFactsV2): Limitation[] {
  const limitations: Limitation[] = [];
  const unavailableCategory: Category = facts.scope === "dents_tires" ? "unavailable_measurements" : "tires_wheels";
  for (const corner of CORNERS) {
    const tire = facts.tires[corner];
    const hyphen = hyphenCorner(corner);
    for (const [fact, label] of [
      [tire.tread, "tread"],
      [tire.pressure, "pressure"],
    ] as const) {
      if (!isObserved(fact)) {
        const reason = reasonText(fact);
        limitations.push({
          key: fact.fact_id,
          category: unavailableCategory,
          text: `${hyphen[0].toUpperCase()}${hyphen.slice(1)} ${label} was not measured${reason ? ` (${reason})` : ""}.`,
        });
      }
    }
    for (const [fact, label] of [
      [tire.sidewall, "sidewall markings"],
      [tire.dot_date, "DOT date"],
      [tire.cracking, "cracking"],
      [tire.wear, "wear"],
      [tire.damage, "tire damage"],
      [facts.wheels[corner].damage, "wheel damage"],
    ] as const) {
      if (fact.observation_state === "unable_to_assess") {
        limitations.push({
          key: fact.fact_id,
          category: unavailableCategory,
          text: `${hyphen[0].toUpperCase()}${hyphen.slice(1)} ${label}: ${reasonText(fact) || "unable to assess"}.`,
        });
      }
    }
  }
  if (!isObserved(facts.placard)) {
    limitations.push({
      key: facts.placard.fact_id,
      category: facts.scope === "dents_tires" ? "fitment" : "tires_wheels",
      text: `Tire placard ${facts.placard.observation_state === "not_recorded" ? "was not recorded" : `unavailable${reasonText(facts.placard) ? ` (${reasonText(facts.placard)})` : ""}`}; fitment could not be verified.`,
    });
  }
  for (const panel of BODY_PANELS) {
    const fact = facts.body[panel];
    if (fact.observation_state === "unable_to_assess" || (fact.required && fact.observation_state === "not_inspected")) {
      limitations.push({
        key: fact.fact_id,
        category: facts.scope === "dents_tires" ? "body" : "body_exterior",
        text: `${PANEL_LABELS[panel]} not inspected${reasonText(fact) ? ` (${reasonText(fact)})` : ""}.`,
      });
    }
  }
  return limitations;
}

function evidence(facts: InspectionFactsV2): EvidenceCompleteness {
  const expected: Fact<unknown>[] = [facts.placard];
  for (const corner of CORNERS) {
    const tire = facts.tires[corner];
    expected.push(tire.sidewall, tire.tread);
    if ((tire.damage.value?.defects ?? []).length) expected.push(tire.damage);
    if ((facts.wheels[corner].damage.value?.defects ?? []).length) expected.push(facts.wheels[corner].damage);
  }
  for (const panel of BODY_PANELS) {
    if ((facts.body[panel].value as PanelValue | null)?.condition === "damage_present") expected.push(facts.body[panel]);
  }
  const relevant = expected.filter((fact) => fact.observation_state === "observed" && fact.source_kind !== "legacy_answer");
  const available = relevant.filter((fact) => fact.evidence_ids.length > 0);
  const exceptions = relevant.filter((fact) => fact.evidence_ids.length === 0 && fact.evidence_exception);
  const missing = relevant.filter((fact) => fact.evidence_ids.length === 0 && !fact.evidence_exception);
  return {
    expected: relevant.length,
    available: available.length,
    exceptions: exceptions.length,
    missing: missing.map((fact) => ({ fact_id: fact.fact_id, label: fact.prompt ?? fact.fact_id })),
    photos_total: facts.media.filter((media) => media.media_type === "image").length,
    videos_total: facts.media.filter((media) => media.media_type !== "image").length,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function evaluateInspection(facts: InspectionFactsV2, options?: { inspectionDate?: Date }): InspectionAssessment {
  const inspectionDate = options?.inspectionDate
    ?? (facts.submission.submitted_at ? new Date(facts.submission.submitted_at) : new Date());

  const tireDrafts = CORNERS.flatMap((corner) => tireFindings(facts, corner, inspectionDate));
  const bodyDrafts = bodyFindings(facts);
  const checklist = facts.scope === "complete"
    ? checklistFindings(facts, bodyDrafts)
    : { rows: [], drafts: [], limitations: [] };

  const ordered = [...tireDrafts, ...bodyDrafts, ...checklist.drafts].sort(
    (a, b) => a.sort - b.sort || actionRank(b.action) - actionRank(a.action),
  );

  let tireRef = 0;
  let bodyRef = 0;
  let noteRef = 0;
  const findings: Finding[] = ordered.map(({ sort, ...draft }) => {
    void sort;
    const ref =
      draft.row_id && draft.panels.length === 0 && draft.corners.length === 0
        ? `C${draft.row_id.slice(1)}`
        : draft.panels.length > 0
          ? `B${++bodyRef}`
          : draft.corners.length > 0
            ? `T${++tireRef}`
            : `N${++noteRef}`;
    return { ...draft, ref };
  });

  const tires = Object.fromEntries(
    CORNERS.map((corner) => [corner, tireCard(facts, corner, tireDrafts, inspectionDate)]),
  ) as Record<Corner, TireCard>;

  return {
    rules_version: RULES_VERSION,
    findings,
    checklist: checklist.rows,
    tires,
    limitations: [...tireLimitations(facts), ...checklist.limitations],
    evidence: evidence(facts),
  };
}
