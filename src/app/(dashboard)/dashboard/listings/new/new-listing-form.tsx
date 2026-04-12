"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMarketplaceListing } from "@/features/marketplace/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/types/database";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];

type NewListingFormProps = {
  vehicles: Vehicle[];
};

function getVehicleLabel(vehicle: Vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ") || "Untitled vehicle";
}

export function NewListingForm({ vehicles }: NewListingFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const result = await createMarketplaceListing(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/dashboard/listings");
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="vehicle_id">Public vehicle *</Label>
        <select
          id="vehicle_id"
          name="vehicle_id"
          required
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">Choose a vehicle</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {getVehicleLabel(vehicle)}
              {vehicle.vin ? ` · ${vehicle.vin}` : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Only vehicles marked public can be listed on the marketplace.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Listing title</Label>
          <Input id="title" name="title" placeholder="2019 Porsche 911 Carrera S" maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="asking_price">Asking price *</Label>
          <Input id="asking_price" name="asking_price" type="number" min="1" step="1" placeholder="87500" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" placeholder="Atlanta, GA" maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="Add buyer-facing details. Keep it factual and avoid claims that are not backed by the inspection."
          maxLength={1200}
          rows={5}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading || vehicles.length === 0}>
          {loading ? "Creating..." : "Create Listing"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
