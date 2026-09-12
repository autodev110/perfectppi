import Link from "next/link";
import { getMyMarketplaceListings } from "@/features/marketplace/queries";
import {
  markMarketplaceListingPending,
  markMarketplaceListingSold,
  pauseMarketplaceListing,
  reactivateMarketplaceListing,
  removeMarketplaceListingFromForm,
} from "@/features/marketplace/actions";
import { ConfirmSubmitButton } from "@/components/shared/confirm-submit-button";
import { LISTING_STATUS_LABELS, isListingPublic, listingManageActions } from "@/lib/marketplace/listing-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate, formatMileage } from "@/lib/utils/formatting";
import { Car, ExternalLink, Gauge, Pencil, Plus, Tag } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-teal/10 text-teal border-teal/20",
  pending: "bg-warning/15 text-on-surface border-warning/30",
  paused: "bg-surface-container text-on-surface-variant border-outline-variant",
  sold: "bg-primary/10 text-primary border-primary/20",
  archived: "bg-surface-container text-on-surface-variant border-outline-variant",
  removed: "bg-destructive/10 text-destructive border-destructive/20",
};

export default async function DashboardListingsPage({ searchParams }: { searchParams: Promise<{ error?: string; removed?: string }> }) {
  const [listings, query] = await Promise.all([getMyMarketplaceListings(), searchParams]);

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

      {query.removed ? <p className="rounded-xl bg-surface-container px-4 py-3 text-sm ghost-border">The listing was removed.</p> : null}
      {query.error ? <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{query.error}</p> : null}
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
            // Owners can open their own listing screen in any state (plan
            // 25.2); "Public Page" is only offered while buyers can see it.
            const listingHref = `/marketplace/listings/${listing.id}`;
            const publicHref = isListingPublic(listing.status) && vehicle?.visibility === "public" ? listingHref : null;
            const editHref = listing.status === "removed" ? listingHref : `/dashboard/listings/${listing.id}/edit`;
            const actions = listingManageActions(listing.status);

            return (
              <Card key={listing.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    {/* Fixed box + absolutely positioned image: a tall source
                        photo must not be able to stretch the row. */}
                    <Link
                      href={publicHref ?? editHref}
                      aria-label={
                        publicHref
                          ? `Open ${listing.title} marketplace listing`
                          : `Edit ${listing.title}`
                      }
                      className="relative h-44 w-full shrink-0 overflow-hidden bg-muted sm:h-auto sm:min-h-44 sm:w-48"
                    >
                      {primaryMedia ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={primaryMedia.url}
                          alt={vehicleName}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Car className="h-10 w-10 text-muted-foreground/40" />
                        </div>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1 p-5 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="font-heading text-lg font-bold tracking-tight break-words">
                            <Link
                              href={publicHref ?? editHref}
                              className="hover:text-primary transition-colors"
                            >
                              {listing.title}
                            </Link>
                          </h2>
                          <p className="text-sm text-muted-foreground break-words">{vehicleName}</p>
                        </div>
                        <Badge variant="outline" className={`${STATUS_BADGE[listing.status] ?? ""} shrink-0`}>
                          {LISTING_STATUS_LABELS[listing.status]}
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
                        {listing.status !== "removed" ? (
                          <Button size="sm" asChild>
                            <Link href={editHref}>
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              Edit
                            </Link>
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" asChild>
                          <Link href={listingHref}>
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                            {publicHref ? "Public Page" : "Listing"}
                          </Link>
                        </Button>
                        {actions.includes("resume") ? (
                          <form action={reactivateMarketplaceListing}>
                            <input type="hidden" name="listing_id" value={listing.id} />
                            <Button size="sm" variant="secondary" type="submit">{listing.status === "sold" ? "Relist" : "Resume"}</Button>
                          </form>
                        ) : null}
                        {actions.includes("mark_pending") ? (
                          <form action={markMarketplaceListingPending}>
                            <input type="hidden" name="listing_id" value={listing.id} />
                            <Button size="sm" variant="secondary" type="submit">Mark Pending</Button>
                          </form>
                        ) : null}
                        {actions.includes("mark_sold") ? (
                          <form action={markMarketplaceListingSold}>
                            <input type="hidden" name="listing_id" value={listing.id} />
                            <Button size="sm" variant="secondary" type="submit">Mark Sold</Button>
                          </form>
                        ) : null}
                        {actions.includes("pause") ? (
                          <form action={pauseMarketplaceListing}>
                            <input type="hidden" name="listing_id" value={listing.id} />
                            <Button size="sm" variant="ghost" type="submit">Pause</Button>
                          </form>
                        ) : null}
                        {actions.includes("remove") ? (
                          <form action={removeMarketplaceListingFromForm}>
                            <input type="hidden" name="listing_id" value={listing.id} />
                            <ConfirmSubmitButton
                              message="Remove this listing? Members who saved it or requested an inspection will see it as no longer available. This cannot be undone."
                              className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
                            >
                              Remove
                            </ConfirmSubmitButton>
                          </form>
                        ) : null}
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
