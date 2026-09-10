import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { setAcceptedCommunityAnswerFromInput } from "@/features/community/actions";

const selectionSchema = z.object({
  commentId: z.string().uuid().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const postId = z.string().uuid().safeParse((await params).id);
  const body = selectionSchema.safeParse(await request.json().catch(() => null));
  if (!postId.success || !body.success) {
    return NextResponse.json({ error: "Invalid accepted answer selection." }, { status: 400 });
  }

  const result = await setAcceptedCommunityAnswerFromInput({
    postId: postId.data,
    commentId: body.data.commentId,
  });
  if (result.error !== undefined) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ data: result.data });
}
