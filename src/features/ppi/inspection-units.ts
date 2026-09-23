// ============================================================================
// Units, decimals and tire date codes for typed inspection observations.
//
// Readings are stored exactly as entered (a decimal string plus its unit) and
// every threshold is compared on exact rational values, never on a rounded
// display string: 1.59 mm must not be judged by the "1.6 mm" it prints as.
// Pure and dependency-free so the same code runs in the browser, on the server
// and under Node's test runner.
// ============================================================================

/** A non-negative decimal as entered: digits, optional fraction, no sign or exponent. */
export const DECIMAL_PATTERN = /^\d{1,5}(?:\.\d{1,4})?$/;

export type TreadUnit = "thirty_seconds_inch" | "mm";
export type PressureUnit = "psi" | "kpa";
export type MeasurementUnit = TreadUnit | PressureUnit | "volts";

/** Exact conversion: 1/32 in = 0.79375 mm. */
export const MM_PER_THIRTY_SECOND = "0.79375";
/** Versioned pressure constant: 1 psi = 6.894757293168 kPa. */
export const KPA_PER_PSI = "6.894757293168";
/** The program's tread replacement threshold, 2/32 in (= 1.5875 mm exactly). */
export const TREAD_REPLACEMENT_THRESHOLD_32NDS = "2";
export const TREAD_REPLACEMENT_THRESHOLD_MM = "1.5875";

interface Rational {
  n: bigint;
  d: bigint;
}

/**
 * Accepts a comma decimal separator from locales that use one and returns the
 * canonical dot form, or null when the text is not a plain decimal.
 */
export function normalizeDecimalInput(raw: string): string | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!DECIMAL_PATTERN.test(trimmed)) return null;
  // Canonical form keeps the entered precision ("4.50" stays "4.50") but drops
  // redundant leading zeros so "05" and "5" are the same reading.
  const [whole, fraction] = trimmed.split(".");
  const wholeCanonical = whole.replace(/^0+(?=\d)/, "");
  return fraction === undefined ? wholeCanonical : `${wholeCanonical}.${fraction}`;
}

function toRational(decimal: string): Rational {
  const [whole, fraction = ""] = decimal.split(".");
  const d = BigInt(10) ** BigInt(fraction.length);
  return { n: BigInt(whole + fraction), d };
}

function multiply(a: Rational, b: Rational): Rational {
  return { n: a.n * b.n, d: a.d * b.d };
}

function divide(a: Rational, b: Rational): Rational {
  return { n: a.n * b.d, d: a.d * b.n };
}

/** -1, 0 or 1. Denominators are always positive here. */
function compare(a: Rational, b: Rational): number {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Half-up rounding to a fixed number of places, as a display string. */
function toFixed(value: Rational, places: number): string {
  const scale = BigInt(10) ** BigInt(places);
  const scaled = (value.n * scale * BigInt(2) + value.d) / (value.d * BigInt(2));
  const text = scaled.toString().padStart(places + 1, "0");
  if (places === 0) return text;
  return `${text.slice(0, -places)}.${text.slice(-places)}`;
}

function stripTrailingZeros(text: string): string {
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

export function compareDecimals(a: string, b: string): number {
  return compare(toRational(a), toRational(b));
}

/** Tread depth in exact millimetres, as a rational, from its entered unit. */
function treadMillimetres(reading: string, unit: TreadUnit): Rational {
  const value = toRational(reading);
  return unit === "mm" ? value : multiply(value, toRational(MM_PER_THIRTY_SECOND));
}

/**
 * Exact millimetre value as a decimal string. 1/32 in = 0.79375 mm has at most
 * five places, so a reading with up to four places converts without loss.
 */
export function treadToMillimetres(reading: string, unit: TreadUnit): string {
  return stripTrailingZeros(toFixed(treadMillimetres(reading, unit), 9));
}

/** True when the reading is at or below 2/32 in, compared before any rounding. */
export function treadAtOrBelowReplacementThreshold(reading: string, unit: TreadUnit): boolean {
  return compare(treadMillimetres(reading, unit), toRational(TREAD_REPLACEMENT_THRESHOLD_MM)) <= 0;
}

/** Display both units: "5/32 in | 4.0 mm" or "4.2 mm | 5.3/32 in". */
export function formatTread(reading: string, unit: TreadUnit): string {
  const mm = treadMillimetres(reading, unit);
  if (unit === "thirty_seconds_inch") {
    return `${reading}/32 in | ${toFixed(mm, 1)} mm`;
  }
  const thirtySeconds = divide(mm, toRational(MM_PER_THIRTY_SECOND));
  return `${reading} mm | ${stripTrailingZeros(toFixed(thirtySeconds, 1))}/32 in`;
}

export function pressureToKpa(reading: string, unit: PressureUnit): string {
  const value = toRational(reading);
  const kpa = unit === "kpa" ? value : multiply(value, toRational(KPA_PER_PSI));
  return stripTrailingZeros(toFixed(kpa, 6));
}

export function formatPressure(reading: string, unit: PressureUnit): string {
  return unit === "psi" ? `${reading} psi` : `${reading} kPa`;
}

/**
 * Converts a pressure into the other unit for a like-for-like comparison with a
 * placard target, returning the exact difference sign of actual vs target.
 */
export function comparePressure(
  actual: { reading: string; unit: PressureUnit },
  target: { reading: string; unit: PressureUnit },
): number {
  const toKpa = (value: { reading: string; unit: PressureUnit }) =>
    value.unit === "kpa"
      ? toRational(value.reading)
      : multiply(toRational(value.reading), toRational(KPA_PER_PSI));
  return compare(toKpa(actual), toKpa(target));
}

export interface ReadingBounds {
  min: string;
  max: string;
}

export const READING_BOUNDS: Record<string, ReadingBounds> = {
  // Input bounds, not condition thresholds. Tread keeps the historical 0–32/32
  // range and allows its exact metric equivalent.
  "tread:thirty_seconds_inch": { min: "0", max: "32" },
  "tread:mm": { min: "0", max: "25.4" },
  "pressure:psi": { min: "0", max: "120" },
  "pressure:kpa": { min: "0", max: "830" },
  "brake_pad:mm": { min: "0", max: "30" },
  "battery:volts": { min: "0", max: "20" },
};

export function readingWithinBounds(reading: string, bounds: ReadingBounds): boolean {
  return compareDecimals(reading, bounds.min) >= 0 && compareDecimals(reading, bounds.max) <= 0;
}

// ---------------------------------------------------------------------------
// DOT date codes
// ---------------------------------------------------------------------------

export type DotCodeResult =
  | {
      ok: true;
      week: number;
      year: number;
      /** Whole years from production week to the inspection date, floor. */
      ageYears: number;
      /** Week 53 exists only in some calendar years; confirm against the tire. */
      needsVerification: boolean;
    }
  | { ok: false; error: "format" | "week" | "future" };

/**
 * Four-character week/year code, e.g. "0224" = week 2 of 2024. The two-digit
 * year resolves to the latest year not after the inspection. A production week
 * wholly after the inspection date is invalid; the same week is accepted
 * because the code identifies a week, not a day.
 */
export function parseDotCode(code: string, inspectionDate: Date): DotCodeResult {
  if (!/^\d{4}$/.test(code)) return { ok: false, error: "format" };
  const week = Number(code.slice(0, 2));
  const yy = Number(code.slice(2));
  if (week < 1 || week > 53) return { ok: false, error: "week" };

  const inspectionYear = inspectionDate.getUTCFullYear();
  const century = Math.floor(inspectionYear / 100) * 100;
  let year = century + yy;
  if (year > inspectionYear) year -= 100;

  // Start of the production week (ISO-ish: week 1 begins on Jan 1 here — the
  // code is week-granular, so the approximation only affects the boundary week).
  const weekStart = Date.UTC(year, 0, 1) + (week - 1) * 7 * 86_400_000;
  if (weekStart > inspectionDate.getTime()) return { ok: false, error: "future" };

  const inspectionMonthsFromEpoch = inspectionYear * 12 + inspectionDate.getUTCMonth();
  const productionMonth = new Date(weekStart).getUTCMonth();
  const months = inspectionMonthsFromEpoch - (year * 12 + productionMonth);
  return {
    ok: true,
    week,
    year,
    ageYears: Math.max(0, Math.floor(months / 12)),
    needsVerification: week === 53,
  };
}
