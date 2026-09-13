import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { setCommunityQuestionOutcome } from "@/features/community/actions";
import { getCommunityQuestionOutcomeHistory } from "@/features/community/queries";

const bodySchema = z.object({
  outcome: z.enum(["fixed", "helped", "not_fixed", "still_diagnosing"]).nullable(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const postId = z.string().uuid().safeParse((await params).id);
  if (!postId.success) {
    return NextResponse.json({ error: "Invalid question" }, { status: 400 });
  }
  try {
    const history = await getCommunityQuestionOutcomeHistory(postId.data);
    if (!history) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    return NextResponse.json({ data: history }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Question outcome history is temporarily unavailable." },
      { status: 500 },
    );
  }
}

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
