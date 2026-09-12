import { NextRequest, NextResponse } from "next/server";
import { getMarketplaceListings, getMarketplaceListingsPage } from "@/features/marketplace/queries";
import { createMarketplaceListingFromInput } from "@/features/marketplace/actions";
import { requireApiRole } from "@/features/auth/api";
import { parseMarketplaceFilters } from "@/lib/marketplace/filters";

// GET /api/marketplace/listings?…filters — see src/lib/marketplace/filters.ts
// for the accepted keys (plan 25.1). With `page` the response is a page
// envelope `{ items, page, per_page, total, has_more }`; without it the
// full array is returned for older clients.
export async function GET(req: NextRequest) {
  const filters = parseMarketplaceFilters(req.nextUrl.searchParams);
  const pageParam = req.nextUrl.searchParams.get("page");
  if (pageParam !== null) {
    const perPage = Number(req.nextUrl.searchParams.get("perPage") ?? "");
    const data = await getMarketplaceListingsPage(filters, Number(pageParam), Number.isInteger(perPage) && perPage > 0 ? perPage : undefined);
    return NextResponse.json({ data });
  }
  const data = await getMarketplaceListings(filters);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const result = await createMarketplaceListingFromInput(body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
