import { NextRequest, NextResponse } from "next/server";
import { getMarketplaceListings, getMarketplaceListingsCursorPage, getMarketplaceListingsPage } from "@/features/marketplace/queries";
import { createMarketplaceListingFromInput } from "@/features/marketplace/actions";
import { requireApiRole } from "@/features/auth/api";
import { parseMarketplaceFilters } from "@/lib/marketplace/filters";
import { decodeMarketplaceCursor } from "@/features/marketplace/cursor";

// GET /api/marketplace/listings?…filters — see src/lib/marketplace/filters.ts
// for the accepted keys (plan 25.1). With `page` the response is a page
// envelope `{ items, page, per_page, total, has_more }`; without it the
// full array is returned for older clients.
export async function GET(req: NextRequest) {
  const filters = parseMarketplaceFilters(req.nextUrl.searchParams);
  const cursorMode = req.nextUrl.searchParams.get("pagination") === "cursor";
  const rawCursor = req.nextUrl.searchParams.get("cursor");
  const cursor = rawCursor ? decodeMarketplaceCursor(rawCursor, filters) : null;
  if (cursorMode && rawCursor && !cursor) {
    return NextResponse.json(
      { error: "This Marketplace page link is invalid or no longer matches the filters." },
      { status: 400 },
    );
  }
  const pageParam = req.nextUrl.searchParams.get("page");
  try {
    if (cursorMode) {
      const data = await getMarketplaceListingsCursorPage(filters, cursor);
      return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (pageParam !== null) {
      const perPage = Number(req.nextUrl.searchParams.get("perPage") ?? "");
      const data = await getMarketplaceListingsPage(filters, Number(pageParam), Number.isInteger(perPage) && perPage > 0 ? perPage : undefined);
      return NextResponse.json({ data });
    }
    const data = await getMarketplaceListings(filters);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Marketplace listings are temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
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
