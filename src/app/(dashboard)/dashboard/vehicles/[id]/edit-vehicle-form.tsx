"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateVehicle } from "@/features/vehicles/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Database } from "@/types/database";
import { VehicleConfigurationFields } from "@/components/shared/vehicle-configuration-fields";
import { VehicleMakeModelFields } from "@/components/shared/vehicle-make-model-fields";
import { CurrentBuildFields, type CurrentBuildValues } from "@/components/shared/current-build-fields";
import type { FactorySummary } from "@/lib/vehicles/factory-spec";

import { useTranslator } from "@/lib/i18n/client";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];

export function EditVehicleForm({ vehicle, factory }: { vehicle: Vehicle; factory: FactorySummary | null }) {
  const uiText = useTranslator();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(vehicle.year?.toString() ?? "");
  const [make, setMake] = useState(vehicle.make ?? "");
  const [model, setModel] = useState(vehicle.model ?? "");
  const [build, setBuild] = useState<CurrentBuildValues>({
    engine: vehicle.engine ?? "", transmission: vehicle.transmission ?? "", drivetrain: vehicle.drivetrain ?? "", body_style: vehicle.body_style ?? "",
  });

  async function save(formData: FormData) {
    setSaving(true);
    setError(null);
    const result = await updateVehicle(vehicle.id, formData);
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push(`/dashboard/vehicles/${vehicle.id}`);
    router.refresh();
  }

  return (
    <form action={save} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={uiText("ui.nickname_d720f61c8c")} name="nickname" defaultValue={vehicle.nickname ?? ""} maxLength={60} />
        <div className="space-y-2">
          <Label htmlFor="ownership_state">{uiText("ui.garage_relationship_e26b2f2b89")}</Label>
          <select
            id="ownership_state"
            name="ownership_state"
            defaultValue={vehicle.ownership_state}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="owned">{uiText("ui.owned_17b760c41c")}</option>
            {vehicle.ownership_state === "previously_owned" && (
              <option value="previously_owned">{uiText("ui.previously_owned_c56be55e86")}</option>
            )}
            <option value="considering">{uiText("ui.shopping_considering_2850c42eca")}</option>
            <option value="project">{uiText("ui.project_9859597853")}</option>
          </select>
        </div>
        <Field label={uiText("ui.year_89f6832560")} name="year" type="number" value={year} onChange={(event) => setYear(event.target.value)} min={1900} max={2100} />
        <div />
        <VehicleMakeModelFields make={make} model={model} year={year} onMakeChange={(value) => { setMake(value); setModel(""); }} onModelChange={setModel} />
        <div className="space-y-2">
          <Label htmlFor="trim">{uiText("ui.trim_aaa5478b26")}</Label>
          <Input id="trim" name="trim" defaultValue={vehicle.trim ?? ""} maxLength={100} />
          {factory?.trim ? <p className="text-xs text-muted-foreground">{uiText("ui.factory_vin_4dded2e01e")}<span className="font-semibold text-foreground">{factory.trim}</span></p> : null}
        </div>
        <CurrentBuildFields
          values={build}
          onChange={(field, value) => setBuild((current) => ({ ...current, [field]: value }))}
          factory={factory}
          originals={{ engine: vehicle.engine_original, transmission: vehicle.transmission_original, drivetrain: vehicle.drivetrain_original }}
        />
        <Field label={uiText("ui.vin_5e0211b12d")} name="vin" defaultValue={vehicle.vin ?? ""} maxLength={17} />
        <Field label={uiText("ui.mileage_ffe44a0179")} name="mileage" type="number" defaultValue={vehicle.mileage ?? ""} />
        <VehicleConfigurationFields
          initialType={vehicle.configuration_type}
          initialEngineOriginal={vehicle.engine_original}
          initialTransmissionOriginal={vehicle.transmission_original}
          initialDrivetrainOriginal={vehicle.drivetrain_original}
          initialMileageStatus={vehicle.mileage_status}
          vehicleId={vehicle.id}
        />
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="visibility">{uiText("ui.visibility_7448611d5f")}</Label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={vehicle.visibility}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="private">{uiText("ui.only_me_bdc0857b99")}</option>
            <option value="friends">{uiText("ui.friends_bd104d1b98")}</option>
            <option value="public">{uiText("ui.public_591935b15b")}</option>
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? uiText("ui.saving_dc85af8f2b") : uiText("ui.save_changes_35322b5bb5")}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>{uiText("ui.cancel_19766ed6cc")}</Button>
      </div>
    </form>
  );
}

function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
