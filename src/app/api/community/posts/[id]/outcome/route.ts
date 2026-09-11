import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { setCommunityQuestionOutcome } from "@/features/community/actions";

const bodySchema = z.object({
  outcome: z.enum(["fixed", "helped", "not_fixed", "still_diagnosing"]).nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const postId = z.string().uuid().safeParse((await params).id);
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!postId.success || !body.success) {
    return NextResponse.json({ error: "Invalid question outcome" }, { status: 400 });
  }

  const result = await setCommunityQuestionOutcome({
    postId: postId.data,
    outcome: body.data.outcome,
  });
  if (result.error !== undefined) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ data: result.data });
}
