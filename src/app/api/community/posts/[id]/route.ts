import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import {
  deleteCommunityPostById,
  editCommunityPostFromInput,
  updateMyCommunityPostStatus,
} from "@/features/community/actions";
import { getCommunityPostById } from "@/features/community/queries";
import { PUBLICATION_OUTCOME_STATUS } from "@/lib/moderation/launch-policy";

// PATCH either changes the author's archive state or, with `content`, edits
// the text (plan 14.6). One field per request.
const statusSchema = z.object({
  status: z.enum(["active", "archived"]),
});
const editSchema = z.object({
  content: z.string().trim().min(1).max(1200),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const parsed = z.string().uuid().safeParse((await params).id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const data = await getCommunityPostById(parsed.data);
  if (!data) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const { id } = await params;

  const edit = editSchema.safeParse(body);
  if (edit.success) {
    const edited = await editCommunityPostFromInput({ postId: id, content: edit.data.content });
    if (edited.error !== undefined) {
      return NextResponse.json(
        { error: edited.error, code: edited.code ?? null },
        { status: edited.code ? PUBLICATION_OUTCOME_STATUS[edited.code] : 400 },
      );
    }
    return NextResponse.json({ data: edited.data });
  }

  const parsed = statusSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid post status" }, { status: 400 });
  }

  const result = await updateMyCommunityPostStatus(id, parsed.data.status);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await deleteCommunityPostById(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result });
}
