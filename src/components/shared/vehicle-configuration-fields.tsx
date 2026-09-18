"use client";

import Link from "next/link";
import { useState } from "react";
import { Label } from "@/components/ui/label";

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
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
      <legend className="px-2 text-sm font-semibold">{uiText("ui.configuration_check_2bed81ff40")}</legend>
      <div className="space-y-2">
        <Label htmlFor="configuration_type">{uiText("ui.how_is_this_vehicle_configured_5e80fda398")}</Label>
        <select id="configuration_type" name="configuration_type" value={configurationType} onChange={(event) => changeType(event.target.value as VehicleConfigurationType)} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <option value="stock">{uiText("ui.stock_d5cade7ef3")}</option>
          <option value="modified">{uiText("ui.modified_e8ce5dcaf4")}</option>
          <option value="custom_build">{uiText("ui.custom_build_4a2a5141b7")}</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">{uiText("ui.confirm_the_vehicle_as_it_is_now_vin_decoded_9f43c46e51")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <OriginalEquipmentCheck name="engine_original" label={uiText("ui.original_engine_motor_fe829350bc")} checked={engineOriginal} onChange={setEngineOriginal} disabled={configurationType === "stock"} />
        <OriginalEquipmentCheck name="transmission_original" label={uiText("ui.original_transmission_ce6a6b28d9")} checked={transmissionOriginal} onChange={setTransmissionOriginal} disabled={configurationType === "stock"} />
        <OriginalEquipmentCheck name="drivetrain_original" label={uiText("ui.original_drivetrain_95198e1ba7")} checked={drivetrainOriginal} onChange={setDrivetrainOriginal} disabled={configurationType === "stock"} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mileage_status">{uiText("ui.does_the_odometer_represent_the_vehicle_s_ac_b9c0676c08")}</Label>
        <select id="mileage_status" name="mileage_status" defaultValue={initialMileageStatus} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <option value="actual">{uiText("ui.yes_actual_mileage_8fe4900f63")}</option>
          <option value="not_actual">{uiText("ui.no_mileage_is_not_actual_4b7c6d19e6")}</option>
          <option value="unknown">{uiText("ui.unknown_b764cdc0ea")}</option>
        </select>
      </div>
      {configurationType === "custom_build" ? (
        <p className="text-sm text-muted-foreground">
          {vehicleId ? <Link className="font-semibold text-primary hover:underline" href={`/dashboard/vehicles/${vehicleId}?tab=build`}>{uiText("ui.open_build_progression_fa22816eda")}</Link> : uiText("ui.after_saving_open_build_progression_06fefe34bc")}{uiText("ui.to_document_each_swap_and_modification_e513c4161b")}</p>
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
