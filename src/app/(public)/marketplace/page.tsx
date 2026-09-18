import type { Metadata } from "next";
import Link from "next/link";
import { getMarketplaceListingsCursorPage } from "@/features/marketplace/queries";
import { getSavedSearch, listSavedSearches } from "@/features/marketplace/saved-searches";
import { getCurrentSocialProfileId } from "@/features/social/relationships";
import { ListingSaveButton } from "@/components/shared/listing-save-button";
import { SavedSearchControls } from "@/components/shared/saved-search-controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate, formatMileage } from "@/lib/utils/formatting";
import {
  BODY_STYLE_OPTIONS,
  DRIVETRAIN_OPTIONS,
  MARKETPLACE_SORT_LABELS,
  MARKETPLACE_SORTS,
  SELLER_TYPE_LABELS,
  SELLER_TYPES,
  TRANSMISSION_OPTIONS,
  filtersToSearchParams,
  hasActiveFilters,
  parseMarketplaceFilters,
} from "@/lib/marketplace/filters";
import { ArrowRight, Car, ClipboardCheck, Gauge, MapPin, Search, ShieldCheck, SlidersHorizontal, Wrench, X } from "lucide-react";
import { decodeMarketplaceCursor } from "@/features/marketplace/cursor";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: uiText("ui.marketplace_perfectppi_35baa983dc"),
  description: uiText("ui.browse_public_vehicle_listings_backed_by_per_52e9baa623"),
};

export default async function MarketplacePage({ searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const params = await searchParams;
  const viewerId = await getCurrentSocialProfileId();
  // ?saved=<id> applies one of the member's saved searches (plan 25.1).
  const savedParam = typeof params.saved === "string" ? params.saved : null;
  const savedSearch = viewerId && savedParam ? await getSavedSearch(savedParam) : null;
  const filters = savedSearch ? savedSearch.filters : parseMarketplaceFilters(params);
  const rawCursor = typeof params.cursor === "string" ? params.cursor : null;
  const cursor = rawCursor ? decodeMarketplaceCursor(rawCursor, filters) : null;
  const isContinuation = cursor !== null;
  const [results, savedSearches] = await Promise.all([
    getMarketplaceListingsCursorPage(filters, cursor),
    viewerId ? listSavedSearches() : Promise.resolve([]),
  ]);
  const listings = results.items;
  const pageHref = (cursor?: string) => {
    const search = savedSearch ? new URLSearchParams({ saved: savedSearch.id }) : filtersToSearchParams(filters);
    if (cursor) search.set("cursor", cursor);
    const qs = search.toString();
    return qs ? `/marketplace?${qs}` : "/marketplace";
  };
  const { q, make, model, minYear, maxYear, maxPrice, sort, maxMileage, transmission, drivetrain, bodyStyle, region, inspected, sellerType } = filters;

  const hasFilters = hasActiveFilters(filters) || Boolean(sort);
  const activeFilterCount = Array.from(filtersToSearchParams(filters).keys()).length;
  const selectClass = "h-9 rounded-lg px-3 text-sm bg-surface-container-lowest ghost-border text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="bg-surface min-h-screen">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative px-8 pt-28 pb-14 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-surface-container-low to-transparent" />
        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="max-w-3xl">
            <h1 className="font-heading text-4xl md:text-5xl font-extrabold tracking-tighter text-on-surface leading-[1.02] mb-4">{uiText("ui.browse_vehicles_with_inspection_context_buil_fdc02f31ec")}</h1>
            <p className="text-on-surface-variant text-base max-w-2xl leading-relaxed mb-8">{uiText("ui.every_listing_links_to_a_real_ppi_history_ve_e1b9a39c61")}</p>
          </div>

          {/* Search + sort bar */}
          <form className="max-w-5xl" action="/marketplace" method="GET">
            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
                <Input
                  aria-label={uiText("ui.search_marketplace_4d190d1d72")}
                  name="q"
                  defaultValue={q ?? ""}
                  placeholder={uiText("ui.search_make_model_or_location_1ee5c010bb")}
                  className="pl-9 h-12 rounded-xl bg-surface-container-lowest ghost-border"
                />
              </div>
              <select
                aria-label={uiText("ui.sort_listings_4aa3cd305d")}
                name="sort"
                defaultValue={sort ?? "newest"}
                className="h-12 rounded-xl px-4 text-sm font-bold bg-surface-container-lowest ghost-border text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[180px]"
              >
                {MARKETPLACE_SORTS.map((entry) => <option key={entry} value={entry}>{MARKETPLACE_SORT_LABELS[entry]}</option>)}
              </select>
              <Button type="submit" className="h-12 rounded-xl px-7">{uiText("ui.search_49c266baaa")}</Button>
            </div>

            {/* Filter row */}
            <div className="flex flex-wrap gap-3 items-center">
              <span className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                <SlidersHorizontal className="h-3.5 w-3.5" />{uiText("ui.filters_b2837bf73f")}</span>
              <Input
                aria-label={uiText("ui.filter_by_make_5089eeca0d")}
                name="make"
                defaultValue={make ?? ""}
                placeholder={uiText("ui.make_ccdd25d423")}
                className="h-9 w-28 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <Input
                aria-label={uiText("ui.filter_by_model_32e7fdecec")}
                name="model"
                defaultValue={model ?? ""}
                placeholder={uiText("ui.model_5e2c614c23")}
                className="h-9 w-28 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <Input
                aria-label={uiText("ui.minimum_year_5806468df1")}
                name="minYear"
                defaultValue={minYear ?? ""}
                placeholder={uiText("ui.min_year_dbd74c91c8")}
                type="number"
                className="h-9 w-24 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <Input
                aria-label={uiText("ui.maximum_year_e6d21d6ca8")}
                name="maxYear"
                defaultValue={maxYear ?? ""}
                placeholder={uiText("ui.max_year_1989c6bdd7")}
                type="number"
                className="h-9 w-24 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <Input
                aria-label={uiText("ui.maximum_price_74d84d0314")}
                name="maxPrice"
                defaultValue={maxPrice ?? ""}
                placeholder={uiText("ui.max_price_91c72849ad")}
                type="number"
                className="h-9 w-32 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <Input
                aria-label={uiText("ui.maximum_mileage_d03dba201b")}
                name="maxMileage"
                defaultValue={maxMileage ?? ""}
                placeholder={uiText("ui.max_miles_05656d9375")}
                type="number"
                className="h-9 w-28 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <Input
                aria-label={uiText("ui.city_or_region_efb8875415")}
                name="region"
                defaultValue={region ?? ""}
                placeholder={uiText("ui.city_region_df7299b012")}
                className="h-9 w-32 text-sm rounded-lg bg-surface-container-lowest ghost-border"
              />
              <select aria-label={uiText("ui.transmission_3e10134259")} name="transmission" defaultValue={transmission ?? ""} className={selectClass}>
                <option value="">{uiText("ui.any_transmission_572b6a6a64")}</option>
                {TRANSMISSION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select aria-label={uiText("ui.drivetrain_203e886158")} name="drivetrain" defaultValue={drivetrain ?? ""} className={selectClass}>
                <option value="">{uiText("ui.any_drivetrain_68b6c211d5")}</option>
                {DRIVETRAIN_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select aria-label={uiText("ui.body_style_191c24bf12")} name="bodyStyle" defaultValue={bodyStyle ?? ""} className={selectClass}>
                <option value="">{uiText("ui.any_body_65dd43dd9b")}</option>
                {BODY_STYLE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select aria-label={uiText("ui.seller_type_13685f8f8c")} name="sellerType" defaultValue={sellerType ?? ""} className={selectClass}>
                <option value="">{uiText("ui.any_seller_d512c305bd")}</option>
                {SELLER_TYPES.map((option) => <option key={option} value={option}>{SELLER_TYPE_LABELS[option]}</option>)}
              </select>
              <label className="flex h-9 items-center gap-1.5 rounded-lg bg-surface-container-lowest px-3 text-xs font-bold text-on-surface ghost-border">
                <input type="checkbox" name="inspected" value="true" defaultChecked={Boolean(inspected)} className="rounded" />{uiText("ui.inspected_only_2651167b3b")}</label>
              {hasFilters && (
                <Link
                  href="/marketplace"
                  className="flex items-center gap-1.5 h-9 px-3 text-xs font-bold text-on-surface-variant ghost-border rounded-lg bg-surface-container-lowest hover:bg-surface-container transition-colors"
                >
                  <X className="h-3.5 w-3.5" />{uiText("ui.clear_50ad5f03e5")}{activeFilterCount > 1 ? uiText("ui.text_08d7002db4", { arg0: String(activeFilterCount) }) : ""}
                </Link>
              )}
            </div>
          </form>
          {viewerId ? <SavedSearchControls searches={savedSearches} current={filters} activeId={savedSearch?.id ?? null} /> : null}
        </div>
      </section>

      {/* ── Results ────────────────────────────────────────────── */}
      <section className="px-8 pb-20">
        <div className="max-w-7xl mx-auto">
          {/* Results count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-on-surface-variant font-semibold">
              {results.total === 0
                ? uiText("ui.no_listings_found_a941983250")
                : uiText("ui.listing_found_43760c4b12", { arg0: String(results.total), arg1: String(results.total !== 1 ? "s" : "") })}
              {isContinuation ? uiText("ui.more_results_5eccdc9d50") : ""}
              {hasFilters && " · Filtered"}
            </p>
            {hasFilters && (
              <Badge variant="outline" className="text-xs">{uiText("ui.filtered_results_589a61535d")}</Badge>
            )}
          </div>

          {listings.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-[1.75rem] ghost-border p-12 text-center shadow-sm">
              <Car className="h-12 w-12 mx-auto mb-4 text-on-surface-variant/30" />
              <h2 className="font-heading text-xl font-extrabold tracking-tight text-on-surface mb-2">
                {hasFilters ? uiText("ui.no_listings_match_your_filters_1edc10f263") : uiText("ui.no_active_listings_yet_608b89fa17")}
              </h2>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto mb-6">
                {hasFilters
                  ? uiText("ui.try_adjusting_or_clearing_your_filters_to_se_1ae024fad3")
                  : uiText("ui.listings_appear_here_once_sellers_publish_pu_1269435d84")}
              </p>
              {hasFilters ? (
                <Button asChild variant="outline">
                  <Link href="/marketplace">{uiText("ui.clear_filters_7179ea0035")}</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/dashboard/listings/new">{uiText("ui.create_a_listing_9a697d39c1")}</Link>
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
                  <div key={listing.id} className="relative min-w-0">
                  {viewerId && !listing.viewer_is_seller ? (
                    <div className="absolute right-4 top-4 z-10">
                      <ListingSaveButton listingId={listing.id} initialSaved={listing.saved_by_viewer} />
                    </div>
                  ) : null}
                  <Link
                    href={`/marketplace/listings/${listing.id}`}
                    className="group block min-w-0 bg-surface-container-lowest rounded-[1.5rem] overflow-hidden ghost-border shadow-sm hover:shadow-xl transition-all"
                  >
                    <div className="relative h-56 bg-surface-container-low overflow-hidden">
                      {primaryMedia ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={primaryMedia.url}
                          alt={vehicleName ?? ""}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Car className="h-14 w-14 text-on-surface-variant/20" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-primary-container/70 via-transparent to-transparent opacity-80" />
                      {listing.inspection_summary && (
                        // Scope and date, never an unexplained "verified" (plan 25.1).
                        <Badge className="absolute left-4 top-4 gap-1.5 bg-white/95 text-primary hover:bg-white/95">
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          {listing.inspection_summary.scope === "dents_tires" ? uiText("ui.dents_tires_ea36eba96f") : uiText("ui.complete_143b270a32")}{uiText("ui.inspection_93d87894ad")}{formatDate(listing.inspection_summary.inspected_at)}
                        </Badge>
                      )}
                      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white font-heading font-extrabold text-xl tracking-tight leading-tight line-clamp-2">
                            {vehicleName}
                          </p>
                          {vehicle?.trim && (
                            <p className="text-white/70 text-xs font-bold mt-1 truncate">{vehicle.trim}</p>
                          )}
                        </div>
                        <Badge className="shrink-0 bg-white/90 text-primary hover:bg-white/90">
                          {formatCurrency(listing.asking_price_cents)}
                        </Badge>
                      </div>
                    </div>

                    <div className="min-w-0 p-5 space-y-4">
                      <div className="min-w-0">
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
                            {formatMileage(vehicle.mileage)}{uiText("ui.mi_3074dbe604")}</span>
                        )}
                        {listing.seller_type === "technician" && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-[11px] font-bold text-on-surface-variant ghost-border">
                            <Wrench className="h-3 w-3" />{uiText("ui.technician_shop_0da5b39578")}</span>
                        )}
                        {listing.location && (
                          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-[11px] font-bold text-on-surface-variant ghost-border">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{listing.location}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3 py-1 text-[11px] font-bold text-teal ghost-border">
                          <ShieldCheck className="h-3 w-3" />{uiText("ui.ppi_profile_a831aec996")}</span>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <p className="min-w-0 truncate text-xs text-on-surface-variant">
                          {listing.seller?.display_name ?? listing.seller?.username ?? uiText("ui.perfectppi_user_77df1ce619")}
                        </p>
                        <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-on-tertiary-container group-hover:gap-2 transition-all">{uiText("ui.view_details_d1bf045bb5")}<ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                  </div>
                );
              })}
            </div>
          )}
          {results.total > 0 && (isContinuation || results.has_more) ? (
            <nav className="mt-8 flex items-center justify-between" aria-label={uiText("ui.listing_pages_a2c84d9828")}>
              {isContinuation ? <Button asChild variant="outline"><Link href={pageHref()}>{uiText("ui.back_to_first_results_58fbbfa217")}</Link></Button> : <span />}
              {results.has_more ? (
                <Button asChild variant="outline"><Link href={pageHref(results.next_cursor ?? undefined)}>{uiText("ui.more_results_750ecbe1c8")}</Link></Button>
              ) : (
                <p className="text-xs font-semibold text-on-surface-variant">{uiText("ui.that_s_every_listing_ca0b6fe410")}{hasFilters ? uiText("ui.matching_these_filters_bd5f84477f") : ""}.</p>
              )}
            </nav>
          ) : null}
        </div>
      </section>
    </div>
  );
}
