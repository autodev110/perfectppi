import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import {
  deleteCommunityPostById,
  updateMyCommunityPostStatus,
} from "@/features/community/actions";

const statusSchema = z.object({
  status: z.enum(["active", "archived"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = statusSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid post status" }, { status: 400 });
  }

  const { id } = await params;
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
