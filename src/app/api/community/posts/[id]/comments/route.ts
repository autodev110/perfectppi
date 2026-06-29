import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { createCommunityCommentFromInput } from "@/features/community/actions";

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

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
