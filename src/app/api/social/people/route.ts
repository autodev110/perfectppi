import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { friendsDiscoveryEnabled, searchPeople } from "@/features/social/friends";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

// GET /api/social/people?q=<text>&page=<n>
// The database applies discoverability, exact-username lookup, blocks, and
// account state; nothing is filtered client-side.
export async function GET(request: NextRequest) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;

  const headers = { "Cache-Control": "private, no-store" };
  if (!(await friendsDiscoveryEnabled())) {
    return NextResponse.json({ data: { results: [], hasMore: false, enabled: false } }, { headers });
  }

  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const page = Number(params.get("page") ?? "1");
  const { results, hasMore, outcome, retryAfter } = await searchPeople(
    query,
    Number.isInteger(page) ? page : 1,
  );
  if (outcome === "rate_limited") {
    return NextResponse.json(
      { error: "Too many searches. Please slow down." },
      { status: 429, headers: { ...headers, "Retry-After": String(retryAfter ?? 60) } },
    );
  }
  if (outcome === "unavailable") {
    return NextResponse.json(
      { error: "People search is temporarily unavailable." },
      { status: 503, headers },
    );
  }
  return NextResponse.json({ data: { results, hasMore, enabled: true } }, { headers });
}
