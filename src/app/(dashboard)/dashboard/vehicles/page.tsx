import { getMyVehicles } from "@/features/vehicles/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Car } from "lucide-react";
import Link from "next/link";
import { formatMileage } from "@/lib/utils/formatting";

export default async function VehiclesPage() {
  const vehicles = await getMyVehicles();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">My Vehicles</h1>
          <p className="text-muted-foreground">
            Manage your vehicles and start inspections.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/vehicles/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Vehicle
          </Link>
        </Button>
      </div>

      {vehicles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Car className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No vehicles yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Add your first vehicle to get started.
            </p>
            <Button asChild>
              <Link href="/dashboard/vehicles/new">Add Vehicle</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => (
            <Link
              key={vehicle.id}
              href={`/dashboard/vehicles/${vehicle.id}`}
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </p>
                      {vehicle.trim && (
                        <p className="text-sm text-muted-foreground">
                          {vehicle.trim}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        vehicle.visibility === "public"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {vehicle.visibility}
                    </Badge>
                  </div>
                  {vehicle.mileage != null && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatMileage(vehicle.mileage)} miles
                    </p>
                  )}
                  {vehicle.vin && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      VIN: {vehicle.vin}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
