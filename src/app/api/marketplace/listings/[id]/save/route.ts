import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { setMarketplaceListingSave } from "@/features/marketplace/actions";

const bodySchema = z.object({ saved: z.boolean() });

// POST /api/marketplace/listings/<id>/save { saved } — private bookmark.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;
  const id = z.string().uuid().safeParse((await params).id);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) return NextResponse.json({ error: "Invalid save request" }, { status: 400 });

  const result = await setMarketplaceListingSave({ listingId: id.data, saved: body.data.saved });
  if (!result.data) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
