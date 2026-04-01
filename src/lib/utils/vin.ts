// VIN validation utility
// Standard VIN: 17 alphanumeric characters, excludes I, O, Q

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function transliterate(char: string): number {
  const upper = char.toUpperCase();
  if (/[0-9]/.test(upper)) return parseInt(upper, 10);
  return TRANSLITERATION[upper] ?? 0;
}

export function isValidVin(vin: string): boolean {
  if (!VIN_REGEX.test(vin)) return false;

  // Check digit validation (position 9)
  const values = vin.split("").map(transliterate);
  const sum = values.reduce((acc, val, i) => acc + val * WEIGHTS[i], 0);
  const remainder = sum % 11;
  const checkDigit = remainder === 10 ? "X" : String(remainder);

  return vin[8].toUpperCase() === checkDigit;
}

export function formatVin(vin: string): string {
  return vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
}
