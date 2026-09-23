import type { InspectionScope, SectionType } from "@/types/enums";
import { SECTION_QUESTION_TEMPLATES, type QuestionTemplate } from "./constants.ts";
import {
  BODY_PANELS,
  CAPTURE_CORNER_ORDER,
  CORNER_LABELS,
  DENTS_TIRES_EXCLUDED_PANELS,
  PANEL_LABELS,
  V2_CATALOG_VERSION,
  LEGACY_CATALOG_VERSION,
  parseStructuredKey,
  type BodyPanel,
  type Corner,
} from "./inspection-schema.ts";

// ============================================================================
// Versioned question catalogs.
//
// Catalog 1 is the original prompt-keyed question set, kept so existing drafts
// and historical inspections stay interpretable. Catalog 2 adds stable semantic
// keys everywhere, replaces the per-corner tread scalars with grouped wheel
// cards, and replaces free-text body regions with per-panel condition.
// ============================================================================

export type CatalogVersion = typeof LEGACY_CATALOG_VERSION | typeof V2_CATALOG_VERSION;

export interface CatalogQuestion extends QuestionTemplate {
  questionKey: string;
}

// ---------------------------------------------------------------------------
// Exact legacy prompts → stable keys (06-field-map-and-rules.md §5–6)
//
// The lookup is by exact historical prompt within a section, never fuzzy or
// positional. A prompt missing from here stays in full detail as an
// unrecognized legacy answer; it is never read as a clean result.
// ---------------------------------------------------------------------------

export const LEGACY_PROMPT_KEYS: Partial<Record<SectionType, Record<string, string>>> = {
  vehicle_basics: {
    "Confirm the VIN on the vehicle": "vehicle.vin_confirmation",
    "Current odometer reading (miles)": "vehicle.odometer",
    "Number of keys included": "vehicle.keys_count",
    "Title status": "vehicle.title_status",
    "Any accidents reported on history report?": "vehicle.history_accidents_reported",
    "Additional notes on vehicle basics": "vehicle.notes",
  },
  exterior: {
    "Overall paint condition": "exterior.paint_condition",
    "Are there any dents or dings?": "exterior.dents_present",
    "Describe any dents, dings, or paint damage": "exterior.damage_notes",
    "Is there any rust visible on the body?": "exterior.body_rust_present",
    "Windshield condition": "exterior.windshield_condition",
    "Are any panels mismatched or repainted?": "exterior.panel_mismatch_or_repaint",
    "Condition of lights and lenses (headlights, taillights)": "exterior.lamp_lens_condition",
  },
  interior: {
    "Overall interior condition": "interior.overall_condition",
    "Are there any rips, tears, or stains on seats?": "interior.seat_damage_present",
    "Describe any interior damage": "interior.damage_notes",
    "Is there any unusual odor (smoke, mold, pets)?": "interior.unusual_odor",
    "Do all power seat adjustments work (if equipped)?": "interior.power_seat_operation",
    "Carpet and floor mat condition": "interior.carpet_mats_condition",
  },
  road_test: {
    "Does the engine start smoothly without hesitation?": "road_test.smooth_start",
    "Does the transmission shift smoothly through all gears?": "road_test.smooth_shifts",
    "Any vibrations at highway speed?": "road_test.highway_vibration",
    "Does the vehicle brake in a straight line without pulling?": "road_test.straight_line_braking",
    "Any unusual noises while driving (clunks, squeals, grinding)?": "road_test.unusual_noise",
    "Describe any drivability concerns observed during the road test": "road_test.drivability_notes",
  },
  dashboard_warnings: {
    "Are any warning lights currently on?": "dashboard.warning_lights_present",
    "Is the check engine light on?": "dashboard.check_engine_light",
    "List all active warning lights (if any)": "dashboard.warning_lights_list",
    "Were DTC codes scanned? List codes if yes.": "diagnostics.scan_notes",
    "Any ABS or traction control warnings?": "dashboard.abs_traction_warning",
  },
  engine_bay: {
    "Are there any visible oil or fluid leaks?": "engine_bay.visible_fluid_leak",
    "Serpentine/drive belt condition": "engine_bay.drive_belt_condition",
    "Are there any unusual noises at idle?": "engine_bay.idle_noise",
    "Describe any engine noises or concerns": "engine_bay.concern_notes",
    "Is there visible corrosion on the battery terminals?": "engine_bay.battery_terminal_corrosion",
    "Any signs of coolant leaks or overheating (white deposits)?": "engine_bay.coolant_leak_signs",
  },
  fluids: {
    "Engine oil condition": "fluids.engine_oil_condition",
    "Coolant level": "fluids.coolant_level",
    "Brake fluid color": "fluids.brake_fluid_color",
    "Transmission fluid condition (if dipstick accessible)": "fluids.transmission_fluid_condition",
    "Power steering fluid level (if applicable)": "fluids.power_steering_level",
  },
  tires_brakes: {
    "Front left tire tread depth (in 32nds of an inch)": "tires.front_left.tread",
    "Front right tire tread depth (in 32nds of an inch)": "tires.front_right.tread",
    "Rear left tire tread depth (in 32nds of an inch)": "tires.rear_left.tread",
    "Rear right tire tread depth (in 32nds of an inch)": "tires.rear_right.tread",
    "Estimated brake pad life remaining": "brakes.pad_life_estimate",
    "Is there any uneven tire wear?": "tires.legacy_uneven_wear",
    "Rotor condition (if visible)": "brakes.visible_rotor_condition",
  },
  suspension_steering: {
    "Is there any play or looseness in the steering wheel?": "steering.play_or_looseness",
    "Bounce test result (push down on each corner)": "suspension.bounce_test",
    "Any clunking or rattling noises over bumps?": "suspension.noise_over_bumps",
    "Describe any suspension or steering concerns": "suspension.concern_notes",
    "Does the vehicle pull to one side?": "steering.pulls_to_side",
  },
  underbody: {
    "Frame rust level": "underbody.frame_rust",
    "Any visible fluid leaks from underneath?": "underbody.visible_fluid_leak",
    "Exhaust system condition": "underbody.exhaust_condition",
    "Describe any underbody concerns": "underbody.concern_notes",
  },
  electrical_controls: {
    "Do all exterior lights work (headlights, brake, reverse, turn signals)?": "electrical.exterior_lights_operation",
    "Do all windows operate correctly?": "electrical.windows_operation",
    "Does the air conditioning blow cold?": "electrical.ac_operation",
    "Does the heater work?": "electrical.heater_operation",
    "Is the infotainment/radio system functional?": "electrical.infotainment_operation",
    "Do all door locks work from the driver switch?": "electrical.door_locks_operation",
    // Older combined wording keeps its combined meaning (R08); it is never split
    // into separate window and lock confirmations.
    "Do all door locks and windows work from the driver switch?": "electrical.legacy_locks_and_windows",
    "Any electrical concerns or malfunctions?": "electrical.concern_notes",
  },
  modifications: {
    "Are there any aftermarket modifications on this vehicle?": "modifications.present",
    "List all modifications (suspension, engine, exhaust, wheels, etc.)": "modifications.list",
    "Additional findings or notes not covered in other sections": "inspection.additional_notes",
  },
  wheels_tires: {
    "Front left tire tread depth (in 32nds of an inch)": "tires.front_left.tread",
    "Front right tire tread depth (in 32nds of an inch)": "tires.front_right.tread",
    "Rear left tire tread depth (in 32nds of an inch)": "tires.rear_left.tread",
    "Rear right tire tread depth (in 32nds of an inch)": "tires.rear_right.tread",
    "Any problems with the rims or tires?": "legacy.wheels_tires.concerns",
  },
  body_damage: {
    "Left front fender — scratches or dents": "body.left_front_fender.condition",
    "Right front fender — scratches or dents": "body.right_front_fender.condition",
    "Hood — scratches or dents": "body.hood.condition",
    "Left door — scratches or dents": "legacy.body.left_door",
    "Right door — scratches or dents": "legacy.body.right_door",
    "Body panels — scratches or dents": "legacy.body.panels",
  },
};

/** Stable key for a stored answer: its own key if set, else the legacy table. */
export function resolveQuestionKey(
  sectionType: string,
  prompt: string,
  storedKey: string | null | undefined,
): string | null {
  if (storedKey) return storedKey;
  return LEGACY_PROMPT_KEYS[sectionType as SectionType]?.[prompt] ?? null;
}

// ---------------------------------------------------------------------------
// Catalog 2 builders
// ---------------------------------------------------------------------------

function wheelCard(corner: Corner): CatalogQuestion[] {
  const label = CORNER_LABELS[corner];
  const lower = label.toLowerCase();
  return [
    {
      questionKey: `tires.${corner}.sidewall`,
      prompt: `Photograph the ${lower} tire sidewall and confirm its markings`,
      answerType: "tire_markings",
      isRequired: true,
      photoPrompt: `Capture the ${lower} tire sidewall`,
    },
    {
      questionKey: `tires.${corner}.dot_date`,
      prompt: `${label} tire: DOT date code (four digits)`,
      answerType: "dot_code",
      isRequired: true,
      photoPrompt: `Capture the ${lower} DOT date code close-up`,
    },
    {
      questionKey: `tires.${corner}.tread`,
      prompt: `Measure the ${lower} tire tread depth`,
      answerType: "measurement",
      isRequired: true,
      photoPrompt: `Capture the ${lower} tread gauge reading`,
    },
    {
      questionKey: `tires.${corner}.pressure`,
      prompt: `Measure the ${lower} tire pressure`,
      answerType: "measurement",
      isRequired: true,
      photoPrompt: `Capture the ${lower} pressure gauge reading`,
    },
    {
      questionKey: `tires.${corner}.cracking`,
      prompt: `${label} tire: visible cracking / dry rot`,
      answerType: "condition_scale",
      isRequired: true,
      photoPrompt: `Capture any ${lower} tire cracking`,
    },
    {
      questionKey: `tires.${corner}.wear`,
      prompt: `${label} tire: tread wear pattern`,
      answerType: "condition_scale",
      isRequired: true,
      photoPrompt: `Capture the ${lower} tread across its width`,
    },
    {
      questionKey: `tires.${corner}.damage`,
      prompt: `${label} tire: damage or foreign objects`,
      answerType: "defect_list",
      isRequired: true,
      photoPrompt: `Capture any ${lower} tire damage`,
    },
    {
      questionKey: `wheels.${corner}.damage`,
      prompt: `${label} wheel / rim damage`,
      answerType: "defect_list",
      isRequired: true,
      photoPrompt: `Capture any ${lower} wheel damage`,
    },
  ];
}

const PLACARD_QUESTION: CatalogQuestion = {
  questionKey: "tires.placard",
  prompt: "Photograph the tire-information placard",
  answerType: "tire_placard",
  isRequired: true,
  photoPrompt: "Capture the tire placard (usually on the driver's door jamb)",
};

function panelQuestion(panel: BodyPanel): CatalogQuestion {
  return {
    questionKey: `body.${panel}.condition`,
    prompt: `${PANEL_LABELS[panel]}: visible condition`,
    answerType: "panel_condition",
    isRequired: true,
    photoPrompt: `Capture any ${PANEL_LABELS[panel].toLowerCase()} damage`,
  };
}

/** Walk-around order for body panels, grouped into capture zones. */
export const BODY_ZONES: { id: string; label: string; panels: BodyPanel[] }[] = [
  { id: "front", label: "Front", panels: ["hood", "front_bumper"] },
  {
    id: "left",
    label: "Left side",
    panels: ["left_front_fender", "left_front_door", "left_rear_door", "left_rear_quarter", "left_rocker"],
  },
  { id: "rear", label: "Rear", panels: ["trunk_tailgate", "rear_bumper"] },
  {
    id: "right",
    label: "Right side",
    panels: ["right_rear_quarter", "right_rear_door", "right_front_door", "right_front_fender", "right_rocker"],
  },
  { id: "top", label: "Roof & other", panels: ["roof", "other_body_panel"] },
];

function bodyPanelQuestions(scope: InspectionScope): CatalogQuestion[] {
  const zoneOrdered = BODY_ZONES.flatMap((zone) => zone.panels);
  // Every canonical panel must appear exactly once in the walk-around.
  if (zoneOrdered.length !== BODY_PANELS.length) {
    throw new Error("Body zones must cover every panel exactly once.");
  }
  return zoneOrdered
    .filter((panel) => scope === "complete" || !DENTS_TIRES_EXCLUDED_PANELS.includes(panel))
    .map((panel) => {
      const question = panelQuestion(panel);
      // "Other body panel" is only answered when something off-map is damaged.
      return panel === "other_body_panel" ? { ...question, isRequired: false } : question;
    });
}

function brakePadQuestions(): CatalogQuestion[] {
  return CAPTURE_CORNER_ORDER.map((corner) => ({
    questionKey: `brakes.${corner}.pad_thickness`,
    prompt: `${CORNER_LABELS[corner]} brake pad thickness (optional measurement)`,
    answerType: "measurement" as const,
    isRequired: false,
  }));
}

const BATTERY_TEST_QUESTION: CatalogQuestion = {
  questionKey: "battery.test",
  prompt: "Battery test result (optional, only if a tester was used)",
  answerType: "measurement",
  isRequired: false,
};

/** Catalog 1 questions with their stable keys attached. */
function keyedLegacy(sectionType: SectionType): CatalogQuestion[] {
  const keys = LEGACY_PROMPT_KEYS[sectionType] ?? {};
  return (SECTION_QUESTION_TEMPLATES[sectionType] ?? []).map((template) => ({
    ...template,
    questionKey: keys[template.prompt] ?? `${sectionType}.question`,
  }));
}

const DROPPED_FROM_V2 = new Set([
  // Replaced by per-panel condition.
  "exterior.dents_present",
  // Replaced by per-corner wheel cards.
  "tires.front_left.tread",
  "tires.front_right.tread",
  "tires.rear_left.tread",
  "tires.rear_right.tread",
  "tires.legacy_uneven_wear",
]);

/**
 * Questions seeded for a section. Catalog 1 reproduces the original templates
 * exactly; catalog 2 is the redesigned capture.
 */
export function catalogQuestions(
  scope: InspectionScope,
  sectionType: SectionType,
  version: CatalogVersion,
): CatalogQuestion[] {
  if (version === LEGACY_CATALOG_VERSION) {
    return keyedLegacy(sectionType);
  }

  const wheels = [PLACARD_QUESTION, ...CAPTURE_CORNER_ORDER.flatMap(wheelCard)];

  if (scope === "dents_tires") {
    if (sectionType === "wheels_tires") return wheels;
    if (sectionType === "body_damage") return bodyPanelQuestions("dents_tires");
    return [];
  }

  const kept = keyedLegacy(sectionType).filter((question) => !DROPPED_FROM_V2.has(question.questionKey));
  switch (sectionType) {
    case "exterior": {
      // Paint and general questions first, then the panel walk-around, then the
      // optional free-text description for anything the panels do not capture.
      const notes = kept.filter((question) => question.questionKey === "exterior.damage_notes");
      const general = kept.filter((question) => question.questionKey !== "exterior.damage_notes");
      return [...general, ...bodyPanelQuestions("complete"), ...notes];
    }
    case "tires_brakes":
      return [...wheels, ...kept, ...brakePadQuestions()];
    case "engine_bay":
      return [...kept, BATTERY_TEST_QUESTION];
    default:
      return kept;
  }
}

// ---------------------------------------------------------------------------
// Capture steps: rows that the UI presents together on one card
// ---------------------------------------------------------------------------

export interface StepGroup {
  id: string;
  label: string;
  kind: "wheel" | "body_zone" | "brake_measurements";
  corner?: Corner;
  zone?: string;
}

const ZONE_BY_PANEL = new Map<BodyPanel, (typeof BODY_ZONES)[number]>(
  BODY_ZONES.flatMap((zone) => zone.panels.map((panel) => [panel, zone] as const)),
);

/** The card a structured row belongs to, or null for a single-question step. */
export function stepGroupForKey(questionKey: string | null | undefined): StepGroup | null {
  if (!questionKey) return null;
  const info = parseStructuredKey(questionKey);
  if (!info) return null;
  if (info.family === "body_panel") {
    const zone = ZONE_BY_PANEL.get(info.panel);
    return zone ? { id: `body:${zone.id}`, label: `Body — ${zone.label.toLowerCase()}`, kind: "body_zone", zone: zone.id } : null;
  }
  if (info.family === "brake_pad") {
    return { id: "brakes:measurements", label: "Brake pad measurements", kind: "brake_measurements" };
  }
  if ("corner" in info) {
    return { id: `wheel:${info.corner}`, label: `${CORNER_LABELS[info.corner]} wheel`, kind: "wheel", corner: info.corner };
  }
  return null;
}
