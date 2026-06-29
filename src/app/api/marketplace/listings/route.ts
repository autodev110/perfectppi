import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getMarketplaceListings,
  type MarketplaceFilters,
} from "@/features/marketplace/queries";
import { createMarketplaceListingFromInput } from "@/features/marketplace/actions";
import { requireApiRole } from "@/features/auth/api";

const sortSchema = z.enum(["newest", "oldest", "price_asc", "price_desc", "mileage_asc"]);

function numberParam(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sort = sortSchema.safeParse(params.get("sort"));

  const filters: MarketplaceFilters = {
    q: params.get("q") ?? undefined,
    make: params.get("make") ?? undefined,
    model: params.get("model") ?? undefined,
    minYear: numberParam(params.get("minYear")),
    maxYear: numberParam(params.get("maxYear")),
    maxPrice: numberParam(params.get("maxPrice")),
    sort: sort.success ? sort.data : undefined,
  };

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
