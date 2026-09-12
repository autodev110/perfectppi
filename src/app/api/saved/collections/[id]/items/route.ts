import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getSavedCollectionItems, removeSavedCollectionItem, savedCollectionEntitySchema, setSavedCollectionItem } from "@/features/saved/collections";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  entityType: savedCollectionEntitySchema,
  entityId: z.string().uuid(),
  saved: z.boolean().default(true),
});
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid collection" }, { status: 400 });
  try {
    const data = await getSavedCollectionItems(auth.profile.id, parsed.data.id);
    if (!data) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "This collection is temporarily unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const parsedParams = paramsSchema.safeParse(await params);
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !parsedBody.success) return NextResponse.json({ error: "Invalid saved item" }, { status: 400 });
  try {
    const saved = await setSavedCollectionItem({
      profileId: auth.profile.id,
      collectionId: parsedParams.data.id,
      ...parsedBody.data,
    });
    return NextResponse.json({ data: { saved } });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P0002") return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    if (code === "42501") return NextResponse.json({ error: "This item is no longer available" }, { status: 404 });
    if (code === "54000") return NextResponse.json({ error: "A collection can hold up to 200 items" }, { status: 409 });
    return NextResponse.json({ error: "The saved item could not be updated" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const parsedParams = paramsSchema.safeParse(await params);
  const parsedBody = z.object({ itemId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !parsedBody.success) return NextResponse.json({ error: "Invalid saved item" }, { status: 400 });
  try {
    const removed = await removeSavedCollectionItem(auth.profile.id, parsedParams.data.id, parsedBody.data.itemId);
    if (!removed) return NextResponse.json({ error: "Saved item not found" }, { status: 404 });
    return NextResponse.json({ data: { removed: true } });
  } catch {
    return NextResponse.json({ error: "The saved item could not be removed" }, { status: 500 });
  }
}
