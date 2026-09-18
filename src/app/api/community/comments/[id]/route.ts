import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import {
  editCommunityCommentFromInput,
  removeMyCommunityCommentById,
} from "@/features/community/actions";
import { PUBLICATION_OUTCOME_STATUS } from "@/lib/moderation/launch-policy";

const editSchema = z.object({
  content: z.string().trim().min(1).max(600),
});

// Author edit (plan 15.1): a new immutable revision; refused while a report
// is bound to the current one.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const commentId = z.string().uuid().safeParse((await params).id);
  const body = editSchema.safeParse(await req.json().catch(() => null));
  if (!commentId.success || !body.success) {
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }

  const result = await editCommunityCommentFromInput({
    commentId: commentId.data,
    content: body.data.content,
  });
  if (result.error !== undefined) {
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.code ? PUBLICATION_OUTCOME_STATUS[result.code] : 400 },
    );
  }
  return NextResponse.json({ data: result.data });
}

// Soft author removal; the row and its moderation history stay.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const commentId = z.string().uuid().safeParse((await params).id);
  if (!commentId.success) {
    return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  }

  const result = await removeMyCommunityCommentById(commentId.data);
  if (result.error !== undefined) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ data: result.data });
}
