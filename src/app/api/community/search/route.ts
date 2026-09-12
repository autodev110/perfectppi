import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { isSearchTab, normalizeSearchQuery, SEARCH_TABS, unifiedSearch } from "@/features/search/queries";

// GET /api/community/search?q=&tab=posts|people|groups|vehicles|listings|technicians&page=
// Unified search (plan 27.2). Results are visibility-checked in the database
// for the signed-in member; recent searches stay on the device.
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const query = normalizeSearchQuery(req.nextUrl.searchParams.get("q"));
  const tabParam = req.nextUrl.searchParams.get("tab") ?? "posts";
  if (!isSearchTab(tabParam)) {
    return NextResponse.json({ error: `tab must be one of ${SEARCH_TABS.join(", ")}` }, { status: 400 });
  }
  const requestedPage = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const results = await unifiedSearch(query, tabParam, page);
  return NextResponse.json({ data: results }, { headers: { "Cache-Control": "private, no-store" } });
}
