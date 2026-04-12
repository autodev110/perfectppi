import Link from "next/link";
import { getMyMarketplaceListings } from "@/features/marketplace/queries";
import {
  archiveMarketplaceListing,
  markMarketplaceListingSold,
  reactivateMarketplaceListing,
} from "@/features/marketplace/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate, formatMileage } from "@/lib/utils/formatting";
import { Car, ExternalLink, Gauge, Plus, Tag } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-teal/10 text-teal border-teal/20",
  sold: "bg-primary/10 text-primary border-primary/20",
  archived: "bg-surface-container text-on-surface-variant border-outline-variant",
};

export default async function DashboardListingsPage() {
  const listings = await getMyMarketplaceListings();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">My Listings</h1>
          <p className="text-muted-foreground">
            Publish and manage marketplace listings for your public vehicles.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/listings/new">
            <Plus className="mr-2 h-4 w-4" />
            New Listing
          </Link>
        </Button>
      </div>

      {listings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Tag className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No marketplace listings yet</p>
            <p className="mb-4 max-w-md text-sm text-muted-foreground">
              Create your first listing from a public vehicle when you are ready to sell.
            </p>
            <Button asChild>
              <Link href="/dashboard/listings/new">Create Listing</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {listings.map((listing) => {
            const vehicle = listing.vehicle;
            const primaryMedia = vehicle?.vehicle_media?.find((media) => media.is_primary) ?? vehicle?.vehicle_media?.[0];
            const vehicleName = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || listing.title;

            return (
              <Card key={listing.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    <div className="h-44 sm:h-auto sm:w-48 bg-muted flex-shrink-0">
                      {primaryMedia ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={primaryMedia.url}
                          alt={vehicleName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Car className="h-10 w-10 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 p-5 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="font-heading text-lg font-bold tracking-tight">
                            {listing.title}
                          </h2>
                          <p className="text-sm text-muted-foreground">{vehicleName}</p>
                        </div>
                        <Badge variant="outline" className={STATUS_BADGE[listing.status]}>
                          {listing.status}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="font-bold text-foreground">
                          {formatCurrency(listing.asking_price_cents)}
                        </span>
                        {vehicle?.mileage != null && (
                          <span className="inline-flex items-center gap-1">
                            <Gauge className="h-3.5 w-3.5" />
                            {formatMileage(vehicle.mileage)} mi
                          </span>
                        )}
                        <span>Created {formatDate(listing.created_at)}</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/vehicle/${listing.vehicle_id}?tab=marketplace`}>
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                            Public Page
                          </Link>
                        </Button>
                        {listing.status === "active" ? (
                          <>
                            <form action={markMarketplaceListingSold}>
                              <input type="hidden" name="listing_id" value={listing.id} />
                              <Button size="sm" variant="secondary" type="submit">Mark Sold</Button>
                            </form>
                            <form action={archiveMarketplaceListing}>
                              <input type="hidden" name="listing_id" value={listing.id} />
                              <Button size="sm" variant="ghost" type="submit">Archive</Button>
                            </form>
                          </>
                        ) : (
                          <form action={reactivateMarketplaceListing}>
                            <input type="hidden" name="listing_id" value={listing.id} />
                            <Button size="sm" variant="secondary" type="submit">Reactivate</Button>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
