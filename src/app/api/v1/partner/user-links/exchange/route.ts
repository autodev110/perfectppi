import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePartnerRequest } from "@/features/partner/auth";
import { partnerError } from "@/features/partner/errors";
import { exchangeUserLinkCode } from "@/features/partner/user-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/v1/partner/user-links/exchange
//
// Redeems the one-time authorization code for a durable mapping. The technician
// is not involved: this is a server-to-server call authenticated by the
// connection token, which is why report delivery later never depends on anyone
// still being signed in.
// ============================================================================

const bodySchema = z.object({
  code: z.string().trim().min(1).max(256),
  state: z.string().trim().min(1).max(256),
});

export async function POST(request: Request) {
  const auth = await authenticatePartnerRequest(request, {
    scope: "inspections:create",
    limit: "write",
  });
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return partnerError("invalid_request", "Body must be JSON.");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return partnerError("invalid_request", parsed.error.errors[0].message);
  }

  const result = await exchangeUserLinkCode(
    auth.connection,
    parsed.data.code,
    parsed.data.state,
  );

  if ("error" in result) {
    switch (result.error) {
      case "invalid_authorization_code":
        return partnerError("invalid_authorization_code");
      case "authorization_expired":
        return partnerError("authorization_expired");
      case "invalid_user_link":
        return partnerError("invalid_user_link");
      default:
        return partnerError("internal_error");
    }
  }

  return NextResponse.json(result.data, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
