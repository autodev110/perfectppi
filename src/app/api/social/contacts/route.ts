import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { discoverContacts } from "@/features/social/contact-discovery";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

export async function POST(request: Request) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;

  const result = await discoverContacts(await request.json().catch(() => null));
  if (!result.results) {
    const status = result.retryAfter ? 429 : 400;
    const response = NextResponse.json({ error: result.error }, { status });
    if (result.retryAfter) response.headers.set("Retry-After", String(result.retryAfter));
    return response;
  }
  return NextResponse.json({ data: result.results }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
