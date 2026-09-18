import { notFound } from "next/navigation";
import { getOwnedVehicle } from "@/features/vehicles/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditVehicleForm } from "../edit-vehicle-form";
import { ensureFactorySpec } from "@/features/vehicles/factory-spec";
import { factorySpecSummary } from "@/lib/vehicles/factory-spec";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const uiText = await getRequestTranslator();
  const { id } = await params;
  const vehicle = await getOwnedVehicle(id);
  if (!vehicle) notFound();
  const factorySpec = await ensureFactorySpec(vehicle);
  const factory = factorySpec ? factorySpecSummary(factorySpec) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.edit_vehicle_923cfcefff")}</h1>
        <p className="text-sm text-muted-foreground">{uiText("ui.update_the_details_used_across_inspections_r_2e476eb9eb")}</p>
      </div>
      <Card>
        <CardHeader><CardTitle>{uiText("ui.vehicle_information_e1f8540b9b")}</CardTitle></CardHeader>
        <CardContent><EditVehicleForm vehicle={vehicle} factory={factory} /></CardContent>
      </Card>
    </div>
  );
}
