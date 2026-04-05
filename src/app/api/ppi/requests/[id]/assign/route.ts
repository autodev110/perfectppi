import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { assignTech } from "@/features/ppi/actions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await request.json();

  if (!body.tech_profile_id) {
    return NextResponse.json({ error: "tech_profile_id is required" }, { status: 400 });
  }

  const result = await assignTech(id, body.tech_profile_id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
