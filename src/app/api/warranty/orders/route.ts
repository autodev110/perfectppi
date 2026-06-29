import { NextRequest, NextResponse } from "next/server";
import { selectPlan } from "@/features/warranty/actions";
import { getMyWarranties } from "@/features/warranty/queries";
import { z } from "zod";

const selectPlanSchema = z.object({
  warrantyOptionId: z.string().uuid(),
  planIndex: z.number().int().min(0),
});

// GET /api/warranty/orders — mobile warranty inbox
export async function GET() {
  const data = await getMyWarranties();
  return NextResponse.json({ data });
}

// POST /api/warranty/orders — plan selection, creates warranty_orders row
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = selectPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await selectPlan(parsed.data.warrantyOptionId, parsed.data.planIndex);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}
