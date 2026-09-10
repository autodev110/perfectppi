import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { finalizeCommunityPostAssembly } from "@/features/community/actions";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const postId = z.string().uuid().safeParse((await params).id);
  if (!postId.success) {
    return NextResponse.json({ error: "Invalid post draft." }, { status: 400 });
  }
  const result = await finalizeCommunityPostAssembly({ postId: postId.data });
  if (result.error !== undefined) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
  }
  return NextResponse.json({ data: result.data });
}
