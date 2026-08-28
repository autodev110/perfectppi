interface InspectionVehicle {
  year?: number | null;
  make?: string | null;
  model?: string | null;
}

export function inspectionTypeLabel(type: string | null | undefined) {
  if (!type) return "Inspection";
  return type
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function inspectionDisplayName(
  vehicle: InspectionVehicle | null | undefined,
  type: string | null | undefined
) {
  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make?.trim(), vehicle.model?.trim()].filter(Boolean).join(" ")
    : "";
  const typeName = inspectionTypeLabel(type);
  return vehicleName ? `${vehicleName} ${typeName}` : typeName;
}
