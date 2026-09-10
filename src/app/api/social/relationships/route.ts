import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getMySafetyRelationships, setSocialRelationship } from "@/features/social/relationships";

const ROLES = ["consumer", "technician", "org_manager", "admin"] as const;

export async function GET() {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ data: await getMySafetyRelationships() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiRole([...ROLES]);
  if ("response" in auth) return auth.response;
  const result = await setSocialRelationship(await request.json().catch(() => null));
  if (!result.data) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ data: result.data });
}
