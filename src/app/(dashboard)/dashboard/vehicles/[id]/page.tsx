import { notFound } from "next/navigation";
import { getVehicle } from "@/features/vehicles/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMileage } from "@/lib/utils/formatting";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vehicle = await getVehicle(id);

  if (!vehicle) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
          {vehicle.trim && (
            <p className="text-muted-foreground">{vehicle.trim}</p>
          )}
        </div>
        <Badge
          variant={
            vehicle.visibility === "public" ? "default" : "secondary"
          }
        >
          {vehicle.visibility}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {vehicle.vin && (
            <div>
              <p className="text-sm text-muted-foreground">VIN</p>
              <p className="font-mono">{vehicle.vin}</p>
            </div>
          )}
          {vehicle.mileage != null && (
            <div>
              <p className="text-sm text-muted-foreground">Mileage</p>
              <p>{formatMileage(vehicle.mileage)} miles</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inspections</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No inspections yet for this vehicle.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/dashboard/ppi/new">
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Start Inspection
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
