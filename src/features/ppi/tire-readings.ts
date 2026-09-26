import { CAPTURE_CORNER_ORDER, type Corner, type ObservationDocument } from "./inspection-schema.ts";

// ============================================================================
// Reading tire details from all photos at once.
//
// The first tire step collects photos per slot: the door placard, and each
// tire's sidewall (which also carries its DOT code). Every photo is read on
// its own (cached per photo), then the readings for a slot are merged here:
// a field is filled when the photos agree, and flagged when they disagree,
// instead of the latest photo silently winning.
//
// Filling only ever adds to blank fields. A value the inspector already
// entered, or an explicit "unable to assess", is never overwritten; a reading
// that differs from it is reported as a conflict for the inspector to settle.
// ============================================================================

export type ReadingTarget = "tire_sidewall" | "tire_dot" | "tire_placard";
export type TireSlot = "placard" | Corner;

/** In walk-around order, matching the capture page. */
export const TIRE_SLOTS: readonly TireSlot[] = ["placard", ...CAPTURE_CORNER_ORDER];

/** Question keys whose photos a slot reads, and which target each fills. */
export function slotQuestions(slot: TireSlot): { key: string; target: ReadingTarget }[] {
  if (slot === "placard") return [{ key: "tires.placard", target: "tire_placard" }];
  return [
    { key: `tires.${slot}.sidewall`, target: "tire_sidewall" },
    { key: `tires.${slot}.dot_date`, target: "tire_dot" },
  ];
}

/** Photos attached to these questions are read for these targets. */
export function slotTargets(slot: TireSlot): ReadingTarget[] {
  return slotQuestions(slot).map((question) => question.target);
}

export const TARGET_FIELDS: Record<ReadingTarget, readonly string[]> = {
  tire_sidewall: ["size", "load_index", "speed_rating", "brand", "model", "extra_marking"],
  tire_dot: ["code"],
  tire_placard: ["front_size", "front_pressure", "rear_size", "rear_pressure", "unit", "load_index", "speed_rating"],
};

export interface PhotoReading {
  extraction_id: string;
  media_id: string;
  status: "extracted" | "unreadable" | "failed";
  candidates: Record<string, string | null>;
}

export interface MergedField {
  /** The agreed value, or null when nothing was read or the photos disagree. */
  value: string | null;
  /** Photos that showed the agreed value. */
  media_ids: string[];
  /** Two or more distinct readings: the inspector must choose. */
  alternatives: { value: string; media_ids: string[] }[];
}

export interface MergedReading {
  target: ReadingTarget;
  fields: Record<string, MergedField>;
  /** Readings that produced at least one value; the provenance of a fill. */
  extraction_ids: string[];
  /** The reading each photo produced for this target. */
  media_to_extraction: Record<string, string>;
}

/** Comparison key: the same marking printed or read slightly differently. */
export function comparableValue(field: string, value: string): string {
  const trimmed = value.trim();
  if (field.endsWith("pressure")) {
    const number = Number(trimmed);
    return Number.isFinite(number) ? String(number) : trimmed;
  }
  if (field === "speed_rating") return trimmed.toUpperCase().replace(/[()]/g, "");
  return trimmed.toUpperCase().replace(/\s+/g, "");
}

export function mergeReadings(target: ReadingTarget, readings: PhotoReading[]): MergedReading {
  const usable = readings.filter((reading) => reading.status === "extracted");
  const fields: Record<string, MergedField> = {};
  for (const field of TARGET_FIELDS[target]) {
    const groups = new Map<string, { value: string; media_ids: string[] }>();
    for (const reading of usable) {
      const raw = reading.candidates[field];
      if (typeof raw !== "string" || !raw.trim()) continue;
      const key = comparableValue(field, raw);
      const group = groups.get(key) ?? { value: raw.trim(), media_ids: [] };
      if (!group.media_ids.includes(reading.media_id)) group.media_ids.push(reading.media_id);
      groups.set(key, group);
    }
    const ordered = [...groups.values()].sort((a, b) => b.media_ids.length - a.media_ids.length);
    fields[field] = ordered.length === 1
      ? { value: ordered[0].value, media_ids: ordered[0].media_ids, alternatives: [] }
      : { value: null, media_ids: [], alternatives: ordered };
  }
  const extraction_ids = usable
    .filter((reading) => TARGET_FIELDS[target].some((field) => typeof reading.candidates[field] === "string" && reading.candidates[field]!.trim()))
    .map((reading) => reading.extraction_id);
  const media_to_extraction = Object.fromEntries(usable.map((reading) => [reading.media_id, reading.extraction_id]));
  return { target, fields, extraction_ids, media_to_extraction };
}

export interface FillConflict {
  field: string;
  /** What the photos showed, most photos first. */
  read: { value: string; media_ids: string[] }[];
  /** The inspector's value, when the conflict is with an entered value. */
  entered: string | null;
}

export interface FillPlan {
  /** The observation to save, or null when nothing changes. */
  observation: ObservationDocument | null;
  filled: string[];
  conflicts: FillConflict[];
  /** Set when the answer was left alone on purpose. */
  kept?: "explicit_choice";
}

export interface SlotAnswerResult {
  answer_id: string;
  question_key: string;
  filled: string[];
  conflicts: FillConflict[];
  kept?: "explicit_choice";
  error?: string;
}

/** What reading one slot did, as the API returns it. */
export interface SlotFillResult {
  slot: TireSlot;
  photo_count: number;
  /** One entry per photo and target read. */
  readings: { media_id: string; target: ReadingTarget; status: PhotoReading["status"]; error?: string }[];
  answers: SlotAnswerResult[];
}

/** Flat field view of a stored value, for comparing against readings. */
function flatten(target: ReadingTarget, value: Record<string, unknown> | null | undefined): Record<string, string> {
  const text = (entry: unknown) => (typeof entry === "string" ? entry.trim() : typeof entry === "number" ? String(entry) : "");
  if (!value) return {};
  if (target !== "tire_placard") {
    return Object.fromEntries(TARGET_FIELDS[target].map((field) => [field, text(value[field])]));
  }
  const front = (value.front ?? {}) as Record<string, unknown>;
  const rear = (value.rear ?? {}) as Record<string, unknown>;
  const pressureEntered = text(front.pressure) || text(rear.pressure);
  return {
    front_size: text(front.size),
    front_pressure: text(front.pressure),
    rear_size: text(rear.size),
    rear_pressure: text(rear.pressure),
    // The unit only carries meaning next to an entered pressure.
    unit: pressureEntered ? text(front.unit) || "psi" : "",
    load_index: text(value.load_index),
    speed_rating: text(value.speed_rating),
  };
}

function unflatten(target: ReadingTarget, fields: Record<string, string>, previous: Record<string, unknown> | null): Record<string, unknown> {
  if (target !== "tire_placard") {
    const base: Record<string, unknown> = { ...(previous ?? {}) };
    for (const field of TARGET_FIELDS[target]) {
      const value = fields[field]?.trim() ?? "";
      if (value) base[field] = field === "speed_rating" ? value.toUpperCase() : value;
      else delete base[field];
    }
    return base;
  }
  const unit = fields.unit === "kpa" ? "kpa" : "psi";
  return {
    ...(previous ?? {}),
    front: { size: fields.front_size ?? "", pressure: fields.front_pressure ?? "", unit },
    rear: { size: fields.rear_size ?? "", pressure: fields.rear_pressure ?? "", unit },
    load_index: fields.load_index ?? "",
    speed_rating: (fields.speed_rating ?? "").toUpperCase(),
    location: (previous?.location as string | undefined) ?? "driver_door_jamb",
    documented_alternative: (previous?.documented_alternative as string | undefined) ?? "",
  };
}

/**
 * What filling one answer from merged readings would change. Blank fields are
 * filled; entered values are kept and disagreements reported.
 */
export function planFill(target: ReadingTarget, current: ObservationDocument | null, merged: MergedReading): FillPlan {
  if (current && current.state !== "observed") {
    return { observation: null, filled: [], conflicts: [], kept: "explicit_choice" };
  }
  const previous = (current?.value ?? null) as Record<string, unknown> | null;
  const existing = flatten(target, previous);
  const next = { ...existing };
  const filled: string[] = [];
  const conflicts: FillConflict[] = [];

  for (const field of TARGET_FIELDS[target]) {
    const reading = merged.fields[field];
    if (!reading) continue;
    const entered = existing[field] ?? "";
    if (reading.alternatives.length > 1) {
      // A photo that matches the entered value confirms it; otherwise ask.
      const confirmsEntered = entered && reading.alternatives.some((alternative) => comparableValue(field, alternative.value) === comparableValue(field, entered));
      if (!confirmsEntered) conflicts.push({ field, read: reading.alternatives, entered: entered || null });
      continue;
    }
    if (!reading.value) continue;
    if (!entered) {
      next[field] = reading.value;
      filled.push(field);
    } else if (comparableValue(field, entered) !== comparableValue(field, reading.value)) {
      conflicts.push({ field, read: [{ value: reading.value, media_ids: reading.media_ids }], entered });
    }
  }

  if (filled.length === 0) return { observation: null, filled, conflicts };

  // Provenance: every reading of this slot that produced a value, plus any
  // readings the inspector had already accepted into this answer.
  const readingIds = merged.extraction_ids;
  const earlier = current?.source === "confirmed_extraction"
    ? [...(current.extraction_ids ?? []), ...(current.extraction_id ? [current.extraction_id] : [])]
    : [];
  const extractionIds = [...new Set([...readingIds, ...earlier])];
  const primary = primaryReading(merged, filled) ?? extractionIds[0] ?? null;

  return {
    observation: {
      v: 1,
      state: "observed",
      value: unflatten(target, next, previous),
      reason: null,
      source: "confirmed_extraction",
      extraction_id: primary,
      extraction_ids: extractionIds,
      evidence_exception: current?.evidence_exception ?? null,
    },
    filled,
    conflicts,
  };
}

/** The reading behind most of the filled fields; ties go to the first photo. */
function primaryReading(merged: MergedReading, filled: string[]): string | null {
  const counts = new Map<string, number>();
  for (const field of filled) {
    for (const mediaId of merged.fields[field]?.media_ids ?? []) counts.set(mediaId, (counts.get(mediaId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [mediaId, count] of counts) {
    if (count > bestCount) {
      best = mediaId;
      bestCount = count;
    }
  }
  return best ? merged.media_to_extraction[best] ?? null : null;
}
