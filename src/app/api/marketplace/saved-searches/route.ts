import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { listSavedSearches, saveSearch, type SavedSearchResult } from "@/features/marketplace/saved-searches";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;
const STATUS: Record<Exclude<SavedSearchResult, { ok: true }>["outcome"], number> = {
  invalid: 400, unauthenticated: 401, limit: 409, not_found: 404, failed: 500,
};

// GET /api/marketplace/saved-searches — the member's saved searches.
export async function GET() {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ data: { searches: await listSavedSearches() } }, { headers: { "Cache-Control": "private, no-store" } });
}

// POST /api/marketplace/saved-searches { id?, name, filters, notify? } — create or update (plan 25.1).
export async function POST(request: NextRequest) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const result = await saveSearch(await request.json().catch(() => null));
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.outcome }, { status: STATUS[result.outcome] });
  return NextResponse.json({ data: result.search }, { status: 201 });
}
