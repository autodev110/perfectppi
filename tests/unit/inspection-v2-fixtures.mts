import { buildInspectionFacts, type FactsInputSection } from "../../src/features/ppi/inspection-facts.ts";
import { catalogQuestions } from "../../src/features/ppi/inspection-catalog.ts";
import { getSectionOrder } from "../../src/features/ppi/constants.ts";
import type { InspectionScope } from "../../src/types/enums.ts";

// Shared builders for the report-redesign tests. Everything here is fictional.

export const INSPECTION_DATE = "2026-09-22T14:24:00.000Z";

type Observations = Record<string, unknown>;

export function observed(value: unknown) {
  return { v: 1, state: "observed", value, reason: null, source: "inspector_entry" };
}

export function unavailable(code = "no_gauge", explanation?: string) {
  return { v: 1, state: "unable_to_assess", value: null, reason: { code, explanation: explanation ?? null }, source: "inspector_entry" };
}

/** A fully clean wheel card for one corner. */
export function cleanCorner(corner: string, overrides: Observations = {}): Observations {
  return {
    [`tires.${corner}.sidewall`]: observed({ raw: "225/50R17 98V", size: "225/50R17", load_index: "98", speed_rating: "V" }),
    [`tires.${corner}.dot_date`]: observed({ code: "0224" }),
    [`tires.${corner}.tread`]: observed({ reading: "6", unit: "thirty_seconds_inch", method: "tread_depth_gauge" }),
    [`tires.${corner}.pressure`]: observed({ reading: "34", unit: "psi", context: "cold", method: "pressure_gauge", pressure_loss: "not_tested" }),
    [`tires.${corner}.cracking`]: observed({ level: "none" }),
    [`tires.${corner}.wear`]: observed({ level: "even" }),
    [`tires.${corner}.damage`]: observed({ none_observed: true }),
    [`wheels.${corner}.damage`]: observed({ none_observed: true }),
    ...overrides,
  };
}

export const PLACARD = observed({
  front: { size: "225/50R17", pressure: "34", unit: "psi" },
  rear: { size: "225/50R17", pressure: "34", unit: "psi" },
  load_index: "98",
  speed_rating: "V",
  location: "driver_door_jamb",
});

export function cleanObservations(scope: InspectionScope): Observations {
  const panels: Observations = {};
  for (const section of getSectionOrder(scope)) {
    for (const question of catalogQuestions(scope, section, 2)) {
      if (question.answerType === "panel_condition" && question.isRequired) {
        panels[question.questionKey] = observed({ condition: "no_visible_damage" });
      }
    }
  }
  return {
    "tires.placard": PLACARD,
    ...cleanCorner("front_left"),
    ...cleanCorner("front_right"),
    ...cleanCorner("rear_left"),
    ...cleanCorner("rear_right"),
    ...panels,
  };
}

/** Clean answers for Complete's non-tire questions, favourable polarity. */
export const COMPLETE_CLEAN_ANSWERS: Record<string, string> = {
  "vehicle.vin_confirmation": "1HGCV1F30LA000001",
  "vehicle.odometer": "48210",
  "vehicle.keys_count": "2",
  "vehicle.title_status": "Clean",
  "vehicle.history_accidents_reported": "no",
  "exterior.paint_condition": "Good",
  "exterior.body_rust_present": "no",
  "exterior.windshield_condition": "No damage",
  "exterior.panel_mismatch_or_repaint": "no",
  "exterior.lamp_lens_condition": "Clear and intact",
  "interior.overall_condition": "Good",
  "interior.seat_damage_present": "no",
  "interior.unusual_odor": "no",
  "interior.power_seat_operation": "yes",
  "interior.carpet_mats_condition": "Good",
  "road_test.smooth_start": "yes",
  "road_test.smooth_shifts": "yes",
  "road_test.highway_vibration": "no",
  "road_test.straight_line_braking": "yes",
  "road_test.unusual_noise": "no",
  "dashboard.warning_lights_present": "no",
  "dashboard.check_engine_light": "no",
  "dashboard.abs_traction_warning": "no",
  "engine_bay.visible_fluid_leak": "no",
  "engine_bay.drive_belt_condition": "Good",
  "engine_bay.idle_noise": "no",
  "engine_bay.battery_terminal_corrosion": "no",
  "engine_bay.coolant_leak_signs": "no",
  "fluids.engine_oil_condition": "Clean (amber)",
  "fluids.coolant_level": "Full",
  "fluids.brake_fluid_color": "Amber (ok)",
  "fluids.transmission_fluid_condition": "Pink/clear (good)",
  "fluids.power_steering_level": "Not applicable (electric steering)",
  "brakes.pad_life_estimate": "50–75%",
  "brakes.visible_rotor_condition": "Good",
  "steering.play_or_looseness": "no",
  "suspension.bounce_test": "Firm (good shocks)",
  "suspension.noise_over_bumps": "no",
  "steering.pulls_to_side": "no",
  "underbody.frame_rust": "None",
  "underbody.visible_fluid_leak": "no",
  "underbody.exhaust_condition": "Good",
  "electrical.exterior_lights_operation": "yes",
  "electrical.windows_operation": "yes",
  "electrical.ac_operation": "yes",
  "electrical.heater_operation": "yes",
  "electrical.infotainment_operation": "yes",
  "electrical.door_locks_operation": "yes",
  "modifications.present": "no",
};

/** Seeds catalog-2 sections exactly as createSubmission would, then fills them. */
export function v2Sections(
  scope: InspectionScope,
  observations: Observations,
  answers: Record<string, string> = {},
  media: Record<string, number> = {},
): FactsInputSection[] {
  let answerCounter = 0;
  let mediaCounter = 0;
  return getSectionOrder(scope).map((sectionType) => {
    const questions = catalogQuestions(scope, sectionType, 2);
    const rows = questions.map((question) => ({
      id: `answer-${++answerCounter}`,
      prompt: question.prompt,
      question_key: question.questionKey,
      answer_type: question.answerType,
      answer_value: answers[question.questionKey] ?? null,
      observation: observations[question.questionKey] ?? null,
      is_required: question.isRequired,
    }));
    const sectionMedia = rows.flatMap((row) =>
      Array.from({ length: media[row.question_key] ?? 0 }, () => ({
        id: `media-${++mediaCounter}`,
        ppi_answer_id: row.id,
        url: `r2-private:///ppi_media/test/${mediaCounter}.jpg`,
        media_type: "image",
        caption: null,
        captured_at: INSPECTION_DATE,
        uploaded_at: INSPECTION_DATE,
      })),
    );
    return { section_type: sectionType, notes: null, answers: rows, media: sectionMedia };
  });
}

export function buildFacts(
  scope: InspectionScope,
  sections: FactsInputSection[],
  options: { mode?: "technician" | "self"; catalogVersion?: number } = {},
) {
  return buildInspectionFacts({
    scope,
    catalogVersion: options.catalogVersion ?? 2,
    performerMode: options.mode ?? "technician",
    inspectorName: "Jordan Lee",
    submission: { id: "sub-1", version: 1, submitted_at: INSPECTION_DATE },
    vehicle: {
      year: 2021,
      make: "Sample",
      model: "Touring Sedan",
      trim: null,
      vin: "1HGCV1F30LA000001",
      mileage: 48210,
      mileage_unit: "mi",
      body_class: "Sedan",
    },
    certification: null,
    sections,
  });
}
