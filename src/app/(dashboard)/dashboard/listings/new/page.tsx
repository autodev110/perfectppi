import Link from "next/link";
import { getMyVehicles } from "@/features/vehicles/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewListingForm } from "./new-listing-form";

export default async function NewMarketplaceListingPage() {
  const vehicles = await getMyVehicles();
  const publicVehicles = vehicles.filter((vehicle) => vehicle.visibility === "public");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Create Marketplace Listing</h1>
        <p className="text-muted-foreground">
          List a public vehicle for sale and connect buyers to its vehicle profile.
        </p>
      </div>

      {publicVehicles.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">No public vehicles available to list</p>
            <p className="mx-auto mt-2 mb-5 max-w-md text-sm text-muted-foreground">
              Marketplace listings require a public vehicle profile. Make one of your vehicles public first, then come back here.
            </p>
            <Button asChild>
              <Link href="/dashboard/vehicles">Go to Vehicles</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Listing Details</CardTitle>
          </CardHeader>
          <CardContent>
            <NewListingForm vehicles={publicVehicles} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
