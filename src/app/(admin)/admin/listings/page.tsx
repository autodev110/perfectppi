import Link from "next/link";
import { getAdminMarketplaceListings } from "@/features/marketplace/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils/formatting";
import { Car, ExternalLink, Tag } from "lucide-react";

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-teal/10 text-teal border-teal/20",
  sold: "bg-primary/10 text-primary border-primary/20",
  archived: "bg-muted text-muted-foreground border-border",
};

export default async function AdminListingsPage({ searchParams }: PageProps) {
  const { page } = await searchParams;
  const currentPage = Math.max(1, Number(page ?? 1) || 1);
  const { listings, total } = await getAdminMarketplaceListings(currentPage, 50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Marketplace Listings</h1>
        <p className="text-muted-foreground">
          Moderate parent-platform vehicle listings across all sellers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {total} Listings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {listings.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Car className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>No marketplace listings yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {listings.map((listing) => {
                const vehicle = listing.vehicle;
                const vehicleName = [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim]
                  .filter(Boolean)
                  .join(" ") || listing.title;

                return (
                  <div key={listing.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{listing.title}</p>
                        <Badge variant="outline" className={STATUS_BADGE[listing.status]}>
                          {listing.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {vehicleName} · {formatCurrency(listing.asking_price_cents)} · created {formatDate(listing.created_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Seller: {listing.seller?.display_name ?? listing.seller?.username ?? listing.seller_id}
                      </p>
                    </div>
                    <Link
                      href={`/vehicle/${listing.vehicle_id}?tab=marketplace`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      Public page
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
