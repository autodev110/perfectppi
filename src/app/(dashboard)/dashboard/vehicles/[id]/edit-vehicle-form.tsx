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
        <Field label="Year" name="year" type="number" defaultValue={vehicle.year ?? ""} />
        <Field label="Make *" name="make" defaultValue={vehicle.make ?? ""} required />
        <Field label="Model *" name="model" defaultValue={vehicle.model ?? ""} required />
        <Field label="Trim" name="trim" defaultValue={vehicle.trim ?? ""} />
        <Field label="VIN" name="vin" defaultValue={vehicle.vin ?? ""} maxLength={17} />
        <Field label="Mileage" name="mileage" type="number" defaultValue={vehicle.mileage ?? ""} />
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
