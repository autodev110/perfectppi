import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getMediaPackage } from "@/features/media/queries";
import { updateMediaPackage, deleteMediaPackage } from "@/features/media/actions";
import { z } from "zod";

const itemSchema = z.object({
  type: z.enum(["image", "video", "file"]),
  url: z.string().url(),
  name: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  items: z.array(itemSchema).min(1).optional(),
});

// GET /api/media-packages/[id] — get a single media package
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const data = await getMediaPackage(id);
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

// PATCH /api/media-packages/[id] — update a media package
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await updateMediaPackage({ id, ...parsed.data });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/media-packages/[id] — delete a media package
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await deleteMediaPackage(id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
