import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { castCommunityPollVote } from "@/features/community/actions";

const bodySchema = z.object({ optionKey: z.string().min(1).max(32) });

// POST /api/community/posts/<id>/vote { optionKey } — one vote per account,
// changeable until the poll closes; returns the viewer's results view.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const postId = z.string().uuid().safeParse((await params).id);
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!postId.success || !body.success) return NextResponse.json({ error: "Invalid poll vote" }, { status: 400 });
  const result = await castCommunityPollVote({ postId: postId.data, optionKey: body.data.optionKey });
  if (result.error !== undefined) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
