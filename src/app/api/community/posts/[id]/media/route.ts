import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { addCommunityPostMedia } from "@/features/community/actions";
import { PUBLICATION_OUTCOME_STATUS } from "@/lib/moderation/launch-policy";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await addCommunityPostMedia({
    postId: id,
    creationToken: body?.creationToken,
    items: body?.items,
  });

  if ("error" in result) {
    const code = "code" in result ? result.code : undefined;
    const retryAfterSeconds = "retryAfterSeconds" in result
      ? result.retryAfterSeconds
      : undefined;
    const response = NextResponse.json(
      { error: result.error, code: code ?? null, retryAfterSeconds: retryAfterSeconds ?? null },
      { status: code ? PUBLICATION_OUTCOME_STATUS[code] : 400 },
    );
    if (retryAfterSeconds) {
      response.headers.set("Retry-After", String(retryAfterSeconds));
    }
    return response;
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
