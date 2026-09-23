import { z } from "zod";
import {
  DECIMAL_PATTERN,
  READING_BOUNDS,
  readingWithinBounds,
  parseDotCode,
  formatTread,
  formatPressure,
  type TreadUnit,
  type PressureUnit,
} from "./inspection-units.ts";
import { BODY_DIAGRAM_VIEW, markerOnPanel } from "./body-diagram.ts";

// ============================================================================
// Typed inspection observations (catalog v2).
//
// A structured answer row keeps its semantic `question_key` and a validated
// `observation` document. `answer_value` becomes a derived plain-text summary
// so older consumers keep reading something sensible. Every rule, report and
// coverage decision reads the observation, never the summary.
//
// Contract: docs/perfectppi-report-handoff/docs/inspection-report-redesign/
// 05-developer-handoff.md §3–4 and 06-field-map-and-rules.md §2–4.
// ============================================================================

export const LEGACY_CATALOG_VERSION = 1;
export const V2_CATALOG_VERSION = 2;

export const CORNERS = ["front_left", "front_right", "rear_left", "rear_right"] as const;
export type Corner = (typeof CORNERS)[number];

/** The physical walk-around. Storage and the report stay in CORNERS order. */
export const CAPTURE_CORNER_ORDER: readonly Corner[] = [
  "front_left",
  "rear_left",
  "rear_right",
  "front_right",
];

/** Left/right are the vehicle's, as seen from the driver's seat. */
export const CORNER_LABELS: Record<Corner, string> = {
  front_left: "Front left",
  front_right: "Front right",
  rear_left: "Rear left",
  rear_right: "Rear right",
};

export const CORNER_SHORT_LABELS: Record<Corner, string> = {
  front_left: "FL",
  front_right: "FR",
  rear_left: "RL",
  rear_right: "RR",
};

export function cornerAxle(corner: Corner): "front" | "rear" {
  return corner.startsWith("front") ? "front" : "rear";
}

export const BODY_PANELS = [
  "hood",
  "roof",
  "trunk_tailgate",
  "front_bumper",
  "rear_bumper",
  "left_front_fender",
  "right_front_fender",
  "left_front_door",
  "right_front_door",
  "left_rear_door",
  "right_rear_door",
  "left_rear_quarter",
  "right_rear_quarter",
  "left_rocker",
  "right_rocker",
  "other_body_panel",
] as const;
export type BodyPanel = (typeof BODY_PANELS)[number];

export const PANEL_LABELS: Record<BodyPanel, string> = {
  hood: "Hood",
  roof: "Roof",
  trunk_tailgate: "Trunk / tailgate",
  front_bumper: "Front bumper",
  rear_bumper: "Rear bumper",
  left_front_fender: "Left front fender",
  right_front_fender: "Right front fender",
  left_front_door: "Left front door",
  right_front_door: "Right front door",
  left_rear_door: "Left rear door",
  right_rear_door: "Right rear door",
  left_rear_quarter: "Left rear quarter panel",
  right_rear_quarter: "Right rear quarter panel",
  left_rocker: "Left rocker panel",
  right_rocker: "Right rocker panel",
  other_body_panel: "Other body panel",
};

/** Dents & Tires never inspects bumpers (inspection and coverage exclusion). */
export const DENTS_TIRES_EXCLUDED_PANELS: readonly BodyPanel[] = ["front_bumper", "rear_bumper"];

export const STRUCTURED_ANSWER_TYPES = [
  "measurement",
  "tire_markings",
  "dot_code",
  "condition_scale",
  "defect_list",
  "tire_placard",
  "panel_condition",
] as const;
export type StructuredAnswerType = (typeof STRUCTURED_ANSWER_TYPES)[number];

export function isStructuredAnswerType(value: string): value is StructuredAnswerType {
  return (STRUCTURED_ANSWER_TYPES as readonly string[]).includes(value);
}

/** States an inspector can record. */
export const INSPECTOR_OBSERVATION_STATES = [
  "observed",
  "unable_to_assess",
  "not_inspected",
  "not_applicable",
] as const;
export type InspectorObservationState = (typeof INSPECTOR_OBSERVATION_STATES)[number];

/**
 * `outside_scope` comes only from the product catalog and `not_recorded` only
 * from the historical adapter; neither is selectable to skip a required check.
 */
export type ObservationState = InspectorObservationState | "outside_scope" | "not_recorded";

export const EXCEPTION_REASON_CODES = [
  "no_gauge",
  "inaccessible",
  "unsafe_access",
  "unreadable",
  "missing_label",
  "not_equipped",
  "vehicle_configuration",
  "weather_or_lighting",
  "other",
] as const;
export type ExceptionReasonCode = (typeof EXCEPTION_REASON_CODES)[number];

/** Not applicable needs an applicability reason, never a missing tool. */
export const NOT_APPLICABLE_REASON_CODES: readonly ExceptionReasonCode[] = [
  "not_equipped",
  "vehicle_configuration",
];

export const REASON_LABELS: Record<ExceptionReasonCode, string> = {
  no_gauge: "No gauge available",
  inaccessible: "Not accessible",
  unsafe_access: "Unsafe to access",
  unreadable: "Not readable",
  missing_label: "Label missing",
  not_equipped: "Not equipped on this vehicle",
  vehicle_configuration: "Does not exist on this body style",
  weather_or_lighting: "Weather or lighting prevented it",
  other: "Other reason",
};

// ---------------------------------------------------------------------------
// Semantic keys
// ---------------------------------------------------------------------------

export type StructuredFamily =
  | "tire_placard"
  | "tire_sidewall"
  | "tire_dot"
  | "tire_tread"
  | "tire_pressure"
  | "tire_cracking"
  | "tire_wear"
  | "tire_damage"
  | "wheel_damage"
  | "brake_pad"
  | "battery_test"
  | "body_panel";

export type StructuredKeyInfo =
  | { family: "tire_placard" | "battery_test" }
  | {
      family:
        | "tire_sidewall"
        | "tire_dot"
        | "tire_tread"
        | "tire_pressure"
        | "tire_cracking"
        | "tire_wear"
        | "tire_damage"
        | "wheel_damage"
        | "brake_pad";
      corner: Corner;
    }
  | { family: "body_panel"; panel: BodyPanel };

const TIRE_SUFFIX_FAMILY: Record<string, StructuredFamily> = {
  sidewall: "tire_sidewall",
  dot_date: "tire_dot",
  tread: "tire_tread",
  pressure: "tire_pressure",
  cracking: "tire_cracking",
  wear: "tire_wear",
  damage: "tire_damage",
};

export function parseStructuredKey(key: string): StructuredKeyInfo | null {
  if (key === "tires.placard") return { family: "tire_placard" };
  if (key === "battery.test") return { family: "battery_test" };
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  const [root, middle, leaf] = parts;
  if (root === "tires" && (CORNERS as readonly string[]).includes(middle)) {
    const family = TIRE_SUFFIX_FAMILY[leaf];
    if (!family) return null;
    return { family, corner: middle as Corner } as StructuredKeyInfo;
  }
  if (root === "wheels" && leaf === "damage" && (CORNERS as readonly string[]).includes(middle)) {
    return { family: "wheel_damage", corner: middle as Corner };
  }
  if (root === "brakes" && leaf === "pad_thickness" && (CORNERS as readonly string[]).includes(middle)) {
    return { family: "brake_pad", corner: middle as Corner };
  }
  if (root === "body" && leaf === "condition" && (BODY_PANELS as readonly string[]).includes(middle)) {
    return { family: "body_panel", panel: middle as BodyPanel };
  }
  return null;
}

export const FAMILY_ANSWER_TYPE: Record<StructuredFamily, StructuredAnswerType> = {
  tire_placard: "tire_placard",
  tire_sidewall: "tire_markings",
  tire_dot: "dot_code",
  tire_tread: "measurement",
  tire_pressure: "measurement",
  tire_cracking: "condition_scale",
  tire_wear: "condition_scale",
  tire_damage: "defect_list",
  wheel_damage: "defect_list",
  brake_pad: "measurement",
  battery_test: "measurement",
  body_panel: "panel_condition",
};

// ---------------------------------------------------------------------------
// Controlled vocabularies
// ---------------------------------------------------------------------------

export const CRACKING_LEVELS = ["none", "starting", "significant", "severe"] as const;
export type CrackingLevel = (typeof CRACKING_LEVELS)[number];
export const WEAR_LEVELS = ["even", "uneven_monitor", "severe_uneven"] as const;
export type WearLevel = (typeof WEAR_LEVELS)[number];
export const WEAR_PATTERNS = [
  "inner_edge",
  "outer_edge",
  "center",
  "both_shoulders",
  "cupping",
  "patchy",
  "other",
] as const;

export const SCALE_LABELS: Record<string, string> = {
  none: "None",
  starting: "Starting",
  significant: "Significant",
  severe: "Severe",
  even: "Even",
  uneven_monitor: "Mild uneven",
  severe_uneven: "Severe uneven",
};

/** Rubric shown next to each choice; observable condition, never inferred from age. */
export const CRACKING_RUBRIC: Record<CrackingLevel, string> = {
  none: "No visible cracking on the sidewall or between tread blocks.",
  starting: "Fine, shallow surface cracks. Worth noting; not by itself a replacement.",
  significant: "Many or wider cracks across the sidewall or tread grooves. Replacement recommended.",
  severe: "Deep or extensive cracking, possibly into the rubber structure. Replace before driving further.",
};

export const WEAR_RUBRIC: Record<WearLevel, string> = {
  even: "Tread depth looks consistent across the width of the tire.",
  uneven_monitor: "One edge or area is noticeably more worn. Check inflation and alignment.",
  severe_uneven: "Pronounced uneven wear, cupping or bald areas. Needs assessment soon.",
};

export const TIRE_DEFECT_TYPES = [
  "puncture",
  "foreign_object",
  "cut",
  "missing_rubber",
  "bulge",
  "exposed_cords",
  "suspected_separation",
  "other",
] as const;
export type TireDefectType = (typeof TIRE_DEFECT_TYPES)[number];

export const WHEEL_DEFECT_TYPES = [
  "scratch_curb_rash",
  "gouge_chipped_material",
  "bent",
  "cracked",
  "other",
] as const;
export type WheelDefectType = (typeof WHEEL_DEFECT_TYPES)[number];

export const BODY_DEFECT_TYPES = [
  "dent",
  "scratch",
  "paint_damage",
  "rust",
  "mismatched_repaint",
  "other",
] as const;
export type BodyDefectType = (typeof BODY_DEFECT_TYPES)[number];

export const DEFECT_LABELS: Record<string, string> = {
  puncture: "Puncture",
  foreign_object: "Embedded object (nail, screw)",
  cut: "Cut",
  missing_rubber: "Missing rubber / chunk",
  bulge: "Bulge / bubble",
  exposed_cords: "Exposed cords / wires",
  suspected_separation: "Suspected separation",
  other: "Other",
  scratch_curb_rash: "Scratches / curb rash",
  gouge_chipped_material: "Gouge / chipped material",
  bent: "Bent",
  cracked: "Cracked",
  dent: "Dent",
  scratch: "Scratch",
  paint_damage: "Paint damage",
  rust: "Rust / corrosion",
  mismatched_repaint: "Mismatched / repainted panel",
};

export const TIRE_DEFECT_LOCATIONS = ["tread", "shoulder", "sidewall", "unknown"] as const;
export const DEFECT_CERTAINTY = ["confirmed", "suspected"] as const;
export const BODY_SEVERITIES = ["minor", "moderate", "severe"] as const;

export const TREAD_METHODS = ["tread_depth_gauge", "ruler_or_coin", "other"] as const;
export const PRESSURE_METHODS = ["pressure_gauge", "tpms_display", "other"] as const;
export const PRESSURE_CONTEXTS = ["cold", "warm", "unknown"] as const;
export const PRESSURE_LOSS_STATES = [
  "observed",
  "reported",
  "not_observed_during_test",
  "not_tested",
] as const;
export const BATTERY_RESULTS = ["good", "marginal", "replace", "inconclusive"] as const;

// ---------------------------------------------------------------------------
// Observation documents
// ---------------------------------------------------------------------------

const decimal = z.string({ required_error: "Enter the reading." }).regex(DECIMAL_PATTERN, "Enter a plain number like 5 or 4.5.");

/** An enum whose missing/invalid message tells the inspector what to choose. */
function choice<T extends string>(values: readonly [T, ...T[]] | readonly T[], message: string) {
  return z.enum(values as [T, ...T[]], { errorMap: () => ({ message }) });
}
const shortText = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => shortText(max).optional().nullable();

const reasonSchema = z.object({
  code: z.enum(EXCEPTION_REASON_CODES),
  explanation: optionalText(300),
});

const treadValue = z.object({
  reading: decimal,
  unit: choice(["thirty_seconds_inch", "mm"] as const, "Choose 32nds of an inch or millimetres."),
  method: choice(TREAD_METHODS, "Choose how the tread was measured."),
  positions: z
    .object({ inner: decimal.optional(), center: decimal.optional(), outer: decimal.optional() })
    .optional()
    .nullable(),
});

const pressureValue = z.object({
  reading: decimal,
  unit: choice(["psi", "kpa"] as const, "Choose psi or kPa."),
  context: choice(PRESSURE_CONTEXTS, "Choose whether the tires were cold, warm or you are not sure."),
  method: choice(PRESSURE_METHODS, "Choose what the pressure was measured with."),
  pressure_loss: choice(PRESSURE_LOSS_STATES, "Choose the pressure-loss result.").default("not_tested"),
  recheck: z
    .object({ reading: decimal, minutes_elapsed: decimal })
    .optional()
    .nullable(),
});

const brakePadValue = z.object({
  reading: decimal,
  unit: z.literal("mm"),
  method: z.enum(["caliper_gauge", "visual_estimate_not_measured", "other"]).default("caliper_gauge"),
});

const batteryValue = z.object({
  reading: decimal,
  unit: z.literal("volts"),
  method: choice(["battery_tester", "multimeter", "other"] as const, "Choose the tester used."),
  cca_measured: decimal.optional().nullable(),
  cca_rated: decimal.optional().nullable(),
  result: choice(BATTERY_RESULTS, "Choose the battery test result."),
});

const tireMarkingsValue = z.object({
  raw: optionalText(80),
  size: optionalText(40),
  load_index: z
    .string()
    .trim()
    .regex(/^\d{2,3}(?:\/\d{2,3})?$/, "Load index is a number such as 91 or 121/118.")
    .optional()
    .nullable()
    .or(z.literal("")),
  speed_rating: z
    .string()
    .trim()
    .regex(/^\(?[A-Z]{1,2}\)?$/, "Speed rating is a letter such as H, V, W or Y.")
    .optional()
    .nullable()
    .or(z.literal("")),
  brand: optionalText(40),
  model: optionalText(60),
  extra_marking: optionalText(40),
});

const dotValue = z.object({ code: z.string().regex(/^\d{4}$/, "Enter the four digits, e.g. 0224.") });

const placardAxle = z.object({
  size: optionalText(40),
  pressure: decimal.optional().nullable().or(z.literal("")),
  unit: z.enum(["psi", "kpa"]).default("psi"),
});

const placardValue = z.object({
  front: placardAxle,
  rear: placardAxle,
  load_index: optionalText(12),
  speed_rating: optionalText(6),
  location: z.enum(["driver_door_jamb", "fuel_door", "glove_box", "manual", "other"]).default("driver_door_jamb"),
  /** Manufacturer-approved alternative fitment the inspector documented. */
  documented_alternative: optionalText(200),
});

const tireDefect = z.object({
  id: z.string().regex(/^[a-z0-9-]{4,40}$/),
  type: choice(TIRE_DEFECT_TYPES, "Choose the type of tire damage."),
  location: choice(TIRE_DEFECT_LOCATIONS, "Choose where on the tire.").default("unknown"),
  certainty: choice(DEFECT_CERTAINTY, "Choose whether the damage is confirmed or suspected."),
  structural: z.boolean().optional().nullable(),
  note: optionalText(300),
});

const wheelDefect = z.object({
  id: z.string().regex(/^[a-z0-9-]{4,40}$/),
  type: choice(WHEEL_DEFECT_TYPES, "Choose the type of wheel damage."),
  certainty: choice(DEFECT_CERTAINTY, "Choose whether the damage is confirmed or suspected."),
  note: optionalText(300),
});

const bodyDefect = z.object({
  id: z.string().regex(/^[a-z0-9-]{4,40}$/),
  type: choice(BODY_DEFECT_TYPES, "Choose the type of body damage."),
  severity: choice(BODY_SEVERITIES, "Choose the extent of the damage."),
  structural: z.boolean().optional().nullable(),
  note: optionalText(300),
  /** Optional tap-placed location on the generic top-view diagram. */
  marker: z
    .object({
      view: z.literal(BODY_DIAGRAM_VIEW).default(BODY_DIAGRAM_VIEW),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
    .optional()
    .nullable(),
});

const defectListValue = (defect: z.ZodTypeAny) =>
  z.union([
    z.object({ none_observed: z.literal(true) }),
    z.object({ none_observed: z.literal(false).optional(), defects: z.array(defect).min(1).max(12) }),
  ]);

const panelValue = z.union([
  z.object({ condition: z.literal("no_visible_damage") }),
  z.object({ condition: z.literal("damage_present"), defects: z.array(bodyDefect).min(1).max(12) }),
]);

const scaleValue = (levels: readonly [string, ...string[]]) =>
  z.object({
    level: choice(levels, "Choose one of the levels."),
    patterns: z.array(z.enum(WEAR_PATTERNS)).max(7).optional().nullable(),
  });

function valueSchemaFor(family: StructuredFamily): z.ZodTypeAny {
  switch (family) {
    case "tire_tread":
      return treadValue;
    case "tire_pressure":
      return pressureValue;
    case "brake_pad":
      return brakePadValue;
    case "battery_test":
      return batteryValue;
    case "tire_sidewall":
      return tireMarkingsValue;
    case "tire_dot":
      return dotValue;
    case "tire_cracking":
      return scaleValue(CRACKING_LEVELS);
    case "tire_wear":
      return scaleValue(WEAR_LEVELS);
    case "tire_damage":
      return defectListValue(tireDefect);
    case "wheel_damage":
      return defectListValue(wheelDefect);
    case "tire_placard":
      return placardValue;
    case "body_panel":
      return panelValue;
  }
}

export interface ObservationDocument<V = Record<string, unknown>> {
  v: 1;
  state: InspectorObservationState;
  value: V | null;
  reason: { code: ExceptionReasonCode; explanation?: string | null } | null;
  source: "inspector_entry" | "confirmed_extraction";
  /** Extraction record the inspector accepted or corrected, when used. */
  extraction_id?: string | null;
  /** Why a normally expected photo could not be taken. */
  evidence_exception?: { code: ExceptionReasonCode; explanation?: string | null } | null;
}

const envelope = z.object({
  v: z.literal(1).default(1),
  state: z.enum(INSPECTOR_OBSERVATION_STATES),
  value: z.unknown().optional().nullable(),
  reason: reasonSchema.optional().nullable(),
  source: z.enum(["inspector_entry", "confirmed_extraction"]).default("inspector_entry"),
  extraction_id: z.string().uuid().optional().nullable(),
  evidence_exception: reasonSchema.optional().nullable(),
});

export type ObservationValidation =
  | { ok: true; observation: ObservationDocument }
  | { ok: false; error: string };

function firstIssue(error: z.ZodError): string {
  const issue = error.errors[0];
  return issue?.message ?? "Invalid answer.";
}

/**
 * Validates a structured observation for its semantic key. Measurement bounds,
 * DOT plausibility, exclusive "none observed", and state/value consistency are
 * all checked here; role requirements are checked separately at submission.
 */
export function validateObservation(
  questionKey: string,
  input: unknown,
  options?: { inspectionDate?: Date },
): ObservationValidation {
  const info = parseStructuredKey(questionKey);
  if (!info) return { ok: false, error: "Unknown inspection field." };

  const parsed = envelope.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const doc = parsed.data;

  if (doc.state !== "observed") {
    if (!doc.reason) return { ok: false, error: "Choose a reason." };
    if (doc.reason.code === "other" && !doc.reason.explanation?.trim()) {
      return { ok: false, error: "Explain the reason." };
    }
    if (doc.state === "not_applicable") {
      if (!NOT_APPLICABLE_REASON_CODES.includes(doc.reason.code)) {
        return { ok: false, error: "Not applicable needs an equipment or body-style reason." };
      }
      // A tire that exists always has a tread and a pressure; missing tools make
      // the reading unavailable, not inapplicable.
      if (
        info.family === "tire_tread" ||
        info.family === "tire_pressure" ||
        info.family === "tire_sidewall" ||
        info.family === "tire_cracking" ||
        info.family === "tire_wear" ||
        info.family === "tire_damage" ||
        info.family === "wheel_damage"
      ) {
        return { ok: false, error: "Every tire and wheel applies. Use “Unable to assess” instead." };
      }
    }
    return {
      ok: true,
      observation: {
        v: 1,
        state: doc.state,
        value: null,
        reason: { code: doc.reason.code, explanation: doc.reason.explanation?.trim() || null },
        source: "inspector_entry",
        extraction_id: null,
        evidence_exception: null,
      },
    };
  }

  const valueResult = valueSchemaFor(info.family).safeParse(doc.value ?? null);
  if (!valueResult.success) return { ok: false, error: firstIssue(valueResult.error) };
  const value = valueResult.data as Record<string, unknown>;

  const boundsError = checkBounds(info.family, value);
  if (boundsError) return { ok: false, error: boundsError };

  if (info.family === "body_panel") {
    // A marker is a location on its own panel, never on a neighbouring one.
    const defects = (value.defects ?? []) as { marker?: { x: number; y: number } | null }[];
    if (defects.some((defect) => defect.marker && !markerOnPanel(info.panel, defect.marker))) {
      return { ok: false, error: `Place the marker on the ${PANEL_LABELS[info.panel].toLowerCase()} in the diagram.` };
    }
  }

  if (info.family === "tire_dot") {
    const dot = parseDotCode(String(value.code), options?.inspectionDate ?? new Date());
    if (!dot.ok) {
      return {
        ok: false,
        error:
          dot.error === "future"
            ? "That date code is after the inspection date. Check the four digits."
            : "The first two digits are the week (01–53).",
      };
    }
  }

  if (info.family === "tire_sidewall") {
    const markings = value as { raw?: string | null; size?: string | null };
    if (!markings.raw?.trim() && !markings.size?.trim()) {
      return { ok: false, error: "Enter the tire size or the full sidewall text, or mark it unreadable." };
    }
  }

  if (info.family === "tire_placard") {
    const placard = value as { front: { size?: string | null }; rear: { size?: string | null } };
    if (!placard.front.size?.trim() && !placard.rear.size?.trim()) {
      return { ok: false, error: "Enter the placard tire size, or mark the placard unreadable." };
    }
  }

  if (doc.source === "confirmed_extraction" && !doc.extraction_id) {
    return { ok: false, error: "Confirmed photo readings must reference their extraction." };
  }

  return {
    ok: true,
    observation: {
      v: 1,
      state: "observed",
      value: stripEmpty(value),
      reason: null,
      source: doc.source,
      extraction_id: doc.source === "confirmed_extraction" ? doc.extraction_id ?? null : null,
      evidence_exception: doc.evidence_exception
        ? {
            code: doc.evidence_exception.code,
            explanation: doc.evidence_exception.explanation?.trim() || null,
          }
        : null,
    },
  };
}

function stripEmpty(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === "" || entry === undefined) continue;
    out[key] =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? stripEmpty(entry as Record<string, unknown>)
        : entry;
  }
  return out;
}

function checkBounds(family: StructuredFamily, value: Record<string, unknown>): string | null {
  const readingKey =
    family === "tire_tread"
      ? "tread"
      : family === "tire_pressure"
        ? "pressure"
        : family === "brake_pad"
          ? "brake_pad"
          : family === "battery_test"
            ? "battery"
            : null;
  if (!readingKey) return null;
  const bounds = READING_BOUNDS[`${readingKey}:${value.unit}`];
  if (!bounds) return "Choose a unit.";
  const readings = [String(value.reading)];
  const positions = value.positions as Record<string, string | undefined> | null | undefined;
  if (positions) {
    for (const reading of Object.values(positions)) if (reading) readings.push(reading);
  }
  const recheck = value.recheck as { reading?: string } | null | undefined;
  if (recheck?.reading) readings.push(recheck.reading);
  for (const reading of readings) {
    if (!readingWithinBounds(reading, bounds)) {
      return `Enter a reading from ${bounds.min} to ${bounds.max}.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Role requirements and photo evidence
// ---------------------------------------------------------------------------

export type PerformerMode = "technician" | "self";

/**
 * Technicians must enter measured tread and pressure. Self-inspectors must
 * still answer each one, but may record an explicit unavailable reason, which
 * the report discloses as a limitation and never shows as measured or green.
 */
export function requirementError(
  questionKey: string,
  observation: ObservationDocument | null,
  input: { required: boolean; performerMode: PerformerMode },
): string | null {
  const info = parseStructuredKey(questionKey);
  if (!info) return null;
  if (!observation) return input.required ? "This check needs an answer." : null;
  if (input.required && observation.state === "not_inspected") {
    return "Required checks need a result or an “Unable to assess” reason.";
  }
  const measuredOnly = info.family === "tire_tread" || info.family === "tire_pressure";
  if (measuredOnly && input.performerMode === "technician" && observation.state !== "observed") {
    return info.family === "tire_tread"
      ? "Technicians must enter a measured tread depth."
      : "Technicians must enter a measured tire pressure.";
  }
  return null;
}

/** Whether a structured answer still needs a photo attached to be complete. */
export function structuredPhotoRequired(
  questionKey: string,
  observation: ObservationDocument | null,
): boolean {
  const info = parseStructuredKey(questionKey);
  if (!info || !observation || observation.state !== "observed") return false;
  if (observation.evidence_exception) return false;
  switch (info.family) {
    case "tire_placard":
    case "tire_sidewall":
    case "tire_tread":
      return true;
    case "tire_damage":
    case "wheel_damage":
      return Array.isArray((observation.value as { defects?: unknown[] } | null)?.defects);
    case "body_panel":
      return (observation.value as { condition?: string } | null)?.condition === "damage_present";
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Display summaries (UI only; the database derives answer_value itself)
// ---------------------------------------------------------------------------

export function observationSummary(questionKey: string, observation: ObservationDocument | null): string {
  if (!observation) return "";
  if (observation.state !== "observed") {
    const reason = observation.reason ? REASON_LABELS[observation.reason.code] : "";
    const label =
      observation.state === "unable_to_assess"
        ? "Unable to assess"
        : observation.state === "not_applicable"
          ? "Not applicable"
          : "Not inspected";
    return reason ? `${label}: ${reason}` : label;
  }
  const info = parseStructuredKey(questionKey);
  const value = (observation.value ?? {}) as Record<string, unknown>;
  switch (info?.family) {
    case "tire_tread":
      return formatTread(String(value.reading), value.unit as TreadUnit);
    case "tire_pressure":
      return `${formatPressure(String(value.reading), value.unit as PressureUnit)} (${value.context})`;
    case "brake_pad":
      return `${value.reading} mm`;
    case "battery_test":
      return `${value.reading} V, ${value.result}`;
    case "tire_sidewall": {
      const service = [value.load_index, value.speed_rating].filter(Boolean).join("");
      return String(value.raw ?? [value.size, service].filter(Boolean).join(" "));
    }
    case "tire_dot":
      return `DOT ${value.code}`;
    case "tire_cracking":
    case "tire_wear":
      return SCALE_LABELS[String(value.level)] ?? String(value.level);
    case "tire_damage":
    case "wheel_damage":
    case "body_panel": {
      const defects = (value.defects as { type: string }[] | undefined) ?? [];
      if (!defects.length) return value.condition === "no_visible_damage" || value.none_observed ? (info?.family === "body_panel" ? "No visible damage" : "None observed") : "";
      return defects.map((defect) => DEFECT_LABELS[defect.type] ?? defect.type).join(", ");
    }
    case "tire_placard": {
      const front = value.front as { size?: string; pressure?: string; unit?: string } | undefined;
      const rear = value.rear as { size?: string; pressure?: string; unit?: string } | undefined;
      const axle = (label: string, axleValue?: { size?: string; pressure?: string; unit?: string }) =>
        axleValue ? `${label} ${[axleValue.size, axleValue.pressure ? `${axleValue.pressure} ${axleValue.unit === "kpa" ? "kPa" : "psi"}` : null].filter(Boolean).join(" ")}` : "";
      return [axle("Front", front), axle("Rear", rear)].filter(Boolean).join("; ");
    }
    default:
      return "";
  }
}

export function parseObservation(input: unknown): ObservationDocument | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<ObservationDocument>;
  if (candidate.v !== 1 || typeof candidate.state !== "string") return null;
  return candidate as ObservationDocument;
}

/** New short, URL-safe id for a defect entry. */
export function newDefectId(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return random.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 36);
}
