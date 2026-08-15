import { formatVin, isValidVin } from "@/lib/utils/vin";

export interface DecodedVehicleDetails {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
}

interface NhtsaDecodeResult {
  Make?: string;
  Model?: string;
  ModelYear?: string;
  Trim?: string;
  Series?: string;
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

  return {
    vin,
    year: Number.isFinite(year) ? year : null,
    make: cleanValue(decoded.Make),
    model: cleanValue(decoded.Model),
    trim: cleanValue(decoded.Trim) ?? cleanValue(decoded.Series),
  };
}
