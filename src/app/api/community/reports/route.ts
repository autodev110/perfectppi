import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { reportCommunityContent } from "@/features/moderation/actions";

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
  if (result?.error) {
    const status = result.error.includes("already") ? 409 : result.error.includes("rate limit") ? 429 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result, { status: 201 });
}
