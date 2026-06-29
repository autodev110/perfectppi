import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createCommunityPostFromInput } from "@/features/community/actions";
import { getCommunityPosts } from "@/features/community/queries";

export async function GET() {
  const data = await getCommunityPosts();
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const result = await createCommunityPostFromInput(body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result }, { status: 201 });
}
