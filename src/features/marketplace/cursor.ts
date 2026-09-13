import { createHash } from "node:crypto";
import { z } from "zod";
import {
  cleanFilters,
  MARKETPLACE_SORTS,
  type MarketplaceFilters,
  type MarketplaceSort,
} from "@/lib/marketplace/filters";

const common = {
  v: z.literal(1),
  kind: z.literal("marketplace"),
  filters: z.string().length(43),
  id: z.string().uuid(),
};

const marketplaceCursorSchema = z.union([
  z.object({
    ...common,
    sort: z.enum(["newest", "oldest", "recently_inspected"]),
    timestamp: z.string().datetime({ offset: true }),
  }),
  z.object({
    ...common,
    sort: z.enum(["price_asc", "price_desc", "mileage_asc"]),
    numeric: z.number().finite().nonnegative(),
  }),
]);

export type MarketplaceCursor = z.infer<typeof marketplaceCursorSchema>;

export function marketplaceSort(filters: MarketplaceFilters): MarketplaceSort {
  return filters.sort && MARKETPLACE_SORTS.includes(filters.sort) ? filters.sort : "newest";
}

export function marketplaceFilterFingerprint(filters: MarketplaceFilters) {
  return createHash("sha256")
    .update(JSON.stringify(cleanFilters(filters)))
    .digest("base64url");
}

export function encodeMarketplaceCursor(cursor: MarketplaceCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeMarketplaceCursor(
  value: string | null | undefined,
  filters: MarketplaceFilters,
): MarketplaceCursor | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed = marketplaceCursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    if (parsed.data.sort !== marketplaceSort(filters)) return null;
    if (parsed.data.filters !== marketplaceFilterFingerprint(filters)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
