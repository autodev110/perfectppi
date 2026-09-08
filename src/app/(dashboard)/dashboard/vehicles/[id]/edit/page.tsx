import { notFound } from "next/navigation";
import { getOwnedVehicle } from "@/features/vehicles/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditVehicleForm } from "../edit-vehicle-form";

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await getOwnedVehicle(id);
  if (!vehicle) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Edit Vehicle</h1>
        <p className="text-sm text-muted-foreground">Update the details used across inspections, reports, and listings.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Vehicle Information</CardTitle></CardHeader>
        <CardContent><EditVehicleForm vehicle={vehicle} /></CardContent>
      </Card>
    </div>
  );
}
