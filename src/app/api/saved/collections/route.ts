import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { listSavedCollections, savedCollectionNameSchema, upsertSavedCollection } from "@/features/saved/collections";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
const createSchema = z.object({ name: savedCollectionNameSchema });

export async function GET() {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  try {
    const data = await listSavedCollections(auth.profile.id);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Your collections are temporarily unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    const data = await upsertSavedCollection(auth.profile.id, null, parsed.data.name);
    return NextResponse.json({ data: { ...data, item_count: 0 } }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "23505") return NextResponse.json({ error: "You already have a collection with that name" }, { status: 409 });
    if (code === "54000") return NextResponse.json({ error: "You can create up to 30 collections" }, { status: 409 });
    return NextResponse.json({ error: "The collection could not be created" }, { status: 500 });
  }
}
