import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getFeatureFlags, toClientCapabilities } from "@/lib/feature-flags";

// Read-only, authenticated capability view (plan section 30.2). The app uses
// it to hide or explain unavailable UI; every mutation endpoint re-checks the
// server-side flag independently, so this response is never an authorization.
export async function GET() {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const snapshot = await getFeatureFlags();
  return NextResponse.json(toClientCapabilities(snapshot), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
