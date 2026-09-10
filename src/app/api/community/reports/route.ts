import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { reportCommunityContent, type ReportErrorCode } from "@/features/moderation/actions";

// Plan section 16.3: 201 when this call creates a report, 200 for an
// idempotent retry/duplicate, structured codes for everything else.
const ERROR_STATUS: Record<ReportErrorCode, number> = {
  validation: 400,
  unauthenticated: 401,
  content_unavailable: 410,
  rate_limited: 429,
  reporting_restricted: 403,
  unavailable: 503,
};

export async function POST(request: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const formData = new FormData();
  formData.set("entity_type", String(body?.entityType ?? ""));
  formData.set("entity_id", String(body?.entityId ?? ""));
  formData.set("reason_code", String(body?.reasonCode ?? ""));
  formData.set("report_context", String(body?.contextToken ?? ""));
  if (body?.details) formData.set("details", String(body.details));
  const result = await reportCommunityContent(formData);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: ERROR_STATUS[result.code], headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(result, {
    status: result.data.duplicate ? 200 : 201,
    headers: { "Cache-Control": "no-store" },
  });
}
