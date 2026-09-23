import type { InspectionScope } from "@/types/enums";
import { resolveQuestionKey } from "./inspection-catalog.ts";
import {
  BODY_PANELS,
  CORNERS,
  DENTS_TIRES_EXCLUDED_PANELS,
  LEGACY_CATALOG_VERSION,
  parseObservation,
  parseStructuredKey,
  type BodyPanel,
  type Corner,
  type ExceptionReasonCode,
  type ObservationDocument,
  type ObservationState,
  type PerformerMode,
} from "./inspection-schema.ts";

// ============================================================================
// InspectionFactsV2: one normalized, typed view of a submitted inspection.
//
// Built from the frozen answer rows. Catalog-2 rows carry typed observations;
// catalog-1 rows go through the exact-prompt legacy adapter, and anything the
// old catalog never asked becomes `not_recorded` — never a clean result.
// ============================================================================

export const FACTS_SCHEMA_VERSION = "inspection-facts/2";

export type SourceKind = "inspector_entry" | "confirmed_extraction" | "legacy_answer";

export interface Fact<V = Record<string, unknown>> {
  fact_id: string;
  question_key: string;
  source_answer_ids: string[];
  observation_state: ObservationState;
  value: V | null;
  reason: { code: ExceptionReasonCode | "not_recorded" | "outside_scope"; explanation?: string | null } | null;
  source_kind: SourceKind;
  evidence_ids: string[];
  evidence_exception: { code: string; explanation?: string | null } | null;
  /** Original stored text, for traceability and the exhaustive detail. */
  raw: string | null;
  prompt: string | null;
  required: boolean;
}

export interface TireFacts {
  sidewall: Fact<TireMarkings>;
  dot_date: Fact<{ code: string }>;
  tread: Fact<TreadValue>;
  pressure: Fact<PressureValue>;
  cracking: Fact<{ level: string; patterns?: string[] | null }>;
  wear: Fact<{ level: string; patterns?: string[] | null }>;
  damage: Fact<DefectListValue<TireDefect>>;
}

export interface TireMarkings {
  raw?: string | null;
  size?: string | null;
  load_index?: string | null;
  speed_rating?: string | null;
  brand?: string | null;
  model?: string | null;
  extra_marking?: string | null;
}

export interface TreadValue {
  reading: string;
  unit: "thirty_seconds_inch" | "mm";
  method: string;
  positions?: { inner?: string; center?: string; outer?: string } | null;
}

export interface PressureValue {
  reading: string;
  unit: "psi" | "kpa";
  context: "cold" | "warm" | "unknown";
  method: string;
  pressure_loss?: "observed" | "reported" | "not_observed_during_test" | "not_tested";
  recheck?: { reading: string; minutes_elapsed: string } | null;
}

export interface TireDefect {
  id: string;
  type: string;
  location?: string;
  certainty?: "confirmed" | "suspected";
  structural?: boolean | null;
  note?: string | null;
}

export interface BodyDefect {
  id: string;
  type: string;
  severity?: "minor" | "moderate" | "severe";
  structural?: boolean | null;
  note?: string | null;
  marker?: { x: number; y: number } | null;
}

export type DefectListValue<D> = { none_observed?: boolean; defects?: D[] };

export interface PlacardValue {
  front: { size?: string | null; pressure?: string | null; unit?: "psi" | "kpa" };
  rear: { size?: string | null; pressure?: string | null; unit?: "psi" | "kpa" };
  load_index?: string | null;
  speed_rating?: string | null;
  location?: string;
  documented_alternative?: string | null;
}

export interface PanelValue {
  condition?: "no_visible_damage" | "damage_present";
  defects?: BodyDefect[];
  /** Historical free text for a panel the old catalog asked about. */
  legacy_note?: string;
}

export interface MediaFact {
  id: string;
  section_type: string;
  answer_id: string | null;
  question_key: string | null;
  media_type: string;
  caption: string | null;
  captured_at: string | null;
  uploaded_at: string | null;
  url: string;
}

export interface InspectionFactsV2 {
  schema_version: typeof FACTS_SCHEMA_VERSION;
  catalog_version: number;
  scope: InspectionScope;
  submission: {
    id: string;
    version: number;
    submitted_at: string | null;
    revision: number | null;
  };
  inspector: { name: string | null; mode: PerformerMode };
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
    mileage_unit: "mi";
    body_class: string | null;
  };
  certification: {
    certified_at: string;
    text: string;
    text_version: string;
    facts_hash: string;
  } | null;
  placard: Fact<PlacardValue>;
  tires: Record<Corner, TireFacts>;
  wheels: Record<Corner, { damage: Fact<DefectListValue<{ id: string; type: string; certainty?: string; note?: string | null }>> }>;
  brakes: Record<Corner, { pad_thickness: Fact<{ reading: string; unit: "mm"; method: string }> }>;
  battery: Fact<{ reading: string; unit: "volts"; method: string; result: string; cca_measured?: string | null; cca_rated?: string | null }>;
  body: Record<BodyPanel, Fact<PanelValue>>;
  /** Legacy body regions that cannot be placed on a precise panel. */
  legacy_body_notes: Fact<{ note: string; region: string }>[];
  /** Every other keyed answer (Complete checks, notes, legacy aggregates). */
  checks: Record<string, Fact<{ answer: string }>>;
  /** Answers whose exact prompt is not in any known catalog. */
  unrecognized: Fact<{ answer: string }>[];
  section_notes: { section_type: string; notes: string }[];
  media: MediaFact[];
  diagnostics: {
    present: boolean;
    mil_on: boolean | null;
    stored_dtcs: string[];
    pending_dtcs: string[];
    permanent_dtcs: string[];
    incomplete_monitor_count: number;
    vin: string | null;
  } | null;
}

export interface FactsInputAnswer {
  id: string;
  prompt: string;
  question_key?: string | null;
  answer_type: string;
  answer_value: string | null;
  observation?: unknown;
  is_required?: boolean;
}

export interface FactsInputSection {
  section_type: string;
  notes: string | null;
  answers: FactsInputAnswer[];
  media: {
    id: string;
    ppi_answer_id: string | null;
    url: string;
    media_type: string;
    caption?: string | null;
    captured_at?: string | null;
    uploaded_at?: string | null;
  }[];
}

export interface FactsInput {
  scope: InspectionScope;
  catalogVersion: number;
  performerMode: PerformerMode;
  inspectorName: string | null;
  submission: { id: string; version: number; submitted_at: string | null; revision?: number | null };
  vehicle: InspectionFactsV2["vehicle"];
  certification: InspectionFactsV2["certification"];
  sections: FactsInputSection[];
  diagnostics?: InspectionFactsV2["diagnostics"];
}

function emptyFact<V>(key: string, state: ObservationState, required = false): Fact<V> {
  return {
    fact_id: key,
    question_key: key,
    source_answer_ids: [],
    observation_state: state,
    value: null,
    reason:
      state === "not_recorded"
        ? { code: "not_recorded", explanation: "Not recorded in this inspection version." }
        : state === "outside_scope"
          ? { code: "outside_scope", explanation: "Not part of this inspection product." }
          : null,
    source_kind: "legacy_answer",
    evidence_ids: [],
    evidence_exception: null,
    raw: null,
    prompt: null,
    required,
  };
}

function factFromObservation<V>(
  key: string,
  answer: FactsInputAnswer,
  observation: ObservationDocument | null,
  evidenceIds: string[],
): Fact<V> {
  if (!observation) {
    return {
      ...emptyFact<V>(key, "not_inspected", Boolean(answer.is_required)),
      source_answer_ids: [answer.id],
      evidence_ids: evidenceIds,
      prompt: answer.prompt,
      source_kind: "inspector_entry",
    };
  }
  return {
    fact_id: key,
    question_key: key,
    source_answer_ids: [answer.id],
    observation_state: observation.state,
    value: (observation.value as V | null) ?? null,
    reason: observation.reason ?? null,
    source_kind: observation.source,
    evidence_ids: evidenceIds,
    evidence_exception: observation.evidence_exception ?? null,
    raw: answer.answer_value,
    prompt: answer.prompt,
    required: Boolean(answer.is_required),
  };
}

function legacyTextFact(
  key: string,
  answer: FactsInputAnswer,
  evidenceIds: string[],
  sourceKind: SourceKind = "legacy_answer",
): Fact<{ answer: string }> {
  const text = answer.answer_value?.trim() ?? "";
  return {
    fact_id: key,
    question_key: key,
    source_answer_ids: [answer.id],
    observation_state: text ? "observed" : answer.is_required ? "not_recorded" : "not_inspected",
    value: text ? { answer: text } : null,
    reason: text
      ? null
      : answer.is_required
        ? { code: "not_recorded", explanation: "No answer was recorded." }
        : null,
    source_kind: sourceKind,
    evidence_ids: evidenceIds,
    evidence_exception: null,
    raw: answer.answer_value,
    prompt: answer.prompt,
    required: Boolean(answer.is_required),
  };
}

/** A historical whole-number /32 tread value, preserved exactly. */
function legacyTreadFact(key: string, answer: FactsInputAnswer, evidenceIds: string[]): Fact<TreadValue> {
  const text = answer.answer_value?.trim() ?? "";
  const valid = /^\d{1,2}$/.test(text) && Number(text) <= 32;
  if (!valid) {
    return {
      ...emptyFact<TreadValue>(key, "not_recorded", true),
      source_answer_ids: [answer.id],
      evidence_ids: evidenceIds,
      raw: answer.answer_value,
      prompt: answer.prompt,
    };
  }
  return {
    fact_id: key,
    question_key: key,
    source_answer_ids: [answer.id],
    observation_state: "observed",
    value: { reading: String(Number(text)), unit: "thirty_seconds_inch", method: "legacy_whole_32nds" },
    reason: null,
    source_kind: "legacy_answer",
    // The old front-left prompt asked for a photo of the *worst* tire, so its
    // photo is not evidence of the front-left corner specifically.
    evidence_ids: key === "tires.front_left.tread" ? [] : evidenceIds,
    evidence_exception: null,
    raw: answer.answer_value,
    prompt: answer.prompt,
    required: true,
  };
}

export function buildInspectionFacts(input: FactsInput): InspectionFactsV2 {
  const legacy = input.catalogVersion <= LEGACY_CATALOG_VERSION;
  const initialState: ObservationState = legacy ? "not_recorded" : "not_inspected";

  const tireFacts = (corner: Corner): TireFacts => ({
    sidewall: emptyFact(`tires.${corner}.sidewall`, initialState),
    dot_date: emptyFact(`tires.${corner}.dot_date`, initialState),
    tread: emptyFact(`tires.${corner}.tread`, initialState),
    pressure: emptyFact(`tires.${corner}.pressure`, initialState),
    cracking: emptyFact(`tires.${corner}.cracking`, initialState),
    wear: emptyFact(`tires.${corner}.wear`, initialState),
    damage: emptyFact(`tires.${corner}.damage`, initialState),
  });

  const facts: InspectionFactsV2 = {
    schema_version: FACTS_SCHEMA_VERSION,
    catalog_version: input.catalogVersion,
    scope: input.scope,
    submission: {
      id: input.submission.id,
      version: input.submission.version,
      submitted_at: input.submission.submitted_at,
      revision: input.submission.revision ?? null,
    },
    inspector: { name: input.inspectorName, mode: input.performerMode },
    vehicle: input.vehicle,
    certification: input.certification,
    placard: emptyFact("tires.placard", initialState),
    tires: Object.fromEntries(CORNERS.map((corner) => [corner, tireFacts(corner)])) as Record<Corner, TireFacts>,
    wheels: Object.fromEntries(
      CORNERS.map((corner) => [corner, { damage: emptyFact(`wheels.${corner}.damage`, initialState) }]),
    ) as InspectionFactsV2["wheels"],
    brakes: Object.fromEntries(
      CORNERS.map((corner) => [corner, { pad_thickness: emptyFact(`brakes.${corner}.pad_thickness`, "not_inspected") }]),
    ) as InspectionFactsV2["brakes"],
    battery: emptyFact("battery.test", "not_inspected"),
    body: Object.fromEntries(
      BODY_PANELS.map((panel) => {
        const outside = input.scope === "dents_tires" && DENTS_TIRES_EXCLUDED_PANELS.includes(panel);
        return [panel, emptyFact(`body.${panel}.condition`, outside ? "outside_scope" : initialState)];
      }),
    ) as Record<BodyPanel, Fact<PanelValue>>,
    legacy_body_notes: [],
    checks: {},
    unrecognized: [],
    section_notes: [],
    media: [],
    diagnostics: input.diagnostics ?? null,
  };

  for (const section of input.sections) {
    if (section.notes?.trim()) {
      facts.section_notes.push({ section_type: section.section_type, notes: section.notes.trim() });
    }

    const evidenceByAnswer = new Map<string, string[]>();
    for (const media of section.media) {
      if (!media.ppi_answer_id) continue;
      const list = evidenceByAnswer.get(media.ppi_answer_id) ?? [];
      list.push(media.id);
      evidenceByAnswer.set(media.ppi_answer_id, list);
    }

    const keyByAnswer = new Map<string, string | null>();

    for (const answer of section.answers) {
      const key = resolveQuestionKey(section.section_type, answer.prompt, answer.question_key);
      keyByAnswer.set(answer.id, key);
      const evidence = evidenceByAnswer.get(answer.id) ?? [];

      if (!key) {
        facts.unrecognized.push({
          ...legacyTextFact(`legacy.unrecognized.${answer.id}`, answer, evidence),
          observation_state: answer.answer_value?.trim() ? "observed" : "not_recorded",
        });
        continue;
      }

      const info = parseStructuredKey(key);
      const observation = parseObservation(answer.observation);

      if (info && (observation || !legacy)) {
        const fact = factFromObservation(key, answer, observation, evidence);
        switch (info.family) {
          case "tire_placard":
            facts.placard = fact as Fact<PlacardValue>;
            break;
          case "tire_sidewall":
            facts.tires[info.corner].sidewall = fact as Fact<TireMarkings>;
            break;
          case "tire_dot":
            facts.tires[info.corner].dot_date = fact as Fact<{ code: string }>;
            break;
          case "tire_tread":
            facts.tires[info.corner].tread = fact as Fact<TreadValue>;
            break;
          case "tire_pressure":
            facts.tires[info.corner].pressure = fact as Fact<PressureValue>;
            break;
          case "tire_cracking":
            facts.tires[info.corner].cracking = fact as TireFacts["cracking"];
            break;
          case "tire_wear":
            facts.tires[info.corner].wear = fact as TireFacts["wear"];
            break;
          case "tire_damage":
            facts.tires[info.corner].damage = fact as TireFacts["damage"];
            break;
          case "wheel_damage":
            facts.wheels[info.corner].damage = fact as InspectionFactsV2["wheels"][Corner]["damage"];
            break;
          case "brake_pad":
            facts.brakes[info.corner].pad_thickness = fact as InspectionFactsV2["brakes"][Corner]["pad_thickness"];
            break;
          case "battery_test":
            facts.battery = fact as InspectionFactsV2["battery"];
            break;
          case "body_panel":
            facts.body[info.panel] = fact as Fact<PanelValue>;
            break;
        }
        continue;
      }

      // ---- Catalog-1 adapter -------------------------------------------------
      if (info?.family === "tire_tread") {
        facts.tires[info.corner].tread = legacyTreadFact(key, answer, evidence);
        continue;
      }
      if (info?.family === "body_panel") {
        const note = answer.answer_value?.trim() ?? "";
        facts.body[info.panel] = note
          ? {
              ...legacyTextFact(key, answer, evidence),
              value: { legacy_note: note },
            } as Fact<PanelValue>
          : { ...emptyFact<PanelValue>(key, "not_recorded"), source_answer_ids: [answer.id], evidence_ids: evidence, prompt: answer.prompt };
        continue;
      }
      if (key.startsWith("legacy.body.")) {
        const note = answer.answer_value?.trim() ?? "";
        if (note) {
          facts.legacy_body_notes.push({
            ...legacyTextFact(key, answer, evidence),
            value: { note, region: key.replace("legacy.body.", "") },
          } as Fact<{ note: string; region: string }>);
        }
        continue;
      }
      facts.checks[key] = legacyTextFact(key, answer, evidence, legacy ? "legacy_answer" : "inspector_entry");
    }

    for (const media of section.media) {
      facts.media.push({
        id: media.id,
        section_type: section.section_type,
        answer_id: media.ppi_answer_id,
        question_key: media.ppi_answer_id ? keyByAnswer.get(media.ppi_answer_id) ?? null : null,
        media_type: media.media_type,
        caption: media.caption ?? null,
        captured_at: media.captured_at ?? null,
        uploaded_at: media.uploaded_at ?? null,
        url: media.url,
      });
    }
  }

  return facts;
}

/** Order-stable list of every fact, for hashing, the appendix and the digital detail. */
export function allFacts(facts: InspectionFactsV2): Fact<unknown>[] {
  const list: Fact<unknown>[] = [facts.placard];
  for (const corner of CORNERS) {
    const tire = facts.tires[corner];
    list.push(tire.sidewall, tire.dot_date, tire.tread, tire.pressure, tire.cracking, tire.wear, tire.damage);
    list.push(facts.wheels[corner].damage, facts.brakes[corner].pad_thickness);
  }
  list.push(facts.battery);
  for (const panel of BODY_PANELS) list.push(facts.body[panel]);
  list.push(...facts.legacy_body_notes);
  list.push(...Object.keys(facts.checks).sort().map((key) => facts.checks[key]));
  list.push(...facts.unrecognized);
  return list as Fact<unknown>[];
}
