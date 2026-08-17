import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { sendInspectionToDealerSpace } from "@/features/partner/send-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/ppi/requests/:id/dealerspace/send
//
// HTTP entry point for "Send to DealerSpace", so iOS can trigger the same
// delivery the web button does. Authorization, the four-artifact gate and
// idempotency all live in the shared action — this route only adapts it to a
// request/response pair.
// ============================================================================

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await sendInspectionToDealerSpace(id);

  if ("error" in result) {
    const status = result.error.includes("Not authenticated")
      ? 401
      : result.error.includes("Only the assigned technician")
        ? 403
        : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: result.data });
}
