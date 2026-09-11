"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateVehicle } from "@/features/vehicles/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Database } from "@/types/database";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];

export function EditVehicleForm({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Field label="Nickname" name="nickname" defaultValue={vehicle.nickname ?? ""} maxLength={60} />
        <div className="space-y-2">
          <Label htmlFor="ownership_state">Garage relationship</Label>
          <select
            id="ownership_state"
            name="ownership_state"
            defaultValue={vehicle.ownership_state}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="owned">Owned</option>
            {vehicle.ownership_state === "previously_owned" && (
              <option value="previously_owned">Previously owned</option>
            )}
            <option value="considering">Shopping / considering</option>
            <option value="project">Project</option>
          </select>
        </div>
        <Field label="Year" name="year" type="number" defaultValue={vehicle.year ?? ""} />
        <Field label="Make *" name="make" defaultValue={vehicle.make ?? ""} required />
        <Field label="Model *" name="model" defaultValue={vehicle.model ?? ""} required />
        <Field label="Trim" name="trim" defaultValue={vehicle.trim ?? ""} />
        <Field label="Engine" name="engine" defaultValue={vehicle.engine ?? ""} maxLength={100} />
        <Field label="Drivetrain" name="drivetrain" defaultValue={vehicle.drivetrain ?? ""} maxLength={100} />
        <Field label="Transmission" name="transmission" defaultValue={vehicle.transmission ?? ""} maxLength={100} />
        <Field label="Body style" name="body_style" defaultValue={vehicle.body_style ?? ""} maxLength={100} />
        <Field label="VIN" name="vin" defaultValue={vehicle.vin ?? ""} maxLength={17} />
        <Field label="Mileage" name="mileage" type="number" defaultValue={vehicle.mileage ?? ""} />
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="visibility">Visibility</Label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={vehicle.visibility}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="private">Only me</option>
            <option value="friends">Friends</option>
            <option value="public">Public</option>
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
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
