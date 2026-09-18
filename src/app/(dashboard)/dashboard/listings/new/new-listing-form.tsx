"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMarketplaceListing } from "@/features/marketplace/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/types/database";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];

type NewListingFormProps = {
  vehicles: Vehicle[];
  selectedVehicleId?: string;
};

function getVehicleLabel(vehicle: Vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ") || uiText("ui.untitled_vehicle_eef05c613f");
}

export function NewListingForm({ vehicles, selectedVehicleId }: NewListingFormProps) {
  const uiText = useTranslator();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);

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
        <Label htmlFor="vehicle_id">{uiText("ui.public_vehicle_2e000c8a74")}</Label>
        <select
          id="vehicle_id"
          name="vehicle_id"
          required
          defaultValue={selectedVehicle?.id ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">{uiText("ui.choose_a_vehicle_ca614cc611")}</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {getVehicleLabel(vehicle)}
              {vehicle.vin ? uiText("ui.text_913ac5c53d", { arg0: String(vehicle.vin) }) : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{uiText("ui.only_vehicles_marked_public_can_be_listed_on_de20d0896d")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">{uiText("ui.listing_title_ba77096dda")}</Label>
          <Input id="title" name="title" placeholder={uiText("ui.2019_porsche_911_carrera_s_951d4f7057")} maxLength={120} defaultValue={selectedVehicle ? getVehicleLabel(selectedVehicle) : ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="asking_price">{uiText("ui.asking_price_fceb05be22")}</Label>
          <Input id="asking_price" name="asking_price" type="number" min="1" step="1" placeholder="87500" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">{uiText("ui.location_15b61974b2")}</Label>
        <Input id="location" name="location" placeholder={uiText("ui.atlanta_ga_4acf97a20f")} maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{uiText("ui.description_526e0087cc")}</Label>
        <Textarea
          id="description"
          name="description"
          placeholder={uiText("ui.add_buyer_facing_details_keep_it_factual_and_8552808607")}
          maxLength={1200}
          rows={5}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading || vehicles.length === 0}>
          {loading ? uiText("ui.creating_def70944c9") : uiText("ui.create_listing_c1f821ab02")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>{uiText("ui.cancel_19766ed6cc")}</Button>
      </div>
    </form>
  );
}
