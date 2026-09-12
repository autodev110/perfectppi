// Marketplace discovery filters (plan 25.1). Client-safe and pure: the same
// shape drives the browse page's query string, saved searches (stored as
// JSON), and the database matcher `marketplace_listing_matches_filters`.
import { z } from "zod";

export const MARKETPLACE_SORTS = ["newest", "oldest", "price_asc", "price_desc", "mileage_asc", "recently_inspected"] as const;
export type MarketplaceSort = (typeof MARKETPLACE_SORTS)[number];
export const MARKETPLACE_SORT_LABELS: Record<MarketplaceSort, string> = {
  newest: "Newest", oldest: "Oldest", price_asc: "Price: low to high", price_desc: "Price: high to low",
  mileage_asc: "Mileage: low to high", recently_inspected: "Recently inspected",
};

export const TRANSMISSION_OPTIONS = ["Automatic", "Manual", "CVT"] as const;
export const DRIVETRAIN_OPTIONS = ["AWD", "4WD", "RWD", "FWD"] as const;
export const BODY_STYLE_OPTIONS = ["Sedan", "Coupe", "Hatchback", "Wagon", "SUV", "Truck", "Convertible", "Van"] as const;
export const SELLER_TYPES = ["member", "technician"] as const;
export const SELLER_TYPE_LABELS: Record<(typeof SELLER_TYPES)[number], string> = { member: "Private seller", technician: "Technician / shop" };

const optionalText = (max: number) => z.string().trim().max(max).optional();
const optionalInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max).optional();

export const marketplaceFiltersSchema = z.object({
  q: optionalText(100),
  make: optionalText(40),
  model: optionalText(60),
  minYear: optionalInt(1886, 2100),
  maxYear: optionalInt(1886, 2100),
  /** Dollars. */
  maxPrice: optionalInt(0, 10_000_000),
  maxMileage: optionalInt(0, 2_000_000),
  transmission: optionalText(30),
  drivetrain: optionalText(30),
  bodyStyle: optionalText(30),
  region: optionalText(80),
  inspected: z.coerce.boolean().optional(),
  sellerType: z.enum(SELLER_TYPES).optional(),
  sort: z.enum(MARKETPLACE_SORTS).optional(),
});
export type MarketplaceFilters = z.infer<typeof marketplaceFiltersSchema>;

const FILTER_KEYS = Object.keys(marketplaceFiltersSchema.shape) as Array<keyof MarketplaceFilters>;

/** Parse a query string / record; unknown or invalid fields are dropped. */
export function parseMarketplaceFilters(input: Record<string, string | string[] | undefined> | URLSearchParams): MarketplaceFilters {
  const raw: Record<string, unknown> = {};
  for (const key of FILTER_KEYS) {
    const value = input instanceof URLSearchParams ? input.get(key) : input[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single === undefined || single === null || single === "") continue;
    raw[key] = key === "inspected" ? single === "true" || single === "1" || single === "on" : single;
  }
  const parsed = marketplaceFiltersSchema.safeParse(raw);
  if (!parsed.success) return {};
  return cleanFilters(parsed.data);
}

/** Drop empty strings and the default sort so saved searches stay minimal. */
export function cleanFilters(filters: MarketplaceFilters): MarketplaceFilters {
  const cleaned: MarketplaceFilters = {};
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value === undefined || value === "" || value === false) continue;
    if (key === "sort" && value === "newest") continue;
    (cleaned as Record<string, unknown>)[key] = value;
  }
  return cleaned;
}

export function filtersToSearchParams(filters: MarketplaceFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = cleanFilters(filters)[key];
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
}

/** Whether anything narrows the results (sort alone does not). */
export function hasActiveFilters(filters: MarketplaceFilters): boolean {
  return Object.keys(cleanFilters(filters)).some((key) => key !== "sort");
}

/** Short human summary for saved-search chips and notices. */
export function describeFilters(filters: MarketplaceFilters): string {
  const f = cleanFilters(filters);
  const bits: string[] = [];
  if (f.q) bits.push(`“${f.q}”`);
  if (f.make || f.model) bits.push([f.make, f.model].filter(Boolean).join(" "));
  if (f.minYear || f.maxYear) bits.push(`${f.minYear ?? "…"}–${f.maxYear ?? "…"}`);
  if (f.maxPrice) bits.push(`≤ $${f.maxPrice.toLocaleString()}`);
  if (f.maxMileage) bits.push(`≤ ${f.maxMileage.toLocaleString()} mi`);
  for (const key of ["transmission", "drivetrain", "bodyStyle", "region"] as const) if (f[key]) bits.push(f[key]!);
  if (f.inspected) bits.push("Inspected");
  if (f.sellerType) bits.push(SELLER_TYPE_LABELS[f.sellerType]);
  return bits.join(" · ") || "All listings";
}
