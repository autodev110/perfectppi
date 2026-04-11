import { NextRequest, NextResponse } from "next/server";
import { initiatePayment } from "@/features/warranty/actions";
import { z } from "zod";

const initiateSchema = z.object({
  contractId: z.string().uuid(),
});

// POST /api/warranty/payments — create Stripe checkout for a signed contract
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = initiateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await initiatePayment(parsed.data.contractId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
