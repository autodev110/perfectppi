import { formatVin, isValidVin } from "@/lib/utils/vin";
import { normalizeCatalogName } from "@/lib/vehicles/catalog";
import { factorySpecSummary, type VehicleFactorySpec } from "@/lib/vehicles/factory-spec";

export interface DecodedVehicleDetails {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  /** The factory layer (Renditions doc): stored once, never overwritten by owner edits. */
  factory_spec: VehicleFactorySpec;
  /** Factory values in the shape of the owner-editable current fields, for prefill/hints. */
  factory_summary: ReturnType<typeof factorySpecSummary>;
}

interface NhtsaDecodeResult {
  Make?: string;
  Model?: string;
  ModelYear?: string;
  Trim?: string;
  Series?: string;
  BodyClass?: string;
  Doors?: string;
  DriveType?: string;
  EngineModel?: string;
  DisplacementL?: string;
  EngineCylinders?: string;
  EngineHP?: string;
  FuelTypePrimary?: string;
  TransmissionStyle?: string;
  TransmissionSpeeds?: string;
  PlantCountry?: string;
  PlantCity?: string;
  Manufacturer?: string;
  ErrorCode?: string;
}

interface NhtsaDecodeResponse {
  Results?: NhtsaDecodeResult[];
}

function cleanValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (
    upper === "0" ||
    upper === "NULL" ||
    upper === "NOT APPLICABLE" ||
    upper === "NONE" ||
    upper === "UNKNOWN"
  ) {
    return null;
  }

  return trimmed;
}

export async function decodeVinDetails(
  vinInput: string,
  modelYear?: number | null
): Promise<DecodedVehicleDetails | null> {
  const vin = formatVin(vinInput);
  if (!isValidVin(vin)) return null;

  const params = new URLSearchParams({ format: "json" });
  if (modelYear) {
    params.set("modelyear", String(modelYear));
  }

  const response = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?${params.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    }
  );

  if (!response.ok) {
    throw new Error(`VIN decode failed with status ${response.status}`);
  }

  const payload = (await response.json()) as NhtsaDecodeResponse;
  const decoded = payload.Results?.[0];
  if (!decoded) return null;

  const yearText = cleanValue(decoded.ModelYear);
  const year = yearText ? Number.parseInt(yearText, 10) : null;
  const numeric = (value: string | undefined) => {
    const cleaned = cleanValue(value);
    const parsed = cleaned ? Number.parseFloat(cleaned) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  };
  const make = cleanValue(decoded.Make);
  const model = cleanValue(decoded.Model);

  const factory_spec: VehicleFactorySpec = {
    source: "nhtsa_vpic",
    vin,
    decoded_at: new Date().toISOString(),
    year: Number.isFinite(year) ? year : null,
    make: make ? normalizeCatalogName(make) : null,
    model: model ? normalizeCatalogName(model) : null,
    trim: cleanValue(decoded.Trim),
    series: cleanValue(decoded.Series),
    body_class: cleanValue(decoded.BodyClass),
    doors: numeric(decoded.Doors),
    drive_type: cleanValue(decoded.DriveType),
    engine_model: cleanValue(decoded.EngineModel),
    displacement_l: numeric(decoded.DisplacementL),
    cylinders: numeric(decoded.EngineCylinders),
    engine_hp: numeric(decoded.EngineHP),
    fuel_type: cleanValue(decoded.FuelTypePrimary),
    transmission_style: cleanValue(decoded.TransmissionStyle),
    transmission_speeds: numeric(decoded.TransmissionSpeeds),
    plant_country: cleanValue(decoded.PlantCountry),
    plant_city: cleanValue(decoded.PlantCity),
    manufacturer: cleanValue(decoded.Manufacturer),
  };

  return {
    vin,
    year: factory_spec.year,
    make: factory_spec.make,
    model: factory_spec.model,
    trim: factory_spec.trim ?? factory_spec.series,
    factory_spec,
    factory_summary: factorySpecSummary(factory_spec),
  };
}
