import type { Metadata } from "next";
import Link from "next/link";
import { getMarketplaceListings } from "@/features/marketplace/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatMileage } from "@/lib/utils/formatting";
import { ArrowRight, Car, Gauge, MapPin, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    make?: string;
    model?: string;
    minYear?: string;
    maxYear?: string;
    maxPrice?: string;
    sort?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Marketplace — PerfectPPI",
  description: "Browse public vehicle listings backed by PerfectPPI inspection context.",
};

export default async function MarketplacePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { q, make, model, minYear, maxYear, maxPrice, sort } = params;

  const listings = await getMarketplaceListings({
    q,
    make,
    model,
    minYear: minYear ? parseInt(minYear) : undefined,
    maxYear: maxYear ? parseInt(maxYear) : undefined,
    maxPrice: maxPrice ? parseInt(maxPrice) : undefined,
    sort: sort as "newest" | "oldest" | "price_asc" | "price_desc" | "mileage_asc" | undefined,
  });

  const hasFilters = !!(q || make || model || minYear || maxYear || maxPrice || sort);
  const activeFilterCount = [q, make, model, minYear, maxYear, maxPrice, sort].filter(Boolean).length;

  return (
    <div className="bg-surface min-h-screen">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative px-8 pt-28 pb-14 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-surface-container-low to-transparent" />
        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="max-w-3xl">
            <h1 className="font-heading text-4xl md:text-5xl font-extrabold tracking-tighter text-on-surface leading-[1.02] mb-4">
              Browse vehicles with inspection context built in.
            </h1>
            <p className="text-on-surface-variant text-base max-w-2xl leading-relaxed mb-8">
              Every listing links to a real PPI history, vehicle profile, and VSC readiness — not just a photo and a price.
            </p>
          </div>

          {/* Search + sort bar */}
          <form className="max-w-5xl" action="/marketplace" method="GET">
            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
                <Input
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder="Search make, model, VIN, or location…"
                  className="pl-9 h-12 rounded-xl bg-surface-container-lowest ghost-border"
                />
              </div>
              <select
                name="sort"
                defaultValue={sort ?? "newest"}
                className="h-12 rounded-xl px-4 text-sm font-bold bg-surface-container-lowest ghost-border text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[180px]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="mileage_asc">Lowest mileage</option>
              </select>
              <Button type="submit" className="h-12 rounded-xl px-7">
                Search
              </Button>
            </div>

            {/* Filter row */}
            <div className="flex flex-wrap gap-3 items-center">
              <span className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters:
              </span>
              <Input
                name="make"
                defaultValue={make ?? ""}
                placeholder="Make"
                className="h-9 w-28 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <Input
                name="model"
                defaultValue={model ?? ""}
                placeholder="Model"
                className="h-9 w-28 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <Input
                name="minYear"
                defaultValue={minYear ?? ""}
                placeholder="Min year"
                type="number"
                className="h-9 w-24 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <Input
                name="maxYear"
                defaultValue={maxYear ?? ""}
                placeholder="Max year"
                type="number"
                className="h-9 w-24 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <Input
                name="maxPrice"
                defaultValue={maxPrice ?? ""}
                placeholder="Max price $"
                type="number"
                className="h-9 w-32 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              {hasFilters && (
                <Link
                  href="/marketplace"
                  className="flex items-center gap-1.5 h-9 px-3 text-xs font-bold text-on-surface-variant ghost-border rounded-lg bg-surface-container-lowest hover:bg-surface-container transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear {activeFilterCount > 1 ? `(${activeFilterCount})` : ""}
                </Link>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* ── Results ────────────────────────────────────────────── */}
      <section className="px-8 pb-20">
        <div className="max-w-7xl mx-auto">
          {/* Results count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-on-surface-variant font-semibold">
              {listings.length === 0
                ? "No listings found"
                : `${listings.length} listing${listings.length !== 1 ? "s" : ""} found`}
              {hasFilters && " · Filtered"}
            </p>
            {hasFilters && (
              <Badge variant="outline" className="text-xs">
                Filtered results
              </Badge>
            )}
          </div>

          {listings.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-[1.75rem] ghost-border p-12 text-center shadow-sm">
              <Car className="h-12 w-12 mx-auto mb-4 text-on-surface-variant/30" />
              <h2 className="font-heading text-xl font-extrabold tracking-tight text-on-surface mb-2">
                {hasFilters ? "No listings match your filters" : "No active listings yet"}
              </h2>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto mb-6">
                {hasFilters
                  ? "Try adjusting or clearing your filters to see more results."
                  : "Listings appear here once sellers publish public vehicles to the marketplace."}
              </p>
              {hasFilters ? (
                <Button asChild variant="outline">
                  <Link href="/marketplace">Clear filters</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/dashboard/listings/new">Create a listing</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {listings.map((listing) => {
                const vehicle = listing.vehicle;
                const primaryMedia = vehicle?.vehicle_media?.find((media) => media.is_primary) ?? vehicle?.vehicle_media?.[0];
                const vehicleName = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || listing.title;

                return (
                  <Link
                    key={listing.id}
                    href={`/vehicle/${listing.vehicle_id}?tab=marketplace`}
                    className="group bg-surface-container-lowest rounded-[1.5rem] overflow-hidden ghost-border shadow-sm hover:shadow-xl transition-all"
                  >
                    <div className="relative h-56 bg-surface-container-low overflow-hidden">
                      {primaryMedia ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={primaryMedia.url}
                          alt={vehicleName ?? ""}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Car className="h-14 w-14 text-on-surface-variant/20" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-primary-container/70 via-transparent to-transparent opacity-80" />
                      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-white font-heading font-extrabold text-xl tracking-tight leading-tight">
                            {vehicleName}
                          </p>
                          {vehicle?.trim && (
                            <p className="text-white/70 text-xs font-bold mt-1">{vehicle.trim}</p>
                          )}
                        </div>
                        <Badge className="bg-white/90 text-primary hover:bg-white/90">
                          {formatCurrency(listing.asking_price_cents)}
                        </Badge>
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      <div>
                        <p className="font-heading font-bold text-on-surface line-clamp-1">
                          {listing.title ?? vehicleName}
                        </p>
                        {listing.description && (
                          <p className="mt-1 text-sm text-on-surface-variant line-clamp-2">
                            {listing.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {vehicle?.mileage != null && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-[11px] font-bold text-on-surface-variant ghost-border">
                            <Gauge className="h-3 w-3" />
                            {formatMileage(vehicle.mileage)} mi
                          </span>
                        )}
                        {listing.location && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-[11px] font-bold text-on-surface-variant ghost-border">
                            <MapPin className="h-3 w-3" />
                            {listing.location}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3 py-1 text-[11px] font-bold text-teal ghost-border">
                          <ShieldCheck className="h-3 w-3" />
                          PPI Profile
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <p className="text-xs text-on-surface-variant">
                          {listing.seller?.display_name ?? listing.seller?.username ?? "PerfectPPI user"}
                        </p>
                        <span className="flex items-center gap-1 text-xs font-bold text-on-tertiary-container group-hover:gap-2 transition-all">
                          View details
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
