import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createCommunityPostFromInput } from "@/features/community/actions";
import { getCommunityPosts } from "@/features/community/queries";
import { PUBLICATION_OUTCOME_STATUS } from "@/lib/moderation/launch-policy";

export async function GET() {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const data = await getCommunityPosts();
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const result = await createCommunityPostFromInput(body);

  if (result.error !== undefined) {
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.code ? PUBLICATION_OUTCOME_STATUS[result.code] : 400 },
    );
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
