import { NextRequest, NextResponse } from "next/server";
import { presentContract } from "@/features/warranty/actions";
import { z } from "zod";

const presentContractSchema = z.object({
  orderId: z.string().uuid(),
});

// POST /api/warranty/contracts — create or fetch the DocuSeal contract for an order
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = presentContractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await presentContract(parsed.data.orderId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
