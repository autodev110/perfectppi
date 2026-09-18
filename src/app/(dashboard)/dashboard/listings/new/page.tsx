import Link from "next/link";
import { getMyVehicles } from "@/features/vehicles/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewListingForm } from "./new-listing-form";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function NewMarketplaceListingPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>;
}) {
  const uiText = await getRequestTranslator();
  const { vehicle: requestedVehicleId } = await searchParams;
  const vehicles = await getMyVehicles();
  const publicVehicles = vehicles.filter((vehicle) => vehicle.visibility === "public");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.create_marketplace_listing_73df568a36")}</h1>
        <p className="text-muted-foreground">{uiText("ui.list_a_public_vehicle_for_sale_and_connect_b_5961bf3530")}</p>
      </div>

      {publicVehicles.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">{uiText("ui.no_public_vehicles_available_to_list_90b98e2106")}</p>
            <p className="mx-auto mt-2 mb-5 max-w-md text-sm text-muted-foreground">{uiText("ui.marketplace_listings_require_a_public_vehicl_a9b498973c")}</p>
            <Button asChild>
              <Link href="/dashboard/vehicles">{uiText("ui.go_to_garage_b024d8456b")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{uiText("ui.listing_details_aabcb4036c")}</CardTitle>
          </CardHeader>
          <CardContent>
            <NewListingForm vehicles={publicVehicles} selectedVehicleId={requestedVehicleId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
