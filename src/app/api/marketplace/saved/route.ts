import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getSavedMarketplaceListings } from "@/features/marketplace/queries";

const querySchema = z.object({ page: z.coerce.number().int().positive().max(10_000).default(1) });

// GET /api/marketplace/saved?page= — the caller's saved listings, newest save first.
export async function GET(request: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const parsed = querySchema.safeParse({ page: request.nextUrl.searchParams.get("page") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  const data = await getSavedMarketplaceListings(parsed.data.page, 20);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}
