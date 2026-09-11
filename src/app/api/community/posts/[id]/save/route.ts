import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { setCommunityPostSave } from "@/features/community/actions";

const bodySchema = z.object({ saved: z.boolean() });

// POST /api/community/posts/<id>/save { saved } — private bookmark toggle.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const postId = z.string().uuid().safeParse((await params).id);
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!postId.success || !body.success) {
    return NextResponse.json({ error: "Invalid save request" }, { status: 400 });
  }

  const result = await setCommunityPostSave({ postId: postId.data, saved: body.data.saved });
  if (result.error !== undefined) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ data: result.data });
}
