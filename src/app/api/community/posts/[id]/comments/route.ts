import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { createCommunityCommentFromInput } from "@/features/community/actions";
import { PUBLICATION_OUTCOME_STATUS } from "@/lib/moderation/launch-policy";

const commentSchema = z.object({
  content: z.string().trim().min(1).max(600),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }

  const { id } = await params;
  const result = await createCommunityCommentFromInput({
    postId: id,
    content: parsed.data.content,
  });

  if (result.error !== undefined) {
    const response = NextResponse.json(
      {
        error: result.error,
        code: result.code ?? null,
        retryAfterSeconds: result.retryAfterSeconds ?? null,
      },
      { status: result.code ? PUBLICATION_OUTCOME_STATUS[result.code] : 400 },
    );
    if (result.retryAfterSeconds) {
      response.headers.set("Retry-After", String(result.retryAfterSeconds));
    }
    return response;
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
