import { notFound } from "next/navigation";
import { getVehicle } from "@/features/vehicles/queries";
import {
  deleteVehiclePhoto,
  makeVehiclePrivate,
  makeVehiclePublic,
} from "@/features/vehicles/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMileage } from "@/lib/utils/formatting";
import Link from "next/link";
import { Car, ClipboardCheck, ExternalLink } from "lucide-react";
import { VehiclePhotoUploader } from "./vehicle-photo-uploader";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vehicle = await getVehicle(id);

  if (!vehicle) notFound();

  const primaryMedia =
    vehicle.vehicle_media?.find((media) => media.is_primary) ??
    vehicle.vehicle_media?.[0] ??
    null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
          {vehicle.trim && (
            <p className="text-muted-foreground">{vehicle.trim}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Badge
            variant={vehicle.visibility === "public" ? "default" : "secondary"}
          >
            {vehicle.visibility}
          </Badge>
          {vehicle.visibility === "public" && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/vehicle/${vehicle.id}`} target="_blank">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                View Public Page
              </Link>
            </Button>
          )}
        </div>
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
          <CardTitle>Vehicle Photo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="overflow-hidden rounded-xl border bg-muted">
            {primaryMedia ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primaryMedia.url}
                alt={`${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()}
                className="h-56 w-full object-cover"
              />
            ) : (
              <div className="flex h-56 w-full items-center justify-center">
                <Car className="h-12 w-12 text-muted-foreground/40" />
              </div>
            )}
          </div>
          <div className="space-y-4">
            <VehiclePhotoUploader vehicleId={vehicle.id} />
            {primaryMedia && (
              <form action={deleteVehiclePhoto}>
                <input type="hidden" name="vehicle_id" value={vehicle.id} />
                <input type="hidden" name="media_id" value={primaryMedia.id} />
                <Button type="submit" variant="outline">
                  Remove Current Photo
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visibility</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">
              This vehicle is currently {vehicle.visibility}.
            </p>
            <p className="text-sm text-muted-foreground">
              Public vehicles are visible to anyone with the link and can be listed on the marketplace.
            </p>
          </div>
          {vehicle.visibility === "public" ? (
            <form action={makeVehiclePrivate}>
              <input type="hidden" name="vehicle_id" value={vehicle.id} />
              <Button type="submit" variant="outline">
                Make Private
              </Button>
            </form>
          ) : (
            <form action={makeVehiclePublic}>
              <input type="hidden" name="vehicle_id" value={vehicle.id} />
              <Button type="submit">
                Make Public
              </Button>
            </form>
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
