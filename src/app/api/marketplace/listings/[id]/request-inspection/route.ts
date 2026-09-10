import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { requestMarketplaceInspection } from "@/features/marketplace/actions";

const bodySchema = z.object({
  scope: z.enum(["complete", "dents_tires"]).default("complete"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid inspection type" }, { status: 400 });
  }

  const { id } = await params;
  const result = await requestMarketplaceInspection(
    { listingId: id, scope: parsed.data.scope },
  );
  if (!result.data) {
    const status = result.error.includes("no longer available") ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: result.data }, { status: result.data.created ? 201 : 200 });
}
