import { getMyVehicles } from "@/features/vehicles/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Car, ClipboardCheck, Tag } from "lucide-react";
import Link from "next/link";
import { formatDate, formatMileage } from "@/lib/utils/formatting";

type GarageFilter = "all" | "owned" | "previously_owned" | "considering" | "project" | "listed";

const garageFilters: Array<{ value: GarageFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "owned", label: "Owned" },
  { value: "previously_owned", label: "Previously owned" },
  { value: "considering", label: "Shopping" },
  { value: "project", label: "Projects" },
  { value: "listed", label: "Listed" },
];

function parseGarageFilter(value?: string): GarageFilter {
  return garageFilters.some((filter) => filter.value === value) ? value as GarageFilter : "all";
}

function ownershipLabel(value: string) {
  if (value === "previously_owned") return "Previously owned";
  if (value === "considering") return "Shopping / considering";
  if (value === "project") return "Project";
  return "Owned";
}

function inspectionLabel(status: string) {
  if (status === "completed" || status === "submitted") return "Report available";
  if (status === "in_progress") return "Inspection in progress";
  if (status === "needs_revision") return "Inspection needs revision";
  return status.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const vehicles = await getMyVehicles();
  const filter = parseGarageFilter((await searchParams).filter);
  const filteredVehicles = vehicles.filter((vehicle) => {
    if (filter === "all") return true;
    if (filter === "listed") return vehicle.marketplace_listings.some((listing) => listing.status === "active");
    return vehicle.ownership_state === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Garage</h1>
          <p className="text-muted-foreground">
            Keep your vehicles, projects, and shopping list organized.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/vehicles/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Vehicle
          </Link>
        </Button>
      </div>

      {vehicles.length > 0 && (
        <nav aria-label="Garage filters" className="flex gap-2 overflow-x-auto pb-1">
          {garageFilters.map((option) => {
            const active = option.value === filter;
            const href = option.value === "all" ? "/dashboard/vehicles" : `/dashboard/vehicles?filter=${option.value}`;
            return (
              <Link
                key={option.value}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </nav>
      )}

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
      ) : filteredVehicles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Car className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No vehicles match this filter</p>
            <Button asChild variant="outline" className="mt-4"><Link href="/dashboard/vehicles">View all Garage vehicles</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredVehicles.map((vehicle) => {
            const primaryMedia =
              vehicle.vehicle_media?.find((media) => media.is_primary) ??
              vehicle.vehicle_media?.[0] ??
              null;
            const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") || "Unnamed vehicle";
            const latestInspection = [...vehicle.ppi_requests].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            const activeListing = vehicle.marketplace_listings.some((listing) => listing.status === "active");

            return (
              <Link
                key={vehicle.id}
                href={`/dashboard/vehicles/${vehicle.id}`}
              >
                <Card className="overflow-hidden transition-shadow hover:shadow-md">
                  <div className="relative flex h-40 items-center justify-center overflow-hidden bg-muted">
                    {primaryMedia ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={primaryMedia.url}
                        alt={`${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <Car className="h-12 w-12 text-muted-foreground/40" />
                    )}
                  </div>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{vehicle.nickname || vehicleLabel}</p>
                        {vehicle.nickname && <p className="truncate text-sm text-muted-foreground">{vehicleLabel}</p>}
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
                        {vehicle.mileage_updated_at ? ` · Updated ${formatDate(vehicle.mileage_updated_at)}` : ""}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="outline">{ownershipLabel(vehicle.ownership_state)}</Badge>
                      {latestInspection && (
                        <Badge variant="outline" className="gap-1">
                          <ClipboardCheck className="h-3 w-3" />
                          {inspectionLabel(latestInspection.status)}
                        </Badge>
                      )}
                      {activeListing && (
                        <Badge variant="outline" className="gap-1"><Tag className="h-3 w-3" />Listed</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
