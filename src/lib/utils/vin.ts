// VIN validation utility
// Standard VIN: 17 alphanumeric characters, excludes I, O, Q

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;

export function isValidVin(vin: string): boolean {
  // Position nine is mandatory as a check digit in North America, but not for
  // every international-market VIN. The global 17-character format is the
  // safe validation boundary for camera recognition and decoding.
  return VIN_REGEX.test(vin);
}

export function formatVin(vin: string): string {
  return vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
}
