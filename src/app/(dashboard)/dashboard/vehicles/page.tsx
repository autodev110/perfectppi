import { getMyVehicles } from "@/features/vehicles/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Car, ClipboardCheck, KeyRound, Tag } from "lucide-react";
import Link from "next/link";
import { formatDate, formatMileage } from "@/lib/utils/formatting";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

type GarageFilter = "all" | "owned" | "previously_owned" | "considering" | "project" | "listed";

const garageFilters: Array<{ value: GarageFilter; label: string }> = [
  { value: "all", label: uiText("ui.all_a52ace420f") },
  { value: "owned", label: uiText("ui.owned_17b760c41c") },
  { value: "previously_owned", label: uiText("ui.previously_owned_c56be55e86") },
  { value: "considering", label: uiText("ui.shopping_b5b68f9d45") },
  { value: "project", label: uiText("ui.projects_04e2a9728a") },
  { value: "listed", label: uiText("ui.listed_78797afdac") },
];

function parseGarageFilter(value?: string): GarageFilter {
  return garageFilters.some((filter) => filter.value === value) ? value as GarageFilter : "all";
}

function ownershipLabel(value: string) {
  if (value === "previously_owned") return uiText("ui.previously_owned_c56be55e86");
  if (value === "considering") return uiText("ui.shopping_considering_2850c42eca");
  if (value === "project") return uiText("ui.project_9859597853");
  return uiText("ui.owned_17b760c41c");
}

function inspectionLabel(status: string) {
  if (status === "completed" || status === "submitted") return uiText("ui.report_available_d39fe6f159");
  if (status === "in_progress") return uiText("ui.inspection_in_progress_10dbbf898b");
  if (status === "needs_revision") return uiText("ui.inspection_needs_revision_b2625875bd");
  return status.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const uiText = await getRequestTranslator();
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
          <h1 className="font-heading text-2xl font-bold">{uiText("ui.garage_b15f625351")}</h1>
          <p className="text-muted-foreground">{uiText("ui.keep_your_vehicles_projects_and_shopping_lis_e428aecffd")}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/vehicles/claim">
              <KeyRound className="mr-2 h-4 w-4" />{uiText("ui.claim_purchased_vehicle_2a5c01dcab")}</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/vehicles/new">
              <Plus className="mr-2 h-4 w-4" />{uiText("ui.add_vehicle_f10cf1da45")}</Link>
          </Button>
        </div>
      </div>

      {vehicles.length > 0 && (
        <nav aria-label={uiText("ui.garage_filters_538321f678")} className="flex gap-2 overflow-x-auto pb-1">
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
            <p className="text-lg font-medium">{uiText("ui.no_vehicles_yet_fb626259b2")}</p>
            <p className="mb-4 text-sm text-muted-foreground">{uiText("ui.add_your_first_vehicle_to_get_started_f4aa5eadf3")}</p>
            <Button asChild>
              <Link href="/dashboard/vehicles/new">{uiText("ui.add_vehicle_f10cf1da45")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : filteredVehicles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Car className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">{uiText("ui.no_vehicles_match_this_filter_ee71f9dc27")}</p>
            <Button asChild variant="outline" className="mt-4"><Link href="/dashboard/vehicles">{uiText("ui.view_all_garage_vehicles_65c2b6b560")}</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredVehicles.map((vehicle) => {
            const primaryMedia =
              vehicle.vehicle_media?.find((media) => media.is_primary) ??
              vehicle.vehicle_media?.[0] ??
              null;
            const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") || uiText("ui.unnamed_vehicle_7e4f43f340");
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
                        alt={uiText("ui.text_f6f18193e0", { arg0: String(vehicle.year ?? ""), arg1: String(vehicle.make ?? ""), arg2: String(vehicle.model ?? "") }).trim()}
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
                        {formatMileage(vehicle.mileage)}{uiText("ui.miles_9e73814859")}{vehicle.mileage_updated_at ? uiText("ui.updated_957137ce63", { arg0: String(formatDate(vehicle.mileage_updated_at)) }) : ""}
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
                        <Badge variant="outline" className="gap-1"><Tag className="h-3 w-3" />{uiText("ui.listed_78797afdac")}</Badge>
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
