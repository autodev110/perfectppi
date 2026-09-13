type NhtsaResult = { Make_Name?: string; Model_Name?: string };
type NhtsaResponse = { Results?: NhtsaResult[] };

// vPIC returns names in upper case ("MERCEDES-BENZ", "ALFA ROMEO"). Stored
// vehicles use natural casing, so normalize before the values reach a form:
// words of four or more letters are capitalized; short tokens stay as-is so
// BMW, GMC, RAM, and model codes like "RX-8" or "M3" survive.
export function normalizeCatalogName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed.replace(/[A-Z][A-Z0-9']*/g, (token) =>
    token.length >= 4 && /^[A-Z']+$/.test(token) ? token[0] + token.slice(1).toLowerCase() : token,
  );
}

async function nhtsaValues(url: string, key: "Make_Name" | "Model_Name") {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 7 * 24 * 60 * 60 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Vehicle catalog failed with status ${response.status}`);
  const payload = await response.json() as NhtsaResponse;
  return [...new Set((payload.Results ?? [])
    .map((item) => item[key]?.trim())
    .filter((value): value is string => !!value)
    .map(normalizeCatalogName))]
    .sort((first, second) => first.localeCompare(second));
}

export function listVehicleMakes() {
  return nhtsaValues("https://vpic.nhtsa.dot.gov/api/vehicles/GetAllMakes?format=json", "Make_Name");
}

export function listVehicleModels(make: string, year?: number | null) {
  const encodedMake = encodeURIComponent(make.trim());
  const path = year
    ? `GetModelsForMakeYear/make/${encodedMake}/modelyear/${year}`
    : `GetModelsForMake/${encodedMake}`;
  return nhtsaValues(`https://vpic.nhtsa.dot.gov/api/vehicles/${path}?format=json`, "Model_Name");
}
