import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { applyModerationReview } from "@/features/moderation/actions";

const bodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().trim().max(1000).optional(),
}).strict();

const STATUS = { invalid: 400, forbidden: 403, not_found: 404, safeguard_required: 409, failed: 500 } as const;

// POST /api/admin/moderation/items/<id>/review — approve or reject held
// media from the iOS admin screen. Same capability checks and safeguard gate
// as the web form; legal holds and account actions stay on the web.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid review" }, { status: 400 });
  }
  const result = await applyModerationReview(
    { itemId: id, decision: parsed.data.decision, notes: parsed.data.notes, enforcement: "none" },
    auth.profile.id,
  );
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: STATUS[result.code] });
  return NextResponse.json({ data: { itemId: result.itemId, status: result.status } });
}
