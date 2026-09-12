import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { removeSavedCollection, savedCollectionNameSchema, upsertSavedCollection } from "@/features/saved/collections";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
const paramsSchema = z.object({ id: z.string().uuid() });
const updateSchema = z.object({ name: savedCollectionNameSchema });
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const parsedParams = paramsSchema.safeParse(await params);
  const parsedBody = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !parsedBody.success) return NextResponse.json({ error: "Enter a valid collection name" }, { status: 400 });
  try {
    const data = await upsertSavedCollection(auth.profile.id, parsedParams.data.id, parsedBody.data.name);
    return NextResponse.json({ data: { ...data } });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "23505") return NextResponse.json({ error: "You already have a collection with that name" }, { status: 409 });
    if (code === "P0002") return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    return NextResponse.json({ error: "The collection could not be renamed" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid collection" }, { status: 400 });
  try {
    const removed = await removeSavedCollection(auth.profile.id, parsed.data.id);
    if (!removed) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    return NextResponse.json({ data: { removed: true } });
  } catch {
    return NextResponse.json({ error: "The collection could not be deleted" }, { status: 500 });
  }
}
