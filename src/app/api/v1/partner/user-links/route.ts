import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePartnerRequest } from "@/features/partner/auth";
import { partnerError } from "@/features/partner/errors";
import { initiateUserLinkTransaction } from "@/features/partner/user-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/v1/partner/user-links
//
// Starts the account-linking handshake. DealerSpace authenticates with its
// connection token and names one of its staff members; Perfect PPI returns a
// browser URL for that person to open.
//
// Nothing is linked here. The mapping only exists once the technician signs in
// to Perfect PPI and consents.
// ============================================================================

const bodySchema = z.object({
  externalUserId: z.string().trim().min(1).max(128),
});

export async function POST(request: Request) {
  const auth = await authenticatePartnerRequest(request, {
    // Linking exists to enable send-and-self-assign, so it draws on the same
    // authority as creating an inspection.
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

  const result = await initiateUserLinkTransaction(
    auth.connection,
    parsed.data.externalUserId,
  );

  if ("error" in result) {
    return partnerError(
      result.error === "link_callback_not_configured"
        ? "link_callback_not_configured"
        : "internal_error",
    );
  }

  return NextResponse.json(result.data, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
