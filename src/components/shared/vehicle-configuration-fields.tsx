"use client";

import Link from "next/link";
import { useState } from "react";
import { Label } from "@/components/ui/label";

export type VehicleConfigurationType = "stock" | "modified" | "custom_build";
export type VehicleMileageStatus = "actual" | "not_actual" | "unknown";

export function VehicleConfigurationFields({
  initialType = "stock",
  initialEngineOriginal = true,
  initialTransmissionOriginal = true,
  initialDrivetrainOriginal = true,
  initialMileageStatus = "actual",
  vehicleId,
}: {
  initialType?: VehicleConfigurationType;
  initialEngineOriginal?: boolean;
  initialTransmissionOriginal?: boolean;
  initialDrivetrainOriginal?: boolean;
  initialMileageStatus?: VehicleMileageStatus;
  vehicleId?: string;
}) {
  const [configurationType, setConfigurationType] = useState(initialType);
  const [engineOriginal, setEngineOriginal] = useState(initialEngineOriginal);
  const [transmissionOriginal, setTransmissionOriginal] = useState(initialTransmissionOriginal);
  const [drivetrainOriginal, setDrivetrainOriginal] = useState(initialDrivetrainOriginal);

  function changeType(value: VehicleConfigurationType) {
    setConfigurationType(value);
    if (value === "stock") {
      setEngineOriginal(true);
      setTransmissionOriginal(true);
      setDrivetrainOriginal(true);
    }
  }

  return (
    <fieldset className="space-y-4 rounded-xl border p-4 sm:col-span-2">
      <legend className="px-2 text-sm font-semibold">Configuration check</legend>
      <div className="space-y-2">
        <Label htmlFor="configuration_type">How is this vehicle configured?</Label>
        <select id="configuration_type" name="configuration_type" value={configurationType} onChange={(event) => changeType(event.target.value as VehicleConfigurationType)} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <option value="stock">Stock</option>
          <option value="modified">Modified</option>
          <option value="custom_build">Custom build</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">Confirm the vehicle as it is now. VIN-decoded factory equipment may no longer be installed.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <OriginalEquipmentCheck name="engine_original" label="Original engine/motor" checked={engineOriginal} onChange={setEngineOriginal} disabled={configurationType === "stock"} />
        <OriginalEquipmentCheck name="transmission_original" label="Original transmission" checked={transmissionOriginal} onChange={setTransmissionOriginal} disabled={configurationType === "stock"} />
        <OriginalEquipmentCheck name="drivetrain_original" label="Original drivetrain" checked={drivetrainOriginal} onChange={setDrivetrainOriginal} disabled={configurationType === "stock"} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mileage_status">Does the odometer represent the vehicle&rsquo;s actual mileage?</Label>
        <select id="mileage_status" name="mileage_status" defaultValue={initialMileageStatus} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <option value="actual">Yes, actual mileage</option>
          <option value="not_actual">No, mileage is not actual</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
      {configurationType === "custom_build" ? (
        <p className="text-sm text-muted-foreground">
          {vehicleId ? <Link className="font-semibold text-primary hover:underline" href={`/dashboard/vehicles/${vehicleId}?tab=build`}>Open Build Progression</Link> : "After saving, open Build Progression"} to document each swap and modification.
        </p>
      ) : null}
    </fieldset>
  );
}

function OriginalEquipmentCheck({ name, label, checked, onChange, disabled }: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4" />
      <span>{label}</span>
    </label>
  );
}
