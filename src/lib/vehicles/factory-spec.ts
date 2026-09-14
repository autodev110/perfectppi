// Factory Spec vs Current Build (Renditions doc). The VIN decode establishes
// a vehicle's factory identity; it is stored once and never overwritten by
// what the owner types. The owner-maintained fields (engine, transmission,
// drivetrain, body style, trim) describe the car as it is now. This module
// is pure and client-safe: it normalizes both layers into comparable values
// and explains every difference so a modified car can never be presented as
// factory-correct by accident.

export type VehicleFactorySpec = {
  source: "nhtsa_vpic";
  vin: string;
  decoded_at: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  series: string | null;
  body_class: string | null;
  doors: number | null;
  drive_type: string | null;
  engine_model: string | null;
  displacement_l: number | null;
  cylinders: number | null;
  engine_hp: number | null;
  fuel_type: string | null;
  transmission_style: string | null;
  transmission_speeds: number | null;
  plant_country: string | null;
  plant_city: string | null;
  manufacturer: string | null;
};

export type Drivetrain = "FWD" | "RWD" | "AWD" | "4WD";
export type TransmissionStyle = "manual" | "automatic" | "cvt" | "dct" | "automated_manual";
export type BodyStyle = "Sedan" | "Coupe" | "Hatchback" | "Wagon" | "SUV" | "Truck" | "Convertible" | "Van";

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Parses a stored jsonb value; anything malformed reads as "no factory spec". */
export function parseFactorySpec(input: unknown): VehicleFactorySpec | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (raw.source !== "nhtsa_vpic" || typeof raw.vin !== "string") return null;
  const text = (key: string) => (typeof raw[key] === "string" && (raw[key] as string).trim() ? (raw[key] as string).trim() : null);
  return {
    source: "nhtsa_vpic",
    vin: raw.vin,
    decoded_at: typeof raw.decoded_at === "string" ? raw.decoded_at : "",
    year: num(raw.year) === null ? null : Math.round(num(raw.year)!),
    make: text("make"),
    model: text("model"),
    trim: text("trim"),
    series: text("series"),
    body_class: text("body_class"),
    doors: num(raw.doors) === null ? null : Math.round(num(raw.doors)!),
    drive_type: text("drive_type"),
    engine_model: text("engine_model"),
    displacement_l: num(raw.displacement_l),
    cylinders: num(raw.cylinders) === null ? null : Math.round(num(raw.cylinders)!),
    engine_hp: num(raw.engine_hp),
    fuel_type: text("fuel_type"),
    transmission_style: text("transmission_style"),
    transmission_speeds: num(raw.transmission_speeds) === null ? null : Math.round(num(raw.transmission_speeds)!),
    plant_country: text("plant_country"),
    plant_city: text("plant_city"),
    manufacturer: text("manufacturer"),
  };
}

/** The factory layer for public audiences: the VIN itself stays private. */
export function redactFactorySpec(spec: VehicleFactorySpec | null): VehicleFactorySpec | null {
  return spec ? { ...spec, vin: "" } : null;
}

/** "AWD/All-Wheel Drive", "4x4", "Front-Wheel Drive", "rwd" → canonical, or null when unknown. */
export function normalizeDrivetrain(value: string | null | undefined): Drivetrain | null {
  const text = (value ?? "").toLowerCase();
  if (!text.trim()) return null;
  if (/\bawd\b|all[- ]?wheel/.test(text)) return "AWD";
  if (/\b4wd\b|4x4|four[- ]?wheel|part[- ]time|full[- ]time/.test(text)) return "4WD";
  if (/\bfwd\b|front[- ]?wheel/.test(text)) return "FWD";
  if (/\brwd\b|rear[- ]?wheel/.test(text)) return "RWD";
  return null;
}

/** "6-speed manual", "Automatic (AT)", "CVT", "DCT" → style, or null when unknown. */
export function normalizeTransmissionStyle(value: string | null | undefined): TransmissionStyle | null {
  const text = (value ?? "").toLowerCase();
  if (!text.trim()) return null;
  if (/cvt|continuously/.test(text)) return "cvt";
  if (/dct|dual[- ]clutch|pdk|dsg/.test(text)) return "dct";
  if (/automated manual|\bamt\b|sequential/.test(text)) return "automated_manual";
  if (/manual|\bmt\b|stick/.test(text)) return "manual";
  if (/auto|\bat\b|tiptronic|steptronic/.test(text)) return "automatic";
  return null;
}

/** vPIC BodyClass or free text → one of the app's body styles, or null. */
export function normalizeBodyStyle(value: string | null | undefined): BodyStyle | null {
  const text = (value ?? "").toLowerCase();
  if (!text.trim()) return null;
  if (/convertible|cabriolet|roadster|spyder|spider/.test(text)) return "Convertible";
  if (/pickup|truck/.test(text)) return "Truck";
  if (/\bvan\b|minivan|cargo/.test(text)) return "Van";
  if (/wagon|estate|touring/.test(text)) return "Wagon";
  if (/hatchback|liftback|5[- ]door/.test(text)) return "Hatchback";
  if (/sport utility|suv|crossover|multipurpose|mpv/.test(text)) return "SUV";
  if (/coupe|2[- ]door/.test(text)) return "Coupe";
  if (/sedan|saloon|4[- ]door/.test(text)) return "Sedan";
  return null;
}

const TRANSMISSION_LABELS: Record<TransmissionStyle, string> = {
  manual: "Manual", automatic: "Automatic", cvt: "CVT", dct: "Dual-clutch", automated_manual: "Automated manual",
};

export type FactorySummary = {
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  body_style: string | null;
  trim: string | null;
};

/** Human summary of the factory layer, in the same shape as the current fields. */
export function factorySpecSummary(spec: VehicleFactorySpec): FactorySummary {
  const engineBits: string[] = [];
  if (spec.displacement_l != null) engineBits.push(`${Number(spec.displacement_l.toFixed(1))}L`);
  if (spec.cylinders != null) engineBits.push(`${spec.cylinders}-cyl`);
  if (spec.fuel_type && /electric/i.test(spec.fuel_type) && engineBits.length === 0) engineBits.push("Electric");
  if (spec.engine_hp != null) engineBits.push(`${Math.round(spec.engine_hp)} hp`);
  const engine = [engineBits.join(" "), spec.engine_model ? `(${spec.engine_model})` : ""].filter(Boolean).join(" ") || null;
  const style = normalizeTransmissionStyle(spec.transmission_style);
  const transmission = style
    ? [spec.transmission_speeds ? `${spec.transmission_speeds}-speed` : "", TRANSMISSION_LABELS[style]].filter(Boolean).join(" ")
    : spec.transmission_style;
  return {
    engine,
    transmission,
    drivetrain: normalizeDrivetrain(spec.drive_type) ?? spec.drive_type,
    body_style: normalizeBodyStyle(spec.body_class) ?? spec.body_class,
    trim: spec.trim ?? spec.series,
  };
}

export type CurrentBuild = {
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  body_style: string | null;
  trim: string | null;
  engine_original: boolean;
  transmission_original: boolean;
  drivetrain_original: boolean;
};

export type SpecField = "engine" | "transmission" | "drivetrain" | "body_style" | "trim";

export type SpecComparison = {
  field: SpecField;
  label: string;
  factory: string | null;
  current: string | null;
  /**
   * match — same as factory (or nothing entered);
   * declared — owner marked it not original (swap/conversion);
   * differs — different from factory while still marked original;
   * unknown — factory value not decodable, nothing to compare.
   */
  status: "match" | "declared" | "differs" | "unknown";
};

const FIELD_LABELS: Record<SpecField, string> = {
  engine: "Engine", transmission: "Transmission", drivetrain: "Drivetrain", body_style: "Body style", trim: "Trim",
};

/** Compare the owner's current layer against the factory layer, field by field. */
export function compareToFactory(spec: VehicleFactorySpec | null, current: CurrentBuild): SpecComparison[] {
  const summary = spec ? factorySpecSummary(spec) : null;
  const rows: SpecComparison[] = [];
  const push = (field: SpecField, factory: string | null, currentValue: string | null, same: boolean | null, declared: boolean) => {
    const status: SpecComparison["status"] = declared
      ? "declared"
      : !factory || same === null
        ? "unknown"
        : same ? "match" : "differs";
    rows.push({ field, label: FIELD_LABELS[field], factory, current: currentValue, status });
  };

  const driveF = normalizeDrivetrain(spec?.drive_type);
  const driveC = normalizeDrivetrain(current.drivetrain);
  push("drivetrain", summary?.drivetrain ?? null, current.drivetrain, driveF && driveC ? driveF === driveC : driveC ? null : true, !current.drivetrain_original);

  const transF = normalizeTransmissionStyle(spec?.transmission_style);
  const transC = normalizeTransmissionStyle(current.transmission);
  push("transmission", summary?.transmission ?? null, current.transmission, transF && transC ? transF === transC : transC ? null : true, !current.transmission_original);

  // Engines are free text on both sides; only a displacement typed by the
  // owner ("2.0L", "5.7") is compared, everything else is informational.
  const dispF = spec?.displacement_l ?? null;
  const dispC = current.engine ? num((current.engine.match(/(\d+(?:\.\d+)?)\s*l\b/i) ?? [])[1]) : null;
  push("engine", summary?.engine ?? null, current.engine, dispF != null && dispC != null ? Math.abs(dispF - dispC) < 0.15 : current.engine ? null : true, !current.engine_original);

  const bodyF = normalizeBodyStyle(spec?.body_class);
  const bodyC = normalizeBodyStyle(current.body_style);
  push("body_style", summary?.body_style ?? null, current.body_style, bodyF && bodyC ? bodyF === bodyC : bodyC ? null : true, false);

  const trimF = (summary?.trim ?? "").trim().toLowerCase();
  const trimC = (current.trim ?? "").trim().toLowerCase();
  push("trim", summary?.trim ?? null, current.trim, trimF && trimC ? trimF === trimC : trimC ? null : true, false);
  return rows;
}

/**
 * The one difference the server refuses outright: a drivetrain or a
 * transmission *style* that contradicts the factory record while the owner
 * still says the part is original. Engine text and trim are too free-form
 * to enforce; those stay warnings.
 */
export function factoryConflict(spec: VehicleFactorySpec | null, current: CurrentBuild): string | null {
  if (!spec) return null;
  const driveF = normalizeDrivetrain(spec.drive_type);
  const driveC = normalizeDrivetrain(current.drivetrain);
  if (driveF && driveC && driveF !== driveC && current.drivetrain_original) {
    return `The VIN decodes as ${driveF}, but ${driveC} was entered. If the drivetrain was converted, choose Modified or Custom build and mark the drivetrain as not original; otherwise use the factory value.`;
  }
  const transF = normalizeTransmissionStyle(spec.transmission_style);
  const transC = normalizeTransmissionStyle(current.transmission);
  if (transF && transC && transF !== transC && current.transmission_original) {
    return `The VIN decodes as a ${TRANSMISSION_LABELS[transF].toLowerCase()} transmission, but "${current.transmission}" was entered. If the transmission was swapped, choose Modified or Custom build and mark it as not original; otherwise use the factory value.`;
  }
  return null;
}

/** Fill only empty current fields from the factory layer (creation-time prefill). */
export function prefillFromFactory<T extends Partial<Record<SpecField, string | null | undefined>>>(spec: VehicleFactorySpec, current: T): T {
  const summary = factorySpecSummary(spec);
  const next = { ...current };
  for (const field of ["engine", "transmission", "drivetrain", "body_style", "trim"] as const) {
    if ((next[field] ?? "") === "" && summary[field]) (next as Record<string, unknown>)[field] = summary[field];
  }
  return next;
}
