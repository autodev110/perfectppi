import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { setCommunityCommentHelpful } from "@/features/community/actions";

const bodySchema = z.object({ helpful: z.boolean() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const commentId = z.string().uuid().safeParse((await params).id);
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!commentId.success || !body.success) {
    return NextResponse.json({ error: "Invalid Helpful reaction" }, { status: 400 });
  }

  const result = await setCommunityCommentHelpful({
    commentId: commentId.data,
    helpful: body.data.helpful,
  });
  if (result.error !== undefined) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ data: result.data });
}
