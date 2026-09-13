import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getSavedMarketplaceListings, getSavedMarketplaceListingsPage } from "@/features/marketplace/queries";
import { decodeSavedCursor } from "@/features/saved/cursor";

const querySchema = z.object({
  page: z.coerce.number().int().positive().max(10_000).default(1),
  pagination: z.literal("cursor").optional(),
  cursor: z.string().max(256).optional(),
});

// GET /api/marketplace/saved?page= — the caller's saved listings, newest save first.
export async function GET(request: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const parsed = querySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pagination: request.nextUrl.searchParams.get("pagination") ?? undefined,
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  const cursor = parsed.data.cursor ? decodeSavedCursor(parsed.data.cursor, "listings") : null;
  if (parsed.data.pagination === "cursor" && parsed.data.cursor && !cursor) {
    return NextResponse.json({ error: "This saved-listings page link is invalid." }, { status: 400 });
  }
  try {
    const data = parsed.data.pagination === "cursor"
      ? await getSavedMarketplaceListingsPage(cursor, 20)
      : await getSavedMarketplaceListings(parsed.data.page, 20);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Saved listings are temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
